import { EventEmitter } from 'node:events';

import {
  AudioPlayerStatus,
  createAudioPlayer,
  entersState,
  NoSubscriberBehavior,
} from '@discordjs/voice';

import { pickRelated } from '../audio/autoplay.js';
import { ExtractionError } from '../audio/errors.js';
import * as ffmpeg from '../audio/ffmpeg.js';
import { buildResource } from '../audio/resource.js';
import * as ytdlp from '../audio/ytdlp.js';
import { LoopMode, PLAYER_START_TIMEOUT_MS } from '../constants.js';
import { getSettings } from '../db/guildSettings.js';
import { guildLogger } from '../logger.js';
import { AsyncLock } from '../util/asyncQueue.js';
import { clampVolume } from '../util/validate.js';
import Queue from './Queue.js';
import VoiceSession from './VoiceSession.js';

/**
 * Per-guild playback state machine.
 *
 * Emits: trackStart, trackEnd, queueEnd, error, disconnect, volumeChange.
 * The command and UI layers subscribe to those rather than reaching inside.
 */
export class MusicPlayer extends EventEmitter {
  #resource = null;
  #ytdlpChild = null;
  #ffmpegChild = null;
  #idleTimer = null;
  #seeking = false;
  #skipping = false;
  #destroyed = false;
  #lock = new AsyncLock();
  #collectors = new Set();

  constructor(guild, { textChannel, maxQueueSize, idleTimeoutMs, volume }) {
    super();
    this.guild = guild;
    this.textChannel = textChannel;
    this.log = guildLogger(guild.id, 'player');

    this.queue = new Queue({ maxSize: maxQueueSize });
    this.volume = clampVolume(volume) ?? 50;
    this.idleTimeoutMs = idleTimeoutMs;

    /** Playback offset contributed by seeks; see `positionMs`. */
    this.seekOffsetMs = 0;

    this.audioPlayer = createAudioPlayer({
      behaviors: {
        // Pause rather than Play: a dropped subscription must not silently
        // burn through the whole queue.
        noSubscriber: NoSubscriberBehavior.Pause,
        maxMissedFrames: 50,
      },
    });

    this.voice = new VoiceSession(guild, this.audioPlayer, {
      onDead: () => this.destroy('disconnected'),
    });

    this.#wirePlayerEvents();
  }

  // --- public state ------------------------------------------------------

  get current() {
    return this.queue.current;
  }

  get isPaused() {
    return this.audioPlayer.state.status === AudioPlayerStatus.Paused;
  }

  get isPlaying() {
    return this.audioPlayer.state.status === AudioPlayerStatus.Playing;
  }

  get voiceChannelId() {
    return this.voice.channelId;
  }

