import { Events } from 'discord.js';

import logger from '../logger.js';

const log = logger.child({ module: 'voiceState' });

/**
 * Two things to catch here:
 *  1. The bot being force-disconnected or dragged to another channel.
 *  2. The bot being left alone, which starts the inactivity countdown.
 */
export default {
  name: Events.VoiceStateUpdate,

  async execute(client, oldState, newState) {
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    const player = client.players?.get(guildId);
    if (!player || player.destroyed) return;

    // --- the bot's own state changed ---
    if (newState.id === client.user.id) {
      // Disconnected entirely.
      if (oldState.channelId && !newState.channelId) {
        log.info({ guild: guildId }, 'Bot was disconnected from voice');
        player.destroy('kicked');
        return;
      }
      // Moved to a different channel.
      if (newState.channelId && oldState.channelId !== newState.channelId) {
        player.voice.setChannel(newState.channelId);
      }
    }

    // --- anyone's state changed: recount the bot's channel ---
    const botChannelId = newState.guild.members.me?.voice?.channelId;
    if (!botChannelId) return;

    const channel = newState.guild.channels.cache.get(botChannelId);
    if (!channel) return;

    const humans = channel.members.filter((member) => !member.user.bot).size;

    if (humans === 0) {
      log.debug({ guild: guildId }, 'Left alone in voice; starting idle timer');
      player.startIdleTimer();
    } else if (player.current) {
      // Someone came back and there's still music queued.
      player.clearIdleTimer();
    }
  },
};
