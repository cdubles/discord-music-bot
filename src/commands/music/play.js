import { SlashCommandBuilder } from 'discord.js';

import { resolveQuery } from '../../audio/resolve.js';
import { search } from '../../audio/ytdlp.js';
import { AUTOCOMPLETE_RESULT_COUNT } from '../../constants.js';
import * as embeds from '../../ui/embeds.js';
import { formatDuration } from '../../util/time.js';
import { isUrl, truncate } from '../../util/validate.js';

export default {
  name: 'play',
  aliases: ['p'],
  description: 'Play a song, or add it to the queue',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'canJoin', 'dj'],

  args: [{ name: 'query', type: 'rest', required: true, description: 'Song name or link' }],

  slash: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song, or add it to the queue')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('A song name, a YouTube link, or a playlist link')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(ctx) {
    const query = ctx.get('query');
    await ctx.defer();

    const requester = { id: ctx.user.id, tag: ctx.user.username };
    const result = await resolveQuery(query, requester);

    const player = ctx.client.players.getOrCreate(ctx.guild, ctx.channel);
    await player.connect(ctx.voiceChannel);

    const wasIdle = !player.current;
    const accepted = await player.enqueue(result.tracks);
    const skipped = result.tracks.length - accepted;

    if (accepted === 0) {
      return ctx.reply(embeds.error('The queue is full.'));
    }

    if (result.type === 'playlist') {
      return ctx.reply(
        embeds.playlistAdded(result.title, result.tracks.slice(0, accepted), { skipped }),
      );
    }

    // When nothing was playing, the trackStart announcement covers it.
    if (wasIdle) {
      return ctx.reply(embeds.success(`Playing ${result.tracks[0].link}`));
    }

    return ctx.reply(embeds.trackAdded(result.tracks[0], player.queue.size));
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    if (!focused || focused.length < 3 || isUrl(focused)) {
      return interaction.respond([]);
    }

    try {
      const results = await search(focused, AUTOCOMPLETE_RESULT_COUNT);
      return interaction.respond(
        results.map((entry) => ({
          name: truncate(
            `${entry.title}${entry.duration ? ` (${formatDuration(entry.duration * 1000)})` : ''}`,
            100,
          ),
          // Autocomplete values cap at 100 chars, so send the short watch URL.
          value: entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : truncate(entry.title, 100),
        })),
      );
    } catch {
      // Autocomplete failures must stay silent; the user can still type freely.
      return interaction.respond([]);
    }
  },
};
