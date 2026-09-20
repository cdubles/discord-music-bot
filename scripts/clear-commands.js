/**
 * Remove registered slash commands.
 *
 *   node scripts/clear-commands.js            # clear DISCORD_GUILD_ID
 *   node scripts/clear-commands.js --global   # clear global commands
 *
 * Useful when switching between guild and global registration, which
 * otherwise leaves duplicate commands showing in the guild.
 */
import { REST, Routes } from 'discord.js';

import config from '../src/config.js';
import logger from '../src/logger.js';

const useGlobal = process.argv.includes('--global');
const rest = new REST({ version: '10' }).setToken(config.token);

try {
  if (useGlobal) {
    await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
    logger.info('Cleared global commands');
  } else {
    if (!config.guildId) {
      logger.error('DISCORD_GUILD_ID is not set.');
      process.exit(1);
    }
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: [],
    });
    logger.info({ guild: config.guildId }, 'Cleared guild commands');
  }
} catch (error) {
  logger.fatal({ err: error }, 'Failed to clear commands');
  process.exit(1);
}

process.exit(0);
