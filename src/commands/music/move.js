import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';
import { parseIndex } from '../../util/validate.js';

export default {
  name: 'move',
  aliases: ['mv'],
  description: 'Move a track to a different queue position',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'hasPlayer', 'dj'],

  args: [
    { name: 'from', type: 'int', required: true, description: 'Current position' },
    { name: 'to', type: 'int', required: true, description: 'New position' },
  ],

  slash: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a track to a different queue position')
    .addIntegerOption((option) =>
      option.setName('from').setDescription('Current position').setRequired(true).setMinValue(1),
    )
    .addIntegerOption((option) =>
      option.setName('to').setDescription('New position').setRequired(true).setMinValue(1),
    ),

  async execute(ctx) {
    const player = ctx.player;
    const size = player.queue.size;

    const from = parseIndex(ctx.get('from'), size);
    const to = parseIndex(ctx.get('to'), size);

    if (from === null || to === null) {
      return ctx.reply(
        embeds.error(
          size === 0 ? 'The queue is empty.' : `Both positions must be between 1 and ${size}.`,
        ),
      );
    }

    const moved = player.queue.move(from, to);
    return ctx.reply(embeds.success(`Moved ${moved.link} to position **#${to + 1}**.`));
  },
};
