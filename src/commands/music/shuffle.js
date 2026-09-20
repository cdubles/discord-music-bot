import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';

export default {
  name: 'shuffle',
  aliases: ['sh'],
  description: 'Shuffle the queue',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'hasPlayer', 'dj'],

  slash: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue'),

  async execute(ctx) {
    const count = ctx.player.queue.shuffle();
    if (count < 2) {
      return ctx.reply(embeds.warning('Not enough tracks queued to shuffle.'));
    }
    return ctx.reply(embeds.success(`Shuffled **${count}** tracks.`));
  },
};
