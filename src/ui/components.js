import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';

import { Emoji } from '../constants.js';
import { truncate } from '../util/validate.js';

/**
 * Component custom IDs are namespaced `music:<action>:<ownerId>:<payload>` so
 * interactionCreate can route them and enforce who's allowed to press them.
 */
export function buildId(action, ownerId, payload = '') {
  return `music:${action}:${ownerId}:${payload}`;
}

export function parseId(customId) {
  const [namespace, action, ownerId, ...rest] = customId.split(':');
  if (namespace !== 'music') return null;
  return { action, ownerId, payload: rest.join(':') };
}

/** Prev/next/close row for the queue embed. */
export function queueControls(ownerId, { page, pages }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildId('queue-page', ownerId, String(page - 1)))
      .setEmoji(Emoji.PREVIOUS)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(buildId('queue-page', ownerId, String(page + 1)))
      .setEmoji(Emoji.NEXT)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages),
    new ButtonBuilder()
      .setCustomId(buildId('queue-close', ownerId))
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger),
  );
}

/** Playback controls attached to the now-playing embed. */
export function playbackControls(ownerId, { paused = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildId('toggle', ownerId))
      .setEmoji(paused ? Emoji.PLAY : Emoji.PAUSE)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildId('skip', ownerId))
      .setEmoji(Emoji.SKIP)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildId('stop', ownerId))
      .setEmoji(Emoji.STOP)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(buildId('loop', ownerId))
      .setEmoji(Emoji.LOOP)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildId('shuffle', ownerId))
      .setEmoji(Emoji.SHUFFLE)
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Select menu listing search results. */
export function searchSelect(ownerId, tracks) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildId('search-pick', ownerId))
      .setPlaceholder('Choose a track to queue')
      .addOptions(
        tracks.map((track, index) => ({
          label: truncate(track.title, 95),
          description: truncate(
            `${track.durationLabel}${track.author ? ` • ${track.author}` : ''}`,
            95,
          ),
          value: String(index),
        })),
      ),
  );
}
