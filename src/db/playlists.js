import db from './index.js';

/**
 * Saved-playlist storage.
 *
 * Scope is either 'user' (visible to its owner in this guild) or 'guild'
 * (shared with the whole server). Tracks store the page URL only; the media
 * URL is re-resolved at play time.
 */

const insertPlaylist = db.prepare(`
  INSERT INTO playlists (guild_id, owner_id, scope, name, name_lower, description)
  VALUES (@guild_id, @owner_id, @scope, @name, @name_lower, @description)
`);

const insertTrack = db.prepare(`
  INSERT INTO playlist_tracks
    (playlist_id, position, url, title, author, duration_ms, thumbnail, source, added_by)
  VALUES
    (@playlist_id, @position, @url, @title, @author, @duration_ms, @thumbnail, @source, @added_by)
`);

const deleteTracks = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?');
const deletePlaylistStmt = db.prepare('DELETE FROM playlists WHERE id = ?');
const touchPlaylist = db.prepare('UPDATE playlists SET updated_at = unixepoch() WHERE id = ?');

const selectTracksStmt = db.prepare(
  'SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC',
);

/** Find a playlist by name, preferring the user's own over the shared one. */
export function findByName(guildId, ownerId, name) {
  const nameLower = name.trim().toLowerCase();
  return (
    db
      .prepare(
        `SELECT * FROM playlists
         WHERE guild_id = ? AND name_lower = ? AND scope = 'user' AND owner_id = ?`,
      )
      .get(guildId, nameLower, ownerId) ??
    db
      .prepare(
        `SELECT * FROM playlists WHERE guild_id = ? AND name_lower = ? AND scope = 'guild'`,
      )
      .get(guildId, nameLower) ??
    null
  );
}

/**
 * Create or replace a named playlist.
 *
 * The whole thing runs in one transaction: better-sqlite3 is synchronous, so
 * inserting a few hundred tracks one statement at a time outside a transaction
 * would block the event loop long enough to stutter audio.
 */
export const savePlaylist = db.transaction(
  ({ guildId, ownerId, scope, name, description = null, tracks, addedBy }) => {
    const nameLower = name.trim().toLowerCase();
    const existing = db
      .prepare(
        scope === 'guild'
          ? `SELECT * FROM playlists WHERE guild_id = ? AND name_lower = ? AND scope = 'guild'`
          : `SELECT * FROM playlists WHERE guild_id = ? AND name_lower = ? AND scope = 'user' AND owner_id = ?`,
      )
      .get(...(scope === 'guild' ? [guildId, nameLower] : [guildId, nameLower, ownerId]));

    let playlistId;
    if (existing) {
      playlistId = existing.id;
      deleteTracks.run(playlistId);
      touchPlaylist.run(playlistId);
    } else {
      playlistId = insertPlaylist.run({
        guild_id: guildId,
        owner_id: ownerId,
        scope,
        name: name.trim(),
        name_lower: nameLower,
        description,
      }).lastInsertRowid;
    }

    tracks.forEach((track, index) => {
      insertTrack.run({
        playlist_id: playlistId,
        position: index,
        added_by: addedBy,
        ...track.toRow(),
      });
    });

    return { id: playlistId, replaced: Boolean(existing), count: tracks.length };
  },
);

export function getTracks(playlistId) {
  return selectTracksStmt.all(playlistId);
}

export function deletePlaylist(playlistId) {
  // playlist_tracks cascades via the foreign key.
  return deletePlaylistStmt.run(playlistId).changes > 0;
}

/** List playlists visible to a user, newest first, with track counts. */
export function listPlaylists(guildId, ownerId, { scope = null } = {}) {
  const base = `
    SELECT p.*, COUNT(t.id) AS track_count
    FROM playlists p
    LEFT JOIN playlist_tracks t ON t.playlist_id = p.id
    WHERE p.guild_id = ?
  `;

  if (scope === 'guild') {
    return db
      .prepare(`${base} AND p.scope = 'guild' GROUP BY p.id ORDER BY p.updated_at DESC`)
      .all(guildId);
  }
  if (scope === 'user') {
    return db
      .prepare(
        `${base} AND p.scope = 'user' AND p.owner_id = ? GROUP BY p.id ORDER BY p.updated_at DESC`,
      )
      .all(guildId, ownerId);
  }

  // Default: everything the user can see.
  return db
    .prepare(
      `${base} AND (p.scope = 'guild' OR p.owner_id = ?) GROUP BY p.id ORDER BY p.updated_at DESC`,
    )
    .all(guildId, ownerId);
}

/** Names for autocomplete. */
export function searchNames(guildId, ownerId, term = '') {
  return listPlaylists(guildId, ownerId)
    .filter((row) => row.name.toLowerCase().includes(term.toLowerCase()))
    .slice(0, 25);
}
