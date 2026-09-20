CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id        TEXT PRIMARY KEY,
  prefix          TEXT    NOT NULL DEFAULT '!',
  default_volume  INTEGER NOT NULL DEFAULT 50 CHECK (default_volume BETWEEN 0 AND 200),
  autoplay        INTEGER NOT NULL DEFAULT 0  CHECK (autoplay IN (0, 1)),
  idle_timeout_s  INTEGER NOT NULL DEFAULT 300,
  dj_role_id      TEXT,
  announce_tracks INTEGER NOT NULL DEFAULT 1  CHECK (announce_tracks IN (0, 1)),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS playlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('user', 'guild')),
  name        TEXT NOT NULL,
  name_lower  TEXT NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- A user can't have two same-named playlists in a guild; a guild can't have
-- two same-named shared ones. Partial indexes keep the two scopes independent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pl_user
  ON playlists (guild_id, owner_id, name_lower) WHERE scope = 'user';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pl_guild
  ON playlists (guild_id, name_lower) WHERE scope = 'guild';
CREATE INDEX IF NOT EXISTS idx_pl_lookup ON playlists (guild_id, scope);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  url         TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  author      TEXT,
  duration_ms INTEGER,
  thumbnail   TEXT,
  source      TEXT    NOT NULL DEFAULT 'youtube',
  added_by    TEXT,
  added_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pt_pos ON playlist_tracks (playlist_id, position);
