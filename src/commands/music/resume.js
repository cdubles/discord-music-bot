import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';

export default {
  name: 'resume',
  aliases: ['unpause'],
  description: 'Resume a paused track',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'isPlaying', 'dj'],

  slash: new SlashCommandBuilder().setName('resume').setDescription('Resume a paused track'),

  async execute(ctx) {
    if (!ctx.player.isPaused) {
      return ctx.reply(embeds.warning('Playback is not paused.'));
    }
    ctx.player.resume();
    return ctx.reply(embeds.success('Resumed.'));
  },
};
