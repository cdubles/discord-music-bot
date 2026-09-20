import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionDisconnectReason,
  VoiceConnectionStatus,
} from '@discordjs/voice';

import { VOICE_READY_TIMEOUT_MS, VOICE_RECONNECT_GRACE_MS } from '../constants.js';
import { guildLogger } from '../logger.js';

/**
 * Owns one guild's VoiceConnection and the reconnect policy around it.
 *
 * Emits nothing itself; the owning MusicPlayer supplies an `onDead` callback
 * invoked when the connection is gone for good.
 */
export class VoiceSession {
  connection = null;
  channelId = null;
  #subscription = null;
  #destroyed = false;

  constructor(guild, audioPlayer, { onDead } = {}) {
    this.guild = guild;
    this.audioPlayer = audioPlayer;
    this.onDead = onDead ?? (() => {});
    this.log = guildLogger(guild.id, 'voice');
  }

  get isReady() {
    return this.connection?.state.status === VoiceConnectionStatus.Ready;
  }

  /** Join (or move to) a voice channel and wait until audio can flow. */
  async connect(channel) {
    if (this.connection && this.channelId === channel.id) {
      return this.connection;
    }

    this.channelId = channel.id;
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.#attachHandlers();
    this.#subscription = this.connection.subscribe(this.audioPlayer);

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT_MS);
    } catch (error) {
      // Stuck in Signalling/Connecting: the UDP handshake never completed.
      this.destroy();
      throw new Error(
        "I couldn't connect to that voice channel. Try again, or check my permissions.",
        { cause: error },
      );
    }

    return this.connection;
  }

  #attachHandlers() {
    const connection = this.connection;

    connection.on(VoiceConnectionStatus.Disconnected, async (_old, newState) => {
      // 4014 means kicked, or the channel was deleted: do not fight it.
      const kicked =
        newState.reason === VoiceConnectionDisconnectReason.WebSocketClose &&
        newState.closeCode === 4014;

      if (kicked) {
        this.log.info('Disconnected by Discord (4014); tearing down');
        this.destroy();
        return;
      }

      // Otherwise it's usually a channel move or a transient drop, and the
      // connection re-signals on its own. Give it a grace period before
      // declaring it dead.
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, VOICE_RECONNECT_GRACE_MS),
          entersState(connection, VoiceConnectionStatus.Connecting, VOICE_RECONNECT_GRACE_MS),
        ]);
        this.log.debug('Voice connection is recovering on its own');
      } catch {
        this.log.info('Voice connection did not recover; tearing down');
        this.destroy();
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (!this.#destroyed) {
        this.#destroyed = true;
        this.onDead('destroyed');
      }
    });

    connection.on('error', (error) => {
      this.log.warn({ err: error }, 'Voice connection error');
    });
  }

  /** Track channel moves initiated from Discord's side. */
  setChannel(channelId) {
    this.channelId = channelId;
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;

    try {
      this.#subscription?.unsubscribe();
    } catch {
      // Already torn down.
    }
    this.#subscription = null;

    try {
      if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        this.connection.destroy();
      }
    } catch {
      // Already destroyed.
    }

    this.connection = null;
    this.onDead('destroyed');
  }
}

export default VoiceSession;
