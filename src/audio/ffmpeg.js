import { spawn } from 'node:child_process';

import config from '../config.js';
import logger from '../logger.js';

const log = logger.child({ module: 'ffmpeg' });

/** Discord voice expects 48kHz stereo signed 16-bit little-endian PCM. */
const PCM_OUTPUT = ['-f', 's16le', '-ar', '48000', '-ac', '2'];

/**
 * Decode a piped input (yt-dlp's stdout) to PCM.
 *
 * No seeking here: `-ss` against `pipe:0` can't actually seek — ffmpeg would
 * read and discard everything up to the target, which is unusably slow on a
 * long track. Seeking goes through spawnSeek instead.
 */
export function spawnPipe(source) {
  const child = spawn(
    config.ffmpegPath,
    [
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-analyzeduration',
      '0',
      '-vn',
      ...PCM_OUTPUT,
      'pipe:1',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  attachDiagnostics(child);

  // EPIPE is expected whenever we kill yt-dlp first (skip, stop, seek).
  child.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') {
      log.debug({ err: error }, 'ffmpeg stdin error');
    }
  });

  source.pipe(child.stdin);
  return child;
}

/**
 * Decode a direct HTTP URL to PCM, starting at `seekMs`.
 *
 * `-ss` goes *before* `-i` so it's an input seek: against an HTTP source
 * ffmpeg issues a Range request and jumps straight to the offset. After `-i`
 * it would decode and discard everything preceding the target.
 *
 * The reconnect flags matter because googlevideo drops long-lived connections.
 */
export function spawnSeek(directUrl, seekMs = 0) {
  const args = [
    '-loglevel',
    'error',
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '5',
  ];

  if (seekMs > 0) {
    args.push('-ss', (seekMs / 1000).toFixed(3));
  }

  args.push('-i', directUrl, '-vn', ...PCM_OUTPUT, 'pipe:1');

  const child = spawn(config.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  attachDiagnostics(child);
  return child;
}

function attachDiagnostics(child) {
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4096);
  });
  Object.defineProperty(child, 'collectedStderr', { get: () => stderr });

  child.on('error', (error) => {
    log.error({ err: error }, 'Failed to spawn ffmpeg');
  });
}

/** Report the installed ffmpeg version, for the startup health check. */
export function getVersion() {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, ['-version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(out.split('\n')[0].trim())
        : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}
