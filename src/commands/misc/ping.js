import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';

export default {
  name: 'ping',
  aliases: [],
  description: 'Check that the bot is responding',
  category: 'Misc',
  surfaces: ['slash', 'prefix'],

  slash: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check that the bot is responding'),

  async execute(ctx) {
    const latency = Math.round(ctx.client.ws.ping);
    return ctx.reply(
      embeds.info(`Pong! Gateway latency is **${latency < 0 ? 'measuring…' : `${latency}ms`}**.`),
    );
  },
};
