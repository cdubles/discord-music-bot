import { spawn } from 'node:child_process';

import config from '../config.js';
import logger from '../logger.js';
import { classifyError, ExtractionError } from './errors.js';

const log = logger.child({ module: 'ytdlp' });

/** Last 8KB of stderr is plenty to classify a failure. */
const STDERR_LIMIT = 8192;

/** Metadata calls shouldn't hang forever if YouTube stalls. */
const METADATA_TIMEOUT_MS = 30_000;

/**
 * Flags shared by every invocation.
 *
 * player_client is the highest-leverage anti-bot-detection knob: different
 * clients get challenged differently, and rotating across them clears many
 * failures without needing cookies at all.
 */
function commonArgs() {
  const args = [
    '--no-warnings',
    '--no-call-home',
    '--no-check-certificates',
    '--geo-bypass',
    '--ignore-config',
    '--extractor-args',
    'youtube:player_client=android,web_safari',
  ];
  if (config.ytdlpCookiesFile) args.push('--cookies', config.ytdlpCookiesFile);
  if (config.ytdlpProxy) args.push('--proxy', config.ytdlpProxy);
  return args;
}

/** Run yt-dlp and buffer stdout as JSON. Used for metadata, never for audio. */
function runJson(args, { timeout = METADATA_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytdlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new ExtractionError('Timed out while looking that up.', { kind: 'timeout' }));
    }, timeout);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-STDERR_LIMIT);
    });

    child.on('error', (error) => {
      finish(
        reject,
        new ExtractionError(
          `Could not run yt-dlp (${config.ytdlpPath}). Is it installed?`,
          { kind: 'spawn', cause: error },
        ),
      );
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const error = classifyError(stderr);
        if (error.operatorActionable) {
          log.warn({ kind: error.kind, stderr: stderr.slice(-500) }, 'yt-dlp failed');
        } else {
          log.debug({ kind: error.kind }, 'yt-dlp failed');
        }
        finish(reject, error);
        return;
      }

      try {
        // --flat-playlist with -J emits one JSON object; some modes emit
        // newline-delimited objects, so handle both.
        const trimmed = stdout.trim();
        if (!trimmed) {
          finish(reject, new ExtractionError('No results found.', { kind: 'no-results' }));
          return;
        }
        if (trimmed.startsWith('{') && trimmed.includes('}\n{')) {
          finish(
            resolve,
            trimmed
              .split('\n')
              .filter(Boolean)
              .map((line) => JSON.parse(line)),
          );
          return;
        }
        finish(resolve, JSON.parse(trimmed));
      } catch (error) {
        finish(
          reject,
          new ExtractionError('Could not read the response from YouTube.', {
            kind: 'parse',
            cause: error,
          }),
        );
      }
    });
  });
}

/** Full metadata for a single video. */
export async function getInfo(url) {
  const data = await runJson([
    ...commonArgs(),
    '--no-playlist',
    '--skip-download',
    '-J',
    url,
  ]);
  // A URL with &list= can still resolve to a playlist object.
  if (data?._type === 'playlist' && Array.isArray(data.entries)) {
    if (data.entries.length === 0) {
      throw new ExtractionError('That link had no playable videos.', { kind: 'no-results' });
    }
    return data.entries[0];
  }
  return data;
}

/** Flat metadata for every entry in a playlist, capped at `limit`. */
export async function getPlaylist(url, limit = config.maxPlaylistImport) {
  const data = await runJson(
    [
      ...commonArgs(),
      '--flat-playlist',
      '--skip-download',
      '--playlist-end',
      String(limit),
      '-J',
      url,
    ],
    { timeout: 60_000 },
  );

  const entries = Array.isArray(data) ? data : (data?.entries ?? []);
  return {
    title: Array.isArray(data) ? 'Playlist' : (data?.title ?? 'Playlist'),
    entries: entries.filter((entry) => entry && entry.id),
  };
}

/** Search YouTube by keyword, returning flat metadata. */
export async function search(query, count = 5) {
  const data = await runJson([
    ...commonArgs(),
    '--flat-playlist',
    '--skip-download',
    '-J',
    `ytsearch${count}:${query}`,
  ]);

  const entries = Array.isArray(data) ? data : (data?.entries ?? []);
  return entries.filter((entry) => entry && entry.id);
}

/**
 * Resolve the direct media URL without downloading.
 *
 * Only used by the seek path: ffmpeg cannot seek a pipe, but given an HTTP URL
 * it can issue a Range request and genuinely jump to the target position.
 */
export async function getDirectUrl(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.ytdlpPath,
      [
        ...commonArgs(),
        '--no-playlist',
        '-f',
        'bestaudio[acodec=opus]/bestaudio/best',
        '-g',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new ExtractionError('Timed out resolving that track.', { kind: 'timeout' }));
    }, METADATA_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-STDERR_LIMIT);
    });
    child.on('error', (error) =>
      reject(new ExtractionError('Could not run yt-dlp.', { kind: 'spawn', cause: error })),
    );
    child.on('close', (code) => {
      clearTimeout(timer);
      const direct = stdout.trim().split('\n')[0];
      if (code !== 0 || !direct) {
        reject(classifyError(stderr, 'Could not resolve that track for seeking.'));
        return;
      }
      resolve(direct);
    });
  });
}

/**
 * Open an audio stream for a track.
 *
 * The piped form (`-o -`) is used rather than handing ffmpeg a direct URL: it
 * copes better with HLS/DASH fragmenting and throttling, and gives one clean
 * kill switch when the user skips.
 *
 * Returns the child process; the caller pipes `.stdout` into ffmpeg and calls
 * `.kill()` on skip/stop.
 */
export function openStream(url) {
  const child = spawn(
    config.ytdlpPath,
    [
      ...commonArgs(),
      '--no-playlist',
      '-f',
      'bestaudio[acodec=opus]/bestaudio/best',
      '--no-part',
      '--quiet',
      '-o',
      '-',
      url,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-STDERR_LIMIT);
  });
  // Exposed so the player can classify a failure that happens after spawn.
  Object.defineProperty(child, 'collectedStderr', { get: () => stderr });

  return child;
}

/** Report the installed yt-dlp version, for the startup health check. */
export function getVersion() {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytdlpPath, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(`yt-dlp exited ${code}`)),
    );
  });
}
