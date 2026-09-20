import logger from '../logger.js';
import Track from '../core/Track.js';
import { getPlaylist, search } from './ytdlp.js';

const log = logger.child({ module: 'autoplay' });

/** Tracks considered for autoplay per lookup. */
const CANDIDATE_COUNT = 15;

/**
 * Choose a track to follow `seed` once the queue runs dry.
 *
 * Strategy: ask YouTube for the seed video's auto-generated mix (the "RD"
 * radio playlist), which is exactly the "related tracks" signal we want. If
 * the mix isn't available — common for obscure or age-gated videos — fall back
 * to a keyword search built from the seed's artist.
 */
export async function pickRelated(seed, history = []) {
  if (!seed?.url) return null;

  const played = new Set(
    [seed, ...history].map((track) => normalizeUrl(track?.url)).filter(Boolean),
  );

  const candidates = (await fromMix(seed)) ?? (await fromSearch(seed)) ?? [];

  const fresh = candidates.filter((track) => {
    const key = normalizeUrl(track.url);
    return key && !played.has(key) && !track.isLive;
  });

  if (fresh.length === 0) return null;

  // Pick randomly from the top few so a stalled queue doesn't loop the same
  // handful of songs every time.
  const pool = fresh.slice(0, 5);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** YouTube's auto-generated mix for a video is playlist "RD<videoId>". */
async function fromMix(seed) {
  const videoId = extractVideoId(seed.url);
  if (!videoId) return null;

  try {
    const { entries } = await getPlaylist(
      `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`,
      CANDIDATE_COUNT,
    );
    if (!entries?.length) return null;
    return entries.map((entry) => Track.fromYtdlp(entry, seed.requestedBy));
  } catch (error) {
    log.debug({ err: error }, 'Mix lookup failed; falling back to search');
    return null;
  }
}

async function fromSearch(seed) {
  const query = seed.author ? `${seed.author} songs` : seed.title;
  if (!query) return null;

  try {
    const results = await search(query, CANDIDATE_COUNT);
    return results.map((entry) => Track.fromYtdlp(entry, seed.requestedBy));
  } catch (error) {
    log.debug({ err: error }, 'Autoplay search failed');
    return null;
  }
}

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1) || null;
    }
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  const id = url ? extractVideoId(url) : null;
  return id ?? url ?? null;
}

export default pickRelated;
