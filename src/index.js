import { loadCommands } from './commands/index.js';
import config from './config.js';
import { SHUTDOWN_TIMEOUT_MS } from './constants.js';
import { createClient } from './client.js';
import PlayerManager from './core/PlayerManager.js';
import { closeDatabase } from './db/index.js';
import { getSettings } from './db/guildSettings.js';
import { loadEvents } from './events/index.js';
import logger from './logger.js';
import * as embeds from './ui/embeds.js';

const client = createClient();
client.players = new PlayerManager();

/**
 * Player events are announced in the text channel the command came from.
 * Wiring it here keeps MusicPlayer free of Discord message concerns.
 */
const originalGetOrCreate = client.players.getOrCreate.bind(client.players);
client.players.getOrCreate = (guild, textChannel) => {
  const player = originalGetOrCreate(guild, textChannel);

  if (!player.announcementsWired) {
    player.announcementsWired = true;

    player.on('trackStart', (track) => {
      if (!getSettings(guild.id).announce_tracks) return;
      player.textChannel?.send(embeds.trackStarted(track)).catch(() => {});
    });

    player.on('trackError', (error, track) => {
      player.textChannel
        ?.send(embeds.error(`Skipping **${track.title}** — ${error.message}`))
        .catch(() => {});
    });

    player.on('queueEnd', () => {
      player.textChannel
        ?.send(embeds.info("That's everything. Queue up more with `/play`."))
        .catch(() => {});
    });

    player.on('idleTimeout', () => {
      player.textChannel
        ?.send(embeds.info('Left the voice channel after a spell of quiet.'))
        .catch(() => {});
    });
  }

  return player;
};

await loadCommands(client);
await loadEvents(client);

// --- process-level safety nets --------------------------------------------

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception; exiting');
  shutdown('uncaughtException', 1);
});

let shuttingDown = false;

/**
 * Leave every voice channel and kill every child process before exiting.
 * Without this the bot lingers as a ghost in voice for up to a minute and
 * orphaned ffmpeg processes pile up on the host.
 */
function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down');

  const force = setTimeout(() => {
    logger.warn('Graceful shutdown timed out; forcing exit');
    process.exit(code);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  try {
    client.players.destroyAll('shutdown');
    closeDatabase();
    client.destroy();
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
  }

  clearTimeout(force);
  process.exit(code);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await client.login(config.token);
