import config from '../config.js';
import db from './index.js';

/**
 * Per-guild settings with an in-memory cache.
 *
 * The cache is mandatory rather than an optimisation: messageCreate needs the
 * prefix for every message the bot can see, and a DB round-trip per message
 * would be wasteful even at better-sqlite3's sub-millisecond speeds.
 */
const cache = new Map();

const selectStmt = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?');
const insertStmt = db.prepare(`
  INSERT INTO guild_settings (guild_id, prefix, default_volume, idle_timeout_s)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (guild_id) DO NOTHING
`);

const ALLOWED_KEYS = new Set([
  'prefix',
  'default_volume',
  'autoplay',
  'idle_timeout_s',
  'dj_role_id',
  'announce_tracks',
]);

/** Fetch a guild's settings, creating the row on first sight. */
export function getSettings(guildId) {
  const cached = cache.get(guildId);
  if (cached) return cached;

  let row = selectStmt.get(guildId);
  if (!row) {
    insertStmt.run(
      guildId,
      config.defaultPrefix,
      config.defaultVolume,
      config.idleTimeoutSeconds,
    );
    row = selectStmt.get(guildId);
  }

  cache.set(guildId, row);
  return row;
}

/** Update one or more settings; unknown keys are ignored. */
export function updateSettings(guildId, patch) {
  getSettings(guildId); // ensure the row exists

  const entries = Object.entries(patch).filter(([key]) => ALLOWED_KEYS.has(key));
  if (entries.length === 0) return getSettings(guildId);

  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  db.prepare(
    `UPDATE guild_settings SET ${assignments}, updated_at = unixepoch() WHERE guild_id = ?`,
  ).run(...entries.map(([, value]) => value), guildId);

  cache.delete(guildId);
  return getSettings(guildId);
}

export function getPrefix(guildId) {
  if (!guildId) return config.defaultPrefix;
  return getSettings(guildId).prefix || config.defaultPrefix;
}

/** Drop a guild from the cache, e.g. when the bot is removed from it. */
export function invalidate(guildId) {
  cache.delete(guildId);
}