  /**
   * Current position within the track.
   *
   * `resource.playbackDuration` restarts at zero every time a new resource is
   * created, which a seek always does — so the seek offset is tracked
   * separately and added back here.
   */
  get positionMs() {
    if (!this.#resource) return this.seekOffsetMs;
    return this.seekOffsetMs + this.#resource.playbackDuration;
  }

  // --- lifecycle ---------------------------------------------------------

  async connect(channel) {
    await this.voice.connect(channel);
    this.clearIdleTimer();
  }

  /**
   * Add tracks and start playback if idle.
   * Returns the number of tracks accepted (the queue cap may reject some).
   */
  async enqueue(tracks) {
    const added = this.queue.add(tracks);
    this.clearIdleTimer();

    if (!this.current && this.audioPlayer.state.status === AudioPlayerStatus.Idle) {
      await this.#lock.run(() => this.#advance());
    }
    return added;
  }

  async skip(amount = 1) {
    return this.#lock.run(async () => {
      if (!this.current) return false;
      // A track-loop would otherwise replay the same song forever. Advancing
      // here rather than letting the Idle handler do it keeps the loop-mode
      // suppression deterministic — re-arming it on a timer would race the
      // handler, which queues behind this very lock.
      const restoreLoop = this.queue.loopMode === LoopMode.TRACK;
      if (restoreLoop) this.queue.loopMode = LoopMode.OFF;

      this.queue.skip(amount);
      this.#killChildren();

      // Suppress the Idle handler's own advance for this stop.
      this.#skipping = true;
      this.audioPlayer.stop(true);
      this.#skipping = false;

      try {
        await this.#advance();
      } finally {
        if (restoreLoop) this.queue.loopMode = LoopMode.TRACK;
      }
      return true;
    });
  }

  pause() {
    return this.audioPlayer.pause(true);
  }

  resume() {
    return this.audioPlayer.unpause();
  }

  /** Clear the queue and stop. Keeps the voice connection unless told not to. */
  async stop({ disconnect = true } = {}) {
    return this.#lock.run(async () => {
      this.queue.reset();
      this.#killChildren();

      // The queue is already empty; let the Idle handler skip its advance
      // rather than emit a spurious queueEnd.
      this.#skipping = true;
      this.audioPlayer.stop(true);
      this.#skipping = false;

      if (disconnect) {
        this.destroy('stopped');
      } else {
        this.startIdleTimer();
      }
    });
  }

  setVolume(level) {
    const value = clampVolume(level);
    if (value === null) return null;
    this.volume = value;
    if (this.#resource?.volume) {
      this.#resource.volume.setVolumeLogarithmic(value / 100);
    }
    this.emit('volumeChange', value);
    return value;
  }

  /**
   * Jump to a position in the current track.
   *
   * There's no seek primitive in @discordjs/voice, so the pipeline is rebuilt
   * from a direct media URL — the one place a piped stream won't do, because
   * ffmpeg can only issue a Range request against a real URL.
   */
  async seek(targetMs) {
    return this.#lock.run(async () => {
      const track = this.current;
      if (!track) throw new Error('Nothing is playing.');
      if (track.isLive) throw new Error("Live streams can't be seeked.");
      if (targetMs < 0 || (track.durationMs && targetMs >= track.durationMs)) {
        throw new Error('That position is outside the track.');
      }

      this.#seeking = true;
      try {
        this.#killChildren();
        this.audioPlayer.stop(true);

        const directUrl = await ytdlp.getDirectUrl(track.url);
        const ffmpegChild = ffmpeg.spawnSeek(directUrl, targetMs);
        this.#ffmpegChild = ffmpegChild;

        this.seekOffsetMs = targetMs;
        this.#resource = buildResource(ffmpegChild.stdout, {
          volume: this.volume,
          metadata: { track, guildId: this.guild.id },
        });

        this.audioPlayer.play(this.#resource);
        await entersState(this.audioPlayer, AudioPlayerStatus.Playing, PLAYER_START_TIMEOUT_MS);
        return targetMs;
      } finally {
        this.#seeking = false;
      }
    });
  }

  // --- playback internals ------------------------------------------------

  #wirePlayerEvents() {
    this.audioPlayer.on(AudioPlayerStatus.Idle, (oldState) => {
      // Seek and skip both stop the player deliberately and handle the
      // transition themselves; neither is a natural track end.
      if (this.#seeking || this.#skipping || this.#destroyed) return;
      if (oldState.status !== AudioPlayerStatus.Playing) return;

      this.emit('trackEnd', this.current);
      this.#lock.run(() => this.#advance()).catch((error) => {
        this.log.error({ err: error }, 'Failed to advance queue');
      });
    });

    this.audioPlayer.on('error', (error) => {
      this.log.warn({ err: error }, 'Audio player error');
      this.emit('error', error, this.current);
      if (this.#destroyed) return;
      this.#lock.run(() => this.#advance()).catch(() => {});
    });
  }

  /** Move to the next track, falling back to autoplay, then to idle. */
  async #advance() {
    if (this.#destroyed) return;

    let track = this.queue.next();

    if (!track && this.queue.autoplay) {
      const seed = this.queue.previous[0] ?? null;
      if (seed) {
        try {
          const related = await pickRelated(seed, this.queue.previous);
          if (related) {
            this.queue.add(related);
            track = this.queue.next();
            this.emit('autoplay', track);
          }
        } catch (error) {
          this.log.debug({ err: error }, 'Autoplay lookup failed');
        }
      }
    }

    if (!track) {
      this.queue.current = null;
      this.#resource = null;
      this.emit('queueEnd');
      this.startIdleTimer();
      return;
    }

    await this.#startTrack(track);
  }

  async #startTrack(track) {
    this.clearIdleTimer();
    this.seekOffsetMs = 0;

    try {
      const ytdlpChild = ytdlp.openStream(track.url);
      const ffmpegChild = ffmpeg.spawnPipe(ytdlpChild.stdout);

      this.#ytdlpChild = ytdlpChild;
      this.#ffmpegChild = ffmpegChild;

      this.#resource = buildResource(ffmpegChild.stdout, {
        volume: this.volume,
        metadata: { track, guildId: this.guild.id },
      });

      this.audioPlayer.play(this.#resource);
      await entersState(this.audioPlayer, AudioPlayerStatus.Playing, PLAYER_START_TIMEOUT_MS);

      this.emit('trackStart', track);
    } catch (error) {
      // Prefer yt-dlp's own diagnosis over a generic timeout message.
      const stderr = this.#ytdlpChild?.collectedStderr ?? '';
      const reported =
        error instanceof ExtractionError
          ? error
          : stderr
            ? (await import('../audio/errors.js')).classifyError(stderr)
            : error;

      this.log.warn({ err: reported, track: track.title }, 'Failed to start track');
      this.#killChildren();
      this.emit('trackError', reported, track);

      // Don't let one bad track stall the whole queue.
      if (!this.#destroyed) {
        await this.#advance();
      }
    }
  }

  #killChildren() {
    for (const child of [this.#ffmpegChild, this.#ytdlpChild]) {
      if (!child || child.killed || child.exitCode !== null) continue;
      try {
        child.stdout?.unpipe?.();
        child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }
    this.#ffmpegChild = null;
    this.#ytdlpChild = null;
  }

  // --- idle handling -----------------------------------------------------

  startIdleTimer() {
    this.clearIdleTimer();
    if (this.#destroyed) return;
    this.#idleTimer = setTimeout(() => {
      this.log.info('Idle timeout reached; leaving voice');
      this.emit('idleTimeout');
      this.destroy('idle');
    }, this.idleTimeoutMs);
  }

  clearIdleTimer() {
    if (this.#idleTimer) {
      clearTimeout(this.#idleTimer);
      this.#idleTimer = null;
    }
  }

  // --- collectors --------------------------------------------------------

  /** Register a component collector so it can be cleaned up on destroy. */
  trackCollector(collector) {
    this.#collectors.add(collector);
    collector.once('end', () => this.#collectors.delete(collector));
  }

  // --- teardown ----------------------------------------------------------

  destroy(reason = 'destroyed') {
    if (this.#destroyed) return;
    this.#destroyed = true;

    this.clearIdleTimer();
    this.#killChildren();

    for (const collector of this.#collectors) {
      try {
        collector.stop('player-destroyed');
      } catch {
        // Already stopped.
      }
    }
    this.#collectors.clear();

    try {
      this.audioPlayer.stop(true);
    } catch {
      // Already stopped.
    }

    this.queue.reset();
    this.#resource = null;

    this.voice.destroy();
    this.emit('disconnect', reason);
    this.removeAllListeners();
  }

  get destroyed() {
    return this.#destroyed;
  }
}

/** Build a player seeded from the guild's saved settings. */
export function createPlayer(guild, textChannel, { maxQueueSize }) {
  const settings = getSettings(guild.id);
  const player = new MusicPlayer(guild, {
    textChannel,
    maxQueueSize,
    idleTimeoutMs: settings.idle_timeout_s * 1000,
    volume: settings.default_volume,
  });
  player.queue.autoplay = Boolean(settings.autoplay);
  return player;
}

export default MusicPlayer;
