import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';
import { formatDuration } from '../../util/time.js';

export default {
  name: 'forward',
  aliases: ['ff'],
  description: 'Jump forward in the current track',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'isPlaying', 'dj'],

  args: [{ name: 'seconds', type: 'int', required: false, default: 10 }],

  slash: new SlashCommandBuilder()
    .setName('forward')
    .setDescription('Jump forward in the current track')
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription('Seconds to jump forward (default 10)')
        .setMinValue(1),
    ),

  async execute(ctx) {
    const seconds = Math.max(1, ctx.get('seconds') ?? 10);
    const player = ctx.player;
    const track = player.current;
    const target = player.positionMs + seconds * 1000;

    if (track.durationMs && target >= track.durationMs) {
      await player.skip(1);
      return ctx.reply(embeds.success('Reached the end of the track — skipping.'));
    }

    await ctx.defer();
    try {
      await player.seek(target);
    } catch (error) {
      return ctx.reply(embeds.error(error.message));
    }
    return ctx.reply(embeds.success(`Jumped to \`${formatDuration(target)}\`.`));
  },
};
