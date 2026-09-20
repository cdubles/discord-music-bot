import { ActivityType, Events } from 'discord.js';

import * as ffmpeg from '../audio/ffmpeg.js';
import * as ytdlp from '../audio/ytdlp.js';
import logger from '../logger.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    logger.info(
      { user: client.user.tag, guilds: client.guilds.cache.size },
      'Bot is online',
    );

    client.user.setPresence({
      activities: [{ name: '/play', type: ActivityType.Listening }],
      status: 'online',
    });

    // Fail loudly at startup rather than on the first /play: a missing or
    // broken binary is the single most common cause of "the bot is broken".
    await Promise.all([
      ytdlp
        .getVersion()
        .then((version) => logger.info({ version }, 'yt-dlp ready'))
        .catch((error) =>
          logger.error(
            { err: error },
            'yt-dlp is NOT available — playback will fail. Check YTDLP_PATH.',
          ),
        ),
      ffmpeg
        .getVersion()
        .then((version) => logger.info({ version }, 'ffmpeg ready'))
        .catch((error) =>
          logger.error(
            { err: error },
            'ffmpeg is NOT available — playback will fail. Check FFMPEG_PATH.',
          ),
        ),
    ]);
  },
};
