import { SlashCommandBuilder } from 'discord.js';

import * as embeds from '../../ui/embeds.js';
import { parseIndex, truncate } from '../../util/validate.js';

export default {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a track from the queue',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'hasPlayer', 'dj'],

  args: [{ name: 'index', type: 'int', required: true, description: 'Queue position' }],

  slash: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue')
    .addIntegerOption((option) =>
      option
        .setName('index')
        .setDescription('Queue position to remove')
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    ),

  async execute(ctx) {
    const player = ctx.player;
    const index = parseIndex(ctx.get('index'), player.queue.size);

    if (index === null) {
      return ctx.reply(
        embeds.error(
          player.queue.size === 0
            ? 'The queue is empty.'
            : `Pick a position between 1 and ${player.queue.size}.`,
        ),
      );
    }

    const removed = player.queue.remove(index);
    return ctx.reply(embeds.success(`Removed ${removed.link} from the queue.`));
  },

  async autocomplete(interaction) {
    const player = interaction.client.players.get(interaction.guildId);
    if (!player) return interaction.respond([]);

    const focused = String(interaction.options.getFocused() ?? '').toLowerCase();
    const options = player.queue.tracks
      .map((track, index) => ({
        name: truncate(`${index + 1}. ${track.title}`, 100),
        value: index + 1,
      }))
      .filter((option) => !focused || option.name.toLowerCase().includes(focused))
      .slice(0, 25);

    return interaction.respond(options);
  },
};
