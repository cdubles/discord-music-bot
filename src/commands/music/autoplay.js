import { SlashCommandBuilder } from 'discord.js';

import { updateSettings } from '../../db/guildSettings.js';
import * as embeds from '../../ui/embeds.js';

export default {
  name: 'autoplay',
  aliases: ['ap'],
  description: 'Keep playing related tracks when the queue runs out',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'hasPlayer', 'dj'],

  args: [
    { name: 'state', type: 'choice', required: false, choices: ['on', 'off'] },
  ],

  slash: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Keep playing related tracks when the queue runs out')
    .addStringOption((option) =>
      option
        .setName('state')
        .setDescription('Omit to toggle')
        .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }),
    ),

  async execute(ctx) {
    const queue = ctx.player.queue;
    const state = ctx.get('state');

    queue.autoplay = state === null || state === undefined ? !queue.autoplay : state === 'on';

    // Persist so the setting survives the player being torn down.
    updateSettings(ctx.guild.id, { autoplay: queue.autoplay ? 1 : 0 });

    return ctx.reply(
      embeds.success(
        queue.autoplay
          ? 'Autoplay is **on** — I\'ll keep the music going when the queue empties.'
          : 'Autoplay is **off**.',
      ),
    );
  },
};
