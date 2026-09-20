/**
 * A minimal FIFO mutex.
 *
 * Playback transitions (play / skip / seek) tear down and respawn child
 * processes. Two of them interleaving leaves orphaned ffmpeg processes or a
 * resource attached to a player that has already moved on, so every such
 * transition runs through one of these per guild.
 */
export class AsyncLock {
  #tail = Promise.resolve();

  /** Run `fn` once all previously queued work has settled. */
  run(fn) {
    const result = this.#tail.then(fn, fn);
    // Swallow rejection for the chain only; the caller still sees it.
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export default AsyncLock;
