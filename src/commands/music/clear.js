import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';

export default {
  name: 'clear',
  aliases: ['empty'],
  description: 'Clear the queue without stopping the current track',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'hasPlayer', 'dj'],

  slash: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear the queue without stopping the current track'),

  async execute(ctx) {
    const removed = ctx.player.queue.clear();
    if (removed === 0) {
      return ctx.reply(embeds.warning('The queue is already empty.'));
    }
    return ctx.reply(
      embeds.success(`Cleared **${removed}** track${removed === 1 ? '' : 's'} from the queue.`),
    );
  },
};
