import { ComponentType, SlashCommandBuilder } from 'discord.js';

import { search as ytSearch } from '../../audio/ytdlp.js';
import { SEARCH_COLLECTOR_TIMEOUT_MS, SEARCH_RESULT_COUNT } from '../../constants.js';
import Track from '../../core/Track.js';
import { attachCollector } from '../../ui/collectors.js';
import { searchSelect } from '../../ui/components.js';
import * as embeds from '../../ui/embeds.js';

export default {
  name: 'search',
  aliases: ['find'],
  description: 'Search YouTube and pick a track to queue',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'canJoin', 'dj'],

  args: [{ name: 'query', type: 'rest', required: true, description: 'What to search for' }],

  slash: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search YouTube and pick a track to queue')
    .addStringOption((option) =>
      option.setName('query').setDescription('What to search for').setRequired(true),
    ),

  async execute(ctx) {
    const query = ctx.get('query');
    await ctx.defer();

    const requester = { id: ctx.user.id, tag: ctx.user.username };
    const results = await ytSearch(query, SEARCH_RESULT_COUNT);

    if (results.length === 0) {
      return ctx.reply(embeds.error(`No results found for "${query}".`));
    }

    const tracks = results.map((entry) => Track.fromYtdlp(entry, requester));

    await ctx.reply({
      ...embeds.searchResults(query, tracks),
      components: [searchSelect(ctx.user.id, tracks)],
    });

    const message = await ctx.fetchReply();
    if (!message) return undefined;

    attachCollector(message, {
      ownerId: ctx.user.id,
      componentType: ComponentType.StringSelect,
      timeout: SEARCH_COLLECTOR_TIMEOUT_MS,
      onCollect: async (interaction, _parsed, collector) => {
        const track = tracks[Number.parseInt(interaction.values[0], 10)];
        if (!track) return;

        collector.stop('picked');

        const player = ctx.client.players.getOrCreate(ctx.guild, ctx.channel);
        await player.connect(ctx.voiceChannel);

        const wasIdle = !player.current;
        await player.enqueue(track);

        await interaction.update({
          ...(wasIdle
            ? embeds.success(`Playing ${track.link}`)
            : embeds.trackAdded(track, player.queue.size)),
          components: [],
        });
      },
    });

    return undefined;
  },
};
