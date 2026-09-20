/**
 * Register slash commands with Discord.
 *
 *   node scripts/deploy-commands.js            # to DISCORD_GUILD_ID (instant)
 *   node scripts/deploy-commands.js --global   # globally (up to 1h to appear)
 *
 * Deliberately NOT run at container start: registration is rate-limited and
 * slows boot. Run it by hand after adding or changing a command.
 *
 * Note this is a PUT (full replace) — a command removed from the source tree
 * disappears from Discord on the next run, which is what we want.
 */
import { REST, Routes } from 'discord.js';

import { loadCommands } from '../src/commands/index.js';
import config from '../src/config.js';
import logger from '../src/logger.js';

const useGlobal = process.argv.includes('--global');

const commands = await loadCommands();
const payload = commands
  .filter((command) => (command.surfaces ?? []).includes('slash') && command.slash)
  .map((command) => command.slash.toJSON());

if (payload.length === 0) {
  logger.error('No slash commands found to register.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(config.token);

try {
  if (useGlobal) {
    await rest.put(Routes.applicationCommands(config.clientId), { body: payload });
    logger.info(
      { count: payload.length },
      'Registered global commands (may take up to an hour to appear)',
    );
  } else {
    if (!config.guildId) {
      logger.error(
        'DISCORD_GUILD_ID is not set. Set it in .env, or pass --global to register globally.',
      );
      process.exit(1);
    }
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: payload,
    });
    logger.info({ count: payload.length, guild: config.guildId }, 'Registered guild commands');
  }
} catch (error) {
  logger.fatal({ err: error }, 'Failed to register commands');
  process.exit(1);
}

process.exit(0);
