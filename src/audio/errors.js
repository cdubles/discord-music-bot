/**
 * Turn yt-dlp's stderr into something a user can act on.
 *
 * Without this, every extraction failure looks identical ("the bot is broken")
 * and there's no signal about whether the fix is refreshing cookies, updating
 * yt-dlp, or just picking a different video.
 */

export class ExtractionError extends Error {
  constructor(message, { kind, stderr, cause } = {}) {
    super(message);
    this.name = 'ExtractionError';
    this.kind = kind ?? 'unknown';
    this.stderr = stderr ?? '';
    if (cause) this.cause = cause;
  }
}

const PATTERNS = [
  {
    kind: 'bot-detection',
    test: /sign in to confirm|confirm you.?re not a bot|not a bot/i,
    message:
      "YouTube is challenging this request as automated traffic. The bot's cookies likely need refreshing — see YTDLP_COOKIES_FILE in the README.",
    operator: true,
  },
  {
    kind: 'private',
    test: /private video|this video is private/i,
    message: 'That video is private, so I can\'t play it.',
  },
  {
    kind: 'unavailable',
    test: /video unavailable|has been removed|no longer available|account.*terminated/i,
    message: 'That video is unavailable — it may have been removed.',
  },
  {
    kind: 'age-restricted',
    test: /age.?restricted|inappropriate for some users|confirm your age/i,
    message:
      'That video is age-restricted. Playing it needs a signed-in cookie file (see YTDLP_COOKIES_FILE).',
    operator: true,
  },
  {
    kind: 'geo-blocked',
    test: /not available in your country|geo.?restricted|blocked it in your country/i,
    message: "That video is blocked in the bot host's region.",
  },
  {
    kind: 'members-only',
    test: /members.?only|join this channel to get access/i,
    message: 'That video is members-only.',
  },
  {
    kind: 'live-premiere',
    test: /premieres in|this live event will begin/i,
    message: "That video hasn't premiered yet.",
  },
  {
    kind: 'forbidden',
    test: /HTTP Error 403|Forbidden/i,
    message:
      'YouTube refused the download (HTTP 403). This usually means yt-dlp is out of date or the host IP is rate-limited.',
    operator: true,
  },
  {
    kind: 'rate-limited',
    test: /HTTP Error 429|Too Many Requests/i,
    message: 'YouTube is rate-limiting the bot right now. Try again in a few minutes.',
    operator: true,
  },
  {
    kind: 'unsupported-url',
    test: /unsupported url|is not a valid URL/i,
    message: "I don't know how to play that link.",
  },
  {
    kind: 'no-results',
    test: /no video results|did not match any/i,
    message: 'No results found for that search.',
  },
  {
    kind: 'network',
    test: /unable to download|connection reset|timed out|temporary failure in name resolution/i,
    message: 'Network error reaching YouTube. Try again in a moment.',
    operator: true,
  },
  {
    kind: 'outdated',
    test: /unable to extract|player response|nsig extraction failed|signature extraction/i,
    message:
      'YouTube changed something yt-dlp cannot handle yet. The bot needs a yt-dlp update (bump YTDLP_VERSION and rebuild).',
    operator: true,
  },
];

/**
 * Classify stderr into an ExtractionError.
 * `operator: true` on a pattern marks failures the bot owner must fix, which
 * the caller logs at warn level rather than debug.
 */
export function classifyError(stderr, fallback = 'Something went wrong loading that track.') {
  const text = String(stderr ?? '');

  for (const pattern of PATTERNS) {
    if (pattern.test.test(text)) {
      const error = new ExtractionError(pattern.message, { kind: pattern.kind, stderr: text });
      error.operatorActionable = Boolean(pattern.operator);
      return error;
    }
  }

  return new ExtractionError(fallback, { kind: 'unknown', stderr: text });
}

export default classifyError;
