import config from '../config.js';
import logger from '../logger.js';
import { createPlayer } from './MusicPlayer.js';

const log = logger.child({ module: 'players' });

/**
 * Owns the lifetime of every guild's MusicPlayer — and nothing else.
 * All playback behaviour lives in MusicPlayer itself.
 */
export class PlayerManager {
  #players = new Map();

  get(guildId) {
    return this.#players.get(guildId);
  }

  has(guildId) {
    return this.#players.has(guildId);
  }

  get size() {
    return this.#players.size;
  }

  /** Fetch the guild's player, creating one if needed. */
  getOrCreate(guild, textChannel) {
    const existing = this.#players.get(guild.id);
    if (existing && !existing.destroyed) {
      // Keep announcements pointed at the most recently used channel.
      if (textChannel) existing.textChannel = textChannel;
      return existing;
    }

    const player = createPlayer(guild, textChannel, {
      maxQueueSize: config.maxQueueSize,
    });

    player.once('disconnect', (reason) => {
      this.#players.delete(guild.id);
      log.debug({ guild: guild.id, reason }, 'Player removed');
    });

    this.#players.set(guild.id, player);
    return player;
  }

  destroy(guildId, reason = 'destroyed') {
    const player = this.#players.get(guildId);
    if (!player) return false;
    player.destroy(reason);
    this.#players.delete(guildId);
    return true;
  }

  /**
   * Tear down every player. Called on SIGTERM — without this the bot lingers
   * as a ghost in voice channels and leaves orphaned ffmpeg processes behind.
   */
  destroyAll(reason = 'shutdown') {
    for (const [guildId, player] of this.#players) {
      try {
        player.destroy(reason);
      } catch (error) {
        log.warn({ err: error, guild: guildId }, 'Error destroying player');
      }
    }
    this.#players.clear();
  }

  [Symbol.iterator]() {
    return this.#players.values();
  }
}

export default PlayerManager;
