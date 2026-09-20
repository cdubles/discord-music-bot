import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function str(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}".`);
  }
  return value;
}

function list(name) {
  return str(name)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = Object.freeze({
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: str('DISCORD_GUILD_ID') || null,
  defaultPrefix: str('DEFAULT_PREFIX', '!'),
  ownerIds: Object.freeze(list('OWNER_IDS')),

  env: str('NODE_ENV', 'development'),
  logLevel: str('LOG_LEVEL', 'info'),
  dbPath: str('DB_PATH', './data/bot.db'),

  ffmpegPath: str('FFMPEG_PATH', 'ffmpeg'),
  ytdlpPath: str('YTDLP_PATH', 'yt-dlp'),

  idleTimeoutSeconds: int('IDLE_TIMEOUT_SECONDS', 300),
  defaultVolume: int('DEFAULT_VOLUME', 50),
  maxQueueSize: int('MAX_QUEUE_SIZE', 1000),
  maxPlaylistImport: int('MAX_PLAYLIST_IMPORT', 200),

  ytdlpCookiesFile: str('YTDLP_COOKIES_FILE') || null,
  ytdlpProxy: str('YTDLP_PROXY') || null,
});

export const isProduction = config.env === 'production';

export default config;
