const FILLED = '▬';
const KNOB = '🔘';

/**
 * Render a playback progress bar, e.g. ▬▬▬🔘▬▬▬▬▬▬.
 * Live streams have no meaningful position, so callers skip this for them.
 */
export function renderProgressBar(positionMs, durationMs, length = 18) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return FILLED.repeat(length);
  }
  const ratio = Math.min(1, Math.max(0, positionMs / durationMs));
  const knobAt = Math.min(length - 1, Math.floor(ratio * length));
  return FILLED.repeat(knobAt) + KNOB + FILLED.repeat(length - knobAt - 1);
}

export default renderProgressBar;
