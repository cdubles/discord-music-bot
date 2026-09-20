import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';

export default {
  name: 'join',
  aliases: ['summon'],
  description: 'Bring the bot into your voice channel',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'canJoin', 'dj'],

  slash: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Bring the bot into your voice channel'),

  async execute(ctx) {
    const player = ctx.client.players.getOrCreate(ctx.guild, ctx.channel);
    await player.connect(ctx.voiceChannel);

    // Nothing queued yet, so start the inactivity clock right away.
    if (!player.current) player.startIdleTimer();

    return ctx.reply(embeds.success(`Joined ${ctx.voiceChannel}.`));
  },
};
