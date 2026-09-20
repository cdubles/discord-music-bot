import { Events } from 'discord.js';

import logger from '../logger.js';

export default {
  name: Events.Error,

  async execute(_client, error) {
    logger.error({ err: error }, 'Discord client error');
  },
};
