/**
 * Parse a user-supplied position into milliseconds.
 * Accepts "90", "1:30", "1:02:03", "1m30s", "90s", "2h".
 * Returns null when the input isn't a recognisable duration.
 */
export function parseDuration(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;

  // Bare number => seconds.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.round(Number.parseFloat(raw) * 1000);
  }

  // Colon form: ss, mm:ss or hh:mm:ss.
  if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(raw)) {
    const parts = raw.split(':').map(Number);
    const [h, m, s] = parts.length === 3 ? parts : [0, ...parts];
    if (m >= 60 || s >= 60) return null;
    return ((h * 60 + m) * 60 + s) * 1000;
  }

  // Unit form: 1h2m3s, 90s, 2m.
  const unitMatch = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (unitMatch && unitMatch.slice(1).some(Boolean)) {
    const [, h = 0, m = 0, s = 0] = unitMatch;
    return Math.round(((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000);
  }

  return null;
}

/** Format milliseconds as "m:ss" or "h:mm:ss". */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Human-readable duration for summaries, e.g. "1 hour 5 minutes". */
export function formatDurationLong(ms) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts = [];
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (!hours && seconds) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : '0 seconds';
}

/** Promise-based delay. */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
