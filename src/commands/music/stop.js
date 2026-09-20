import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';

export default {
  name: 'stop',
  aliases: ['dc', 'leave', 'disconnect'],
  description: 'Stop playback, clear the queue and leave the voice channel',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'hasPlayer', 'dj'],

  slash: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue and leave the voice channel'),

  async execute(ctx) {
    await ctx.player.stop({ disconnect: true });
    return ctx.reply(embeds.success('Stopped playback and left the channel.'));
  },
};
