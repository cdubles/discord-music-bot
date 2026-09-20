import { formatDuration } from '../util/time.js';
import { escapeMarkdown, truncate } from '../util/validate.js';

/**
 * A queued track.
 *
 * Deliberately stores only the *page* URL, never a resolved media URL:
 * googlevideo links expire within hours and are bound to the requesting IP, so
 * anything queued behind a long track would be dead by the time it played.
 * Resolution happens at play time.
 */
export class Track {
  constructor({
    id,
    url,
    title,
    author = null,
    durationMs = 0,
    thumbnail = null,
    isLive = false,
    source = 'youtube',
    requestedBy = null,
  }) {
    this.id = id;
    this.url = url;
    this.title = title;
    this.author = author;
    this.durationMs = durationMs;
    this.thumbnail = thumbnail;
    this.isLive = isLive;
    this.source = source;
    this.requestedBy = requestedBy;
  }

  /** Build from yt-dlp JSON (full `-J` output or a flat-playlist entry). */
  static fromYtdlp(data, requestedBy = null) {
    const id = data.id ?? null;
    const url =
      data.webpage_url ??
      data.url ??
      (id ? `https://www.youtube.com/watch?v=${id}` : null);

    const durationSeconds = Number(data.duration ?? 0);

    return new Track({
      id,
      url,
      title: data.title ?? data.fulltitle ?? 'Unknown title',
      author: data.uploader ?? data.channel ?? data.artist ?? null,
      durationMs: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : 0,
      thumbnail: pickThumbnail(data),
      isLive: Boolean(data.is_live ?? data.live_status === 'is_live'),
      source: data.extractor_key?.toLowerCase().includes('youtube') ? 'youtube' : 'other',
      requestedBy,
    });
  }

  /** Rebuild from a saved playlist row. */
  static fromRow(row, requestedBy = null) {
    return new Track({
      id: null,
      url: row.url,
      title: row.title,
      author: row.author,
      durationMs: row.duration_ms ?? 0,
      thumbnail: row.thumbnail,
      isLive: false,
      source: row.source ?? 'youtube',
      requestedBy,
    });
  }

  /** Shape expected by the playlist_tracks table. */
  toRow() {
    return {
      url: this.url,
      title: this.title,
      author: this.author,
      duration_ms: this.durationMs,
      thumbnail: this.thumbnail,
      source: this.source,
    };
  }

  get durationLabel() {
    return this.isLive ? 'LIVE' : formatDuration(this.durationMs);
  }

  /** Markdown link, safe for embed descriptions. */
  get link() {
    return `[${escapeMarkdown(truncate(this.title, 70))}](${this.url})`;
  }
}

function pickThumbnail(data) {
  if (data.thumbnail) return data.thumbnail;
  if (Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
    // yt-dlp orders thumbnails worst-to-best.
    return data.thumbnails[data.thumbnails.length - 1]?.url ?? null;
  }
  return null;
}

export default Track;
