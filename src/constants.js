/** Loop modes for the queue. */
export const LoopMode = Object.freeze({
  OFF: 'off',
  TRACK: 'track',
  QUEUE: 'queue',
});

export const LOOP_CYCLE = [LoopMode.OFF, LoopMode.TRACK, LoopMode.QUEUE];

/** Embed accent colours. */
export const Colors = Object.freeze({
  PRIMARY: 0x5865f2,
  SUCCESS: 0x57f287,
  WARNING: 0xfee75c,
  ERROR: 0xed4245,
  MUTED: 0x4f545c,
});

export const Emoji = Object.freeze({
  PLAY: '▶️',
  PAUSE: '⏸️',
  SKIP: '⏭️',
  STOP: '⏹️',
  LOOP: '🔁',
  LOOP_ONE: '🔂',
  SHUFFLE: '🔀',
  VOLUME_UP: '🔊',
  VOLUME_DOWN: '🔉',
  MUSIC: '🎵',
  QUEUE: '📜',
  LIVE: '🔴',
  PREVIOUS: '◀️',
  NEXT: '▶️',
});

/** Queue entries shown per page in /queue. */
export const QUEUE_PAGE_SIZE = 10;

/** Saved playlists shown per page in /playlist list. */
export const PLAYLIST_PAGE_SIZE = 10;

/** How long pagination / select-menu collectors stay live. */
export const COLLECTOR_TIMEOUT_MS = 120_000;
export const SEARCH_COLLECTOR_TIMEOUT_MS = 30_000;

/** How often the /nowplaying embed refreshes its progress bar. */
export const NOWPLAYING_REFRESH_MS = 10_000;

/** Ceiling for user-set volume. Above SOFT_MAX we warn about clipping. */
export const VOLUME_MAX = 200;
export const VOLUME_SOFT_MAX = 150;

/** Tracks retained for autoplay seeding and history. */
export const HISTORY_LIMIT = 50;

/** Search results offered by /search and slash autocomplete. */
export const SEARCH_RESULT_COUNT = 5;
export const AUTOCOMPLETE_RESULT_COUNT = 5;

/** How long to wait for a voice connection to become Ready before giving up. */
export const VOICE_READY_TIMEOUT_MS = 20_000;

/** How long to wait for the audio player to start playing a new resource. */
export const PLAYER_START_TIMEOUT_MS = 15_000;

/** Grace period for a Disconnected connection to resume on its own. */
export const VOICE_RECONNECT_GRACE_MS = 5_000;

/** Cap on how long we let a graceful shutdown take before forcing exit. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;
