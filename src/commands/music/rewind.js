import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';
import { formatDuration } from '../../util/time.js';

export default {
  name: 'rewind',
  aliases: ['rw'],
  description: 'Jump backward in the current track',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'isPlaying', 'dj'],

  args: [{ name: 'seconds', type: 'int', required: false, default: 10 }],

  slash: new SlashCommandBuilder()
    .setName('rewind')
    .setDescription('Jump backward in the current track')
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription('Seconds to jump back (default 10)')
        .setMinValue(1),
    ),

  async execute(ctx) {
    const seconds = Math.max(1, ctx.get('seconds') ?? 10);
    const player = ctx.player;
    const target = Math.max(0, player.positionMs - seconds * 1000);

    await ctx.defer();
    try {
      await player.seek(target);
    } catch (error) {
      return ctx.reply(embeds.error(error.message));
    }
    return ctx.reply(embeds.success(`Jumped back to \`${formatDuration(target)}\`.`));
  },
};
