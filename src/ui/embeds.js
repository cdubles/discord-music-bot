import { EmbedBuilder } from 'discord.js';

import { Colors, Emoji, LoopMode, QUEUE_PAGE_SIZE } from '../constants.js';
import { formatDuration, formatDurationLong } from '../util/time.js';
import { escapeMarkdown, truncate } from '../util/validate.js';
import { renderProgressBar } from './progressBar.js';

export function success(message, title = null) {
  const embed = new EmbedBuilder().setColor(Colors.SUCCESS).setDescription(message);
  if (title) embed.setTitle(title);
  return { embeds: [embed] };
}

export function error(message, title = null) {
  const embed = new EmbedBuilder().setColor(Colors.ERROR).setDescription(message);
  if (title) embed.setTitle(title);
  return { embeds: [embed] };
}

export function info(message, title = null) {
  const embed = new EmbedBuilder().setColor(Colors.PRIMARY).setDescription(message);
  if (title) embed.setTitle(title);
  return { embeds: [embed] };
}

export function warning(message) {
  return { embeds: [new EmbedBuilder().setColor(Colors.WARNING).setDescription(message)] };
}

/** Confirmation that a single track was queued. */
export function trackAdded(track, position) {
  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS)
    .setAuthor({ name: 'Added to queue' })
    .setDescription(track.link)
    .addFields(
      { name: 'Duration', value: track.durationLabel, inline: true },
      {
        name: 'Position',
        value: position > 0 ? `#${position}` : 'Playing next',
        inline: true,
      },
    );

  if (track.author) {
    embed.addFields({ name: 'Channel', value: truncate(track.author, 40), inline: true });
  }
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  if (track.requestedBy) {
    embed.setFooter({ text: `Requested by ${track.requestedBy.tag}` });
  }

  return { embeds: [embed] };
}

/** Confirmation that a playlist was queued. */
export function playlistAdded(title, tracks, { skipped = 0 } = {}) {
  const totalMs = tracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
  const preview = tracks
    .slice(0, 5)
    .map((track, index) => `\`${index + 1}.\` ${track.link}`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS)
    .setAuthor({ name: 'Playlist added' })
    .setTitle(truncate(title, 100))
    .setDescription(
      `${preview}${tracks.length > 5 ? `\n…and ${tracks.length - 5} more` : ''}`,
    )
    .addFields(
      { name: 'Tracks', value: String(tracks.length), inline: true },
      { name: 'Total length', value: formatDurationLong(totalMs), inline: true },
    );

  if (skipped > 0) {
    embed.setFooter({ text: `${skipped} track(s) skipped — queue limit reached` });
  }
  return { embeds: [embed] };
}

/** The now-playing panel, with progress bar. */
export function nowPlaying(player) {
  const track = player.current;
  if (!track) return info('Nothing is playing right now.');

  const embed = new EmbedBuilder()
    .setColor(Colors.PRIMARY)
    .setAuthor({ name: player.isPaused ? 'Paused' : 'Now playing' })
    .setDescription(track.link);

  if (track.isLive) {
    embed.addFields({ name: 'Status', value: `${Emoji.LIVE} Live stream`, inline: true });
  } else {
    const position = Math.min(player.positionMs, track.durationMs || player.positionMs);
    embed.addFields({
      name: '​',
      value: `${renderProgressBar(position, track.durationMs)}\n\`${formatDuration(
        position,
      )} / ${formatDuration(track.durationMs)}\``,
    });
  }

  embed.addFields(
    { name: 'Volume', value: `${player.volume}%`, inline: true },
    { name: 'Loop', value: loopLabel(player.queue.loopMode), inline: true },
    { name: 'Up next', value: String(player.queue.size), inline: true },
  );

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  if (track.requestedBy) embed.setFooter({ text: `Requested by ${track.requestedBy.tag}` });

  return { embeds: [embed] };
}

/** Announcement posted when a track begins. */
export function trackStarted(track) {
  const embed = new EmbedBuilder()
    .setColor(Colors.PRIMARY)
    .setAuthor({ name: 'Now playing' })
    .setDescription(`${track.link} \`${track.durationLabel}\``);
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  if (track.requestedBy) embed.setFooter({ text: `Requested by ${track.requestedBy.tag}` });
  return { embeds: [embed] };
}

/** One page of the queue. */
export function queuePage(player, pageNumber = 1) {
  const { items, startIndex, page, pages, total, totalDurationMs } = player.queue.page(
    pageNumber,
    QUEUE_PAGE_SIZE,
  );

  const embed = new EmbedBuilder()
    .setColor(Colors.PRIMARY)
    .setTitle(`${Emoji.QUEUE} Queue for ${truncate(player.guild.name, 60)}`);

  const lines = [];

  if (player.current) {
    lines.push(
      `**Now playing**\n${player.current.link} \`${player.current.durationLabel}\`\n`,
    );
  }

  if (items.length === 0) {
    lines.push('*Nothing queued. Add something with `/play`.*');
  } else {
    lines.push('**Up next**');
    lines.push(
      items
        .map(
          (track, index) =>
            `\`${String(startIndex + index + 1).padStart(2, ' ')}.\` ${track.link} \`${
              track.durationLabel
            }\``,
        )
        .join('\n'),
    );
  }

  embed.setDescription(truncate(lines.join('\n'), 4000));
  embed.setFooter({
    text: `Page ${page}/${pages} • ${total} track${total === 1 ? '' : 's'} • ${formatDurationLong(
      totalDurationMs,
    )} total • Loop: ${loopLabel(player.queue.loopMode)}`,
  });

  return { embeds: [embed], page, pages };
}

/** Results list for /search. */
export function searchResults(query, tracks) {
  const embed = new EmbedBuilder()
    .setColor(Colors.PRIMARY)
    .setTitle(`Results for "${truncate(query, 80)}"`)
    .setDescription(
      tracks
        .map(
          (track, index) =>
            `\`${index + 1}.\` ${track.link} \`${track.durationLabel}\`${
              track.author ? ` — ${escapeMarkdown(truncate(track.author, 30))}` : ''
            }`,
        )
        .join('\n'),
    )
    .setFooter({ text: 'Pick a track below. This menu expires in 30 seconds.' });
  return { embeds: [embed] };
}

/** One page of saved playlists. */
export function playlistList(rows, { page, pages, scopeLabel }) {
  const embed = new EmbedBuilder()
    .setColor(Colors.PRIMARY)
    .setTitle(`Saved playlists (${scopeLabel})`);

  if (rows.length === 0) {
    embed.setDescription('*No saved playlists yet. Use `/playlist save` to create one.*');
  } else {
    embed.setDescription(
      rows
        .map(
          (row) =>
            `**${escapeMarkdown(truncate(row.name, 50))}** — ${row.track_count} track${
              row.track_count === 1 ? '' : 's'
            } • ${row.scope === 'guild' ? 'server' : `<@${row.owner_id}>`}`,
        )
        .join('\n'),
    );
  }

  embed.setFooter({ text: `Page ${page}/${pages}` });
  return { embeds: [embed] };
}

export function loopLabel(mode) {
  if (mode === LoopMode.TRACK) return `${Emoji.LOOP_ONE} Track`;
  if (mode === LoopMode.QUEUE) return `${Emoji.LOOP} Queue`;
  return 'Off';
}
