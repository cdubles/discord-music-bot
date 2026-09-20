import config from '../config.js';
import Track from '../core/Track.js';
import {
  isPurePlaylistUrl,
  isUrl,
  isYouTubePlaylistUrl,
  stripPlaylistParam,
} from '../util/validate.js';
import { ExtractionError } from './errors.js';
import { getInfo, getPlaylist, search } from './ytdlp.js';

/**
 * Turn whatever the user typed into playable tracks.
 *
 * Returns { type: 'track' | 'playlist', tracks, title }.
 *
 * A "watch?v=...&list=..." URL is treated as a single track — queueing the
 * entire playlist when someone shares a link to one song is rarely what they
 * meant. `expandPlaylist: true` overrides that.
 */
export async function resolveQuery(query, requestedBy, { expandPlaylist = false } = {}) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) throw new ExtractionError('Give me a song name or a link.', { kind: 'empty' });

  if (isUrl(trimmed)) {
    const wantsPlaylist =
      isYouTubePlaylistUrl(trimmed) && (expandPlaylist || isPurePlaylistUrl(trimmed));

    if (wantsPlaylist) {
      const { title, entries } = await getPlaylist(trimmed, config.maxPlaylistImport);
      if (entries.length === 0) {
        throw new ExtractionError('That playlist had no playable videos.', {
          kind: 'no-results',
        });
      }
      return {
        type: 'playlist',
        title,
        tracks: entries.map((entry) => Track.fromYtdlp(entry, requestedBy)),
      };
    }

    const info = await getInfo(stripPlaylistParam(trimmed));
    return { type: 'track', title: info.title, tracks: [Track.fromYtdlp(info, requestedBy)] };
  }

  // Not a URL: search by keyword and take the top hit.
  const results = await search(trimmed, 1);
  if (results.length === 0) {
    throw new ExtractionError(`No results found for "${trimmed}".`, { kind: 'no-results' });
  }

  return {
    type: 'track',
    title: results[0].title,
    tracks: [Track.fromYtdlp(results[0], requestedBy)],
  };
}

export default resolveQuery;
