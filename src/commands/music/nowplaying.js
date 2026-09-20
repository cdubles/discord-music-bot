import { SlashCommandBuilder } from 'discord.js';

import { LOOP_CYCLE, NOWPLAYING_REFRESH_MS } from '../../constants.js';
import { attachCollector } from '../../ui/collectors.js';
import { playbackControls } from '../../ui/components.js';
import * as embeds from '../../ui/embeds.js';

export default {
  name: 'nowplaying',
  aliases: ['np'],
  description: 'Show what is playing, with controls',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'isPlaying'],

  slash: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show what is playing, with controls'),

  async execute(ctx) {
    const player = ctx.player;

    const render = () => ({
      ...embeds.nowPlaying(player),
      components: [playbackControls(ctx.user.id, { paused: player.isPaused })],
    });

    await ctx.reply(render());
    const message = await ctx.fetchReply();
    if (!message) return undefined;

    // Keep the progress bar moving while the track plays.
    const refresh = setInterval(() => {
      if (player.destroyed || !player.current) {
        clearInterval(refresh);
        message.edit({ components: [] }).catch(() => {});
        return;
      }
      message.edit(render()).catch(() => clearInterval(refresh));
    }, NOWPLAYING_REFRESH_MS);

    const collector = attachCollector(message, {
      ownerId: ctx.user.id,
      player,
      onCollect: async (interaction, parsed) => {
        if (player.destroyed) {
          await interaction.update({ components: [] });
          return;
        }

        switch (parsed.action) {
          case 'toggle':
            if (player.isPaused) player.resume();
            else player.pause();
            break;
          case 'skip':
            await player.skip(1);
            break;
          case 'stop':
            await player.stop({ disconnect: true });
            break;
          case 'loop': {
            const next =
              LOOP_CYCLE[(LOOP_CYCLE.indexOf(player.queue.loopMode) + 1) % LOOP_CYCLE.length];
            player.queue.loopMode = next;
            break;
          }
          case 'shuffle':
            player.queue.shuffle();
            break;
          default:
            break;
        }

        if (player.destroyed || !player.current) {
          await interaction.update({
            ...embeds.info('Playback stopped.'),
            components: [],
          });
          return;
        }
        await interaction.update(render());
      },
    });

    collector.once('end', () => clearInterval(refresh));
    return undefined;
  },
};
