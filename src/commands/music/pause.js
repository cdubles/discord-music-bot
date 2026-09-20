import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';

export default {
  name: 'pause',
  aliases: [],
  description: 'Pause the current track',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'isPlaying', 'dj'],

  slash: new SlashCommandBuilder().setName('pause').setDescription('Pause the current track'),

  async execute(ctx) {
    if (ctx.player.isPaused) {
      return ctx.reply(embeds.warning('Already paused. Use `/resume` to continue.'));
    }
    ctx.player.pause();
    return ctx.reply(embeds.success('Paused.'));
  },
};
