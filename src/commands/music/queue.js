import { SlashCommandBuilder } from 'discord.js';

import { attachCollector } from '../../ui/collectors.js';
import { queueControls } from '../../ui/components.js';
import * as embeds from '../../ui/embeds.js';

export default {
  name: 'queue',
  aliases: ['q'],
  description: 'Show the queue',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'hasPlayer'],

  args: [{ name: 'page', type: 'int', required: false, default: 1 }],

  slash: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the queue')
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Page number').setMinValue(1),
    ),

  async execute(ctx) {
    const player = ctx.player;
    let current = Math.max(1, ctx.get('page') ?? 1);

    const render = (pageNumber) => {
      const { embeds: pageEmbeds, page, pages } = embeds.queuePage(player, pageNumber);
      current = page;
      return {
        embeds: pageEmbeds,
        components: pages > 1 ? [queueControls(ctx.user.id, { page, pages })] : [],
      };
    };

    await ctx.reply(render(current));

    // Single-page queues need no pager.
    if (player.queue.page(current).pages <= 1) return undefined;

    const message = await ctx.fetchReply();
    if (!message) return undefined;

    attachCollector(message, {
      ownerId: ctx.user.id,
      player,
      onCollect: async (interaction, parsed, collector) => {
        if (parsed.action === 'queue-close') {
          collector.stop('closed');
          await interaction.update({ components: [] });
          return;
        }
        await interaction.update(render(Number.parseInt(parsed.payload, 10) || 1));
      },
    });

    return undefined;
  },
};
