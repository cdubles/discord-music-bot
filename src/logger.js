import pino from 'pino';

import config, { isProduction } from './config.js';

const logger = pino({
  level: config.logLevel,
  // Pretty output in dev; structured JSON in production for log aggregation.
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
  redact: {
    paths: ['token', 'config.token', '*.token'],
    censor: '[redacted]',
  },
});

/** A child logger tagged with a guild, so per-guild playback is traceable. */
export function guildLogger(guildId, name) {
  return logger.child({ guild: guildId, ...(name ? { module: name } : {}) });
}

export default logger;
