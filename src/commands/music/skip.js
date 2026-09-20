import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';

export default {
  name: 'skip',
  aliases: ['s', 'next'],
  description: 'Skip the current track',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'isPlaying', 'dj'],

  args: [
    { name: 'amount', type: 'int', required: false, default: 1, description: 'How many to skip' },
  ],

  slash: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('How many tracks to skip (default 1)')
        .setMinValue(1)
        .setMaxValue(100),
    ),

  async execute(ctx) {
    const amount = Math.max(1, ctx.get('amount') ?? 1);
    const player = ctx.player;
    const skipped = player.current;

    await player.skip(amount);

    const suffix = amount > 1 ? ` and ${amount - 1} more` : '';
    return ctx.reply(embeds.success(`Skipped ${skipped.link}${suffix}.`));
  },
};
