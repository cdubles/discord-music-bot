import { HISTORY_LIMIT, LoopMode } from '../constants.js';

/**
 * The track list for one guild.
 *
 * Pure data — no Discord objects, no voice state, no I/O — so the ordering
 * rules (especially loop-mode interactions) can be reasoned about and tested
 * in isolation from the playback machinery.
 */
export class Queue {
  /** Upcoming tracks; index 0 plays next. */
  tracks = [];
  /** The track currently playing, if any. */
  current = null;
  /** Most-recently-played first. Seeds autoplay and powers /previous. */
  previous = [];
  loopMode = LoopMode.OFF;
  autoplay = false;

  constructor({ maxSize = 1000 } = {}) {
    this.maxSize = maxSize;
  }

  get size() {
    return this.tracks.length;
  }

  get isEmpty() {
    return this.tracks.length === 0;
  }

  get totalDurationMs() {
    const upcoming = this.tracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
    return upcoming + (this.current?.durationMs ?? 0);
  }

  /**
   * Append tracks, or insert them at `position` (0-based).
   * Returns how many were actually accepted after the size cap.
   */
  add(input, { position = null } = {}) {
    const incoming = Array.isArray(input) ? input : [input];
    const room = Math.max(0, this.maxSize - this.tracks.length);
    const accepted = incoming.slice(0, room);

    if (accepted.length === 0) return 0;

    if (position === null || position >= this.tracks.length) {
      this.tracks.push(...accepted);
    } else {
      this.tracks.splice(Math.max(0, position), 0, ...accepted);
    }
    return accepted.length;
  }

  /**
   * Advance to the next track, applying the loop mode.
   *
   * - track: replay `current`
   * - queue: rotate `current` to the back, then take the head
   * - off:   take the head, pushing `current` into history
   *
   * Returns the new current track, or null when the queue is exhausted.
   */
  next() {
    if (this.loopMode === LoopMode.TRACK && this.current) {
      return this.current;
    }

    if (this.current) {
      this.#remember(this.current);
      if (this.loopMode === LoopMode.QUEUE) {
        this.tracks.push(this.current);
      }
    }

    this.current = this.tracks.shift() ?? null;
    return this.current;
  }

  /** Jump forward by `count` tracks, discarding the ones skipped over. */
  skip(count = 1) {
    const toDrop = Math.max(0, Math.min(count - 1, this.tracks.length));
    for (let i = 0; i < toDrop; i += 1) {
      const dropped = this.tracks.shift();
      if (dropped && this.loopMode === LoopMode.QUEUE) this.tracks.push(dropped);
    }
  }

  remove(index) {
    if (index < 0 || index >= this.tracks.length) return null;
    return this.tracks.splice(index, 1)[0] ?? null;
  }

  move(from, to) {
    if (from < 0 || from >= this.tracks.length) return null;
    const target = Math.max(0, Math.min(to, this.tracks.length - 1));
    const [track] = this.tracks.splice(from, 1);
    this.tracks.splice(target, 0, track);
    return track;
  }

  /** Fisher-Yates over the upcoming tracks; `current` is left alone. */
  shuffle() {
    for (let i = this.tracks.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
    return this.tracks.length;
  }

  /** Empty the upcoming list. The current track keeps playing. */
  clear() {
    const removed = this.tracks.length;
    this.tracks = [];
    return removed;
  }

  /** Full reset, used by /stop and on destroy. */
  reset() {
    this.tracks = [];
    this.current = null;
    this.previous = [];
    this.loopMode = LoopMode.OFF;
  }

  /** One page of upcoming tracks, 1-based page number. */
  page(pageNumber = 1, size = 10) {
    const pages = Math.max(1, Math.ceil(this.tracks.length / size));
    const page = Math.min(Math.max(1, pageNumber), pages);
    const start = (page - 1) * size;

    return {
      items: this.tracks.slice(start, start + size),
      startIndex: start,
      page,
      pages,
      total: this.tracks.length,
      totalDurationMs: this.totalDurationMs,
    };
  }

  #remember(track) {
    this.previous.unshift(track);
    if (this.previous.length > HISTORY_LIMIT) {
      this.previous.length = HISTORY_LIMIT;
    }
  }
}

export default Queue;
