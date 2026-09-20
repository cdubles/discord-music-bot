import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';
import { formatDuration, parseDuration } from '../../util/time.js';

export default {
  name: 'seek',
  aliases: [],
  description: 'Jump to a position in the current track',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'isPlaying', 'dj'],

  args: [
    {
      name: 'position',
      type: 'string',
      required: true,
      description: 'e.g. 90, 1:30, or 1m30s',
    },
  ],

  slash: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a position in the current track')
    .addStringOption((option) =>
      option
        .setName('position')
        .setDescription('Position: 90, 1:30, or 1m30s')
        .setRequired(true),
    ),

  async execute(ctx) {
    const raw = ctx.get('position');
    const targetMs = parseDuration(raw);

    if (targetMs === null) {
      return ctx.reply(
        embeds.error("I couldn't read that position. Try `1:30`, `90`, or `1m30s`."),
      );
    }

    await ctx.defer();
    const track = ctx.player.current;

    try {
      await ctx.player.seek(targetMs);
    } catch (error) {
      return ctx.reply(embeds.error(error.message));
    }

    return ctx.reply(
      embeds.success(`Jumped to \`${formatDuration(targetMs)}\` in ${track.link}.`),
    );
  },
};
