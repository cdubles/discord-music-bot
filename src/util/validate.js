import { VOLUME_MAX } from '../constants.js';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

/** True when the string parses as an http(s) URL. */
export function isUrl(input) {
  if (typeof input !== 'string') return false;
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function toUrl(input) {
  try {
    return new URL(String(input).trim());
  } catch {
    return null;
  }
}

export function isYouTubeUrl(input) {
  const url = toUrl(input);
  return url !== null && YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
}

/**
 * True for URLs that reference a playlist. A "watch?v=...&list=..." URL counts:
 * the caller decides whether to expand it or play just the single video.
 */
export function isYouTubePlaylistUrl(input) {
  const url = toUrl(input);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return false;
  return url.searchParams.has('list') || url.pathname.startsWith('/playlist');
}

/** True only for a playlist URL with no specific video attached. */
export function isPurePlaylistUrl(input) {
  const url = toUrl(input);
  if (!url || !isYouTubePlaylistUrl(input)) return false;
  return !url.searchParams.has('v') && !url.hostname.includes('youtu.be');
}

/** Strip the &list= parameter so only the single video is resolved. */
export function stripPlaylistParam(input) {
  const url = toUrl(input);
  if (!url) return input;
  url.searchParams.delete('list');
  url.searchParams.delete('index');
  url.searchParams.delete('start_radio');
  return url.toString();
}

/** Clamp a volume to the supported range, or null if not a number. */
export function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(VOLUME_MAX, Math.max(0, Math.round(n)));
}

/**
 * Parse a 1-based queue position from user input into a 0-based index.
 * Returns null when out of range.
 */
export function parseIndex(value, length) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < 1 || n > length) return null;
  return n - 1;
}

/** Truncate for embed fields, which have hard character limits. */
export function truncate(text, max = 100) {
  const str = String(text ?? '');
  return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
}

/** Escape Discord markdown so track titles don't mangle an embed. */
export function escapeMarkdown(text) {
  return String(text ?? '').replace(/([\\*_~`|>[\]()])/g, '\\$1');
}
