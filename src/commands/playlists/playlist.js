import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { PLAYLIST_PAGE_SIZE } from '../../constants.js';
import Track from '../../core/Track.js';
import {
  deletePlaylist,
  findByName,
  getTracks,
  listPlaylists,
  savePlaylist,
  searchNames,
} from '../../db/playlists.js';
import * as embeds from '../../ui/embeds.js';
import { formatDurationLong } from '../../util/time.js';
import { escapeMarkdown, truncate } from '../../util/validate.js';

/**
 * Saved playlists.
 *
 * Slash uses real subcommands; prefix routes on the first token
 * (`!playlist save myjams`). Both land in the same handlers below.
 */
export default {
  name: 'playlist',
  aliases: ['pl'],
  description: 'Save, load and manage named playlists',
  category: 'Playlists',
  surfaces: ['slash', 'prefix'],
  subcommands: true,
  guards: ['inGuild'],

  slash: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Save, load and manage named playlists')
    .addSubcommand((sub) =>
      sub
        .setName('save')
        .setDescription('Save the current queue as a named playlist')
        .addStringOption((option) =>
          option.setName('name').setDescription('Playlist name').setRequired(true).setMaxLength(50),
        )
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Who can load it')
            .addChoices(
              { name: 'Just me', value: 'me' },
              { name: 'Everyone on this server', value: 'server' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('load')
        .setDescription('Queue a saved playlist')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Append to the queue, or replace it')
            .addChoices(
              { name: 'Append', value: 'append' },
              { name: 'Replace', value: 'replace' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List saved playlists')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Filter by scope')
            .addChoices(
              { name: 'Mine', value: 'user' },
              { name: 'Server', value: 'guild' },
            ),
        )
        .addIntegerOption((option) =>
          option.setName('page').setDescription('Page number').setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Show the tracks in a saved playlist')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a saved playlist')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async execute(ctx) {
    const sub = ctx.subcommand ?? 'list';

    // Prefix invocations pass args positionally after the subcommand token.
    const rest = ctx.isSlash ? null : ctx.rawArgs.slice(1);
    const arg = (index, slashName) =>
      ctx.isSlash ? ctx.interaction.options.getString(slashName) : (rest[index] ?? null);

    switch (sub) {
      case 'save':
        return handleSave(ctx, arg(0, 'name'), arg(1, 'scope'));
      case 'load':
        return handleLoad(ctx, arg(0, 'name'), arg(1, 'mode'));
      case 'show':
        return handleShow(ctx, arg(0, 'name'));
      case 'delete':
      case 'remove':
        return handleDelete(ctx, arg(0, 'name'));
      case 'list':
        return handleList(ctx, arg(0, 'scope'));
      default:
        return ctx.reply(
          embeds.error('Unknown action. Try `save`, `load`, `list`, `show` or `delete`.'),
        );
    }
  },

  async autocomplete(interaction) {
    const focused = String(interaction.options.getFocused() ?? '');
    const rows = searchNames(interaction.guildId, interaction.user.id, focused);
    return interaction.respond(
      rows.map((row) => ({
        name: truncate(`${row.name} (${row.track_count} tracks)`, 100),
        value: row.name,
      })),
    );
  },
};

async function handleSave(ctx, name, scopeArg) {
  if (!name) return ctx.reply(embeds.error('Give the playlist a name.'));

  const player = ctx.player;
  const tracks = [player?.current, ...(player?.queue.tracks ?? [])].filter(Boolean);

  if (tracks.length === 0) {
    return ctx.reply(embeds.error('There is nothing queued to save.'));
  }

  const scope = scopeArg === 'server' || scopeArg === 'guild' ? 'guild' : 'user';
  if (scope === 'guild' && !ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return ctx.reply(
      embeds.error('You need the **Manage Server** permission to save a server playlist.'),
    );
  }

  const result = savePlaylist({
    guildId: ctx.guild.id,
    ownerId: ctx.user.id,
    scope,
    name,
    tracks,
    addedBy: ctx.user.id,
  });

  return ctx.reply(
    embeds.success(
      `${result.replaced ? 'Updated' : 'Saved'} **${escapeMarkdown(name)}** with ${
        result.count
      } track${result.count === 1 ? '' : 's'} (${scope === 'guild' ? 'server' : 'private'}).`,
    ),
  );
}

async function handleLoad(ctx, name, modeArg) {
  if (!name) return ctx.reply(embeds.error('Which playlist should I load?'));

  if (!ctx.voiceChannel) {
    return ctx.reply(embeds.error('Join a voice channel first.'));
  }

  const playlist = findByName(ctx.guild.id, ctx.user.id, name);
  if (!playlist) return ctx.reply(embeds.error(`No playlist called **${escapeMarkdown(name)}**.`));

  const rows = getTracks(playlist.id);
  if (rows.length === 0) return ctx.reply(embeds.error('That playlist is empty.'));

  await ctx.defer();

  const requester = { id: ctx.user.id, tag: ctx.user.username };
  const tracks = rows.map((row) => Track.fromRow(row, requester));

  const player = ctx.client.players.getOrCreate(ctx.guild, ctx.channel);
  await player.connect(ctx.voiceChannel);

  if (modeArg === 'replace') {
    player.queue.clear();
  }

  const accepted = await player.enqueue(tracks);
  return ctx.reply(
    embeds.playlistAdded(playlist.name, tracks.slice(0, accepted), {
      skipped: tracks.length - accepted,
    }),
  );
}

async function handleShow(ctx, name) {
  if (!name) return ctx.reply(embeds.error('Which playlist should I show?'));

  const playlist = findByName(ctx.guild.id, ctx.user.id, name);
  if (!playlist) return ctx.reply(embeds.error(`No playlist called **${escapeMarkdown(name)}**.`));

  const rows = getTracks(playlist.id);
  const totalMs = rows.reduce((sum, row) => sum + (row.duration_ms ?? 0), 0);

  const lines = rows
    .slice(0, 20)
    .map(
      (row, index) =>
        `\`${String(index + 1).padStart(2, ' ')}.\` [${escapeMarkdown(
          truncate(row.title, 60),
        )}](${row.url})`,
    );

  if (rows.length > 20) lines.push(`…and ${rows.length - 20} more`);

  return ctx.reply(
    embeds.info(
      `${lines.join('\n') || '*Empty.*'}\n\n**${rows.length}** tracks • ${formatDurationLong(
        totalMs,
      )}`,
      playlist.name,
    ),
  );
}

async function handleDelete(ctx, name) {
  if (!name) return ctx.reply(embeds.error('Which playlist should I delete?'));

  const playlist = findByName(ctx.guild.id, ctx.user.id, name);
  if (!playlist) return ctx.reply(embeds.error(`No playlist called **${escapeMarkdown(name)}**.`));

  const isOwner = playlist.owner_id === ctx.user.id;
  const canManage = ctx.member.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!isOwner && !canManage) {
    return ctx.reply(embeds.error('You can only delete playlists you created.'));
  }
  if (playlist.scope === 'guild' && !canManage) {
    return ctx.reply(
      embeds.error('You need the **Manage Server** permission to delete a server playlist.'),
    );
  }

  deletePlaylist(playlist.id);
  return ctx.reply(embeds.success(`Deleted **${escapeMarkdown(playlist.name)}**.`));
}

async function handleList(ctx, scopeArg) {
  const scope = ['user', 'guild', 'me', 'server'].includes(scopeArg ?? '')
    ? { me: 'user', server: 'guild' }[scopeArg] ?? scopeArg
    : null;

  const rows = listPlaylists(ctx.guild.id, ctx.user.id, { scope });
  const pages = Math.max(1, Math.ceil(rows.length / PLAYLIST_PAGE_SIZE));

  return ctx.reply(
    embeds.playlistList(rows.slice(0, PLAYLIST_PAGE_SIZE), {
      page: 1,
      pages,
      scopeLabel: scope === 'guild' ? 'server' : scope === 'user' ? 'mine' : 'all',
    }),
  );
}
