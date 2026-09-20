import { ComponentType, MessageFlags } from 'discord.js';

import { COLLECTOR_TIMEOUT_MS } from '../constants.js';
import { parseId } from './components.js';

/**
 * Attach a component collector to a message, restricted to the user who
 * invoked the command (plus anyone with Manage Server).
 *
 * The collector is registered with the guild's player when one exists, so a
 * player teardown stops it rather than leaving it dangling.
 */
export function attachCollector(
  message,
  { ownerId, player = null, componentType = ComponentType.Button, timeout = COLLECTOR_TIMEOUT_MS, onCollect, onEnd },
) {
  const collector = message.createMessageComponentCollector({
    componentType,
    time: timeout,
  });

  collector.on('collect', async (interaction) => {
    const parsed = parseId(interaction.customId);
    if (!parsed) return;

    if (parsed.ownerId !== interaction.user.id) {
      await interaction.reply({
        content: 'Only the person who ran this command can use these controls.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await onCollect(interaction, parsed, collector);
    } catch (error) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: `Something went wrong: ${error.message}`, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (onEnd) await onEnd(reason).catch?.(() => {});
    // Strip the now-dead controls, unless the message is already gone.
    if (reason !== 'messageDelete') {
      await message.edit({ components: [] }).catch(() => {});
    }
  });

  player?.trackCollector?.(collector);
  return collector;
}

export default attachCollector;
