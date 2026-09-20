import { SlashCommandBuilder } from 'discord.js';

import { VOLUME_MAX, VOLUME_SOFT_MAX } from '../../constants.js';
import * as embeds from '../../ui/embeds.js';

export default {
  name: 'volume',
  aliases: ['vol', 'v'],
  description: 'Show or change the playback volume',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'hasPlayer'],

  args: [{ name: 'level', type: 'int', required: false, description: `0-${VOLUME_MAX}` }],

  slash: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Show or change the playback volume')
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription(`Volume percentage (0-${VOLUME_MAX}). Omit to see the current level.`)
        .setMinValue(0)
        .setMaxValue(VOLUME_MAX),
    ),

  async execute(ctx) {
    const player = ctx.player;
    const level = ctx.get('level');

    if (level === null || level === undefined) {
      return ctx.reply(embeds.info(`Volume is **${player.volume}%**.`));
    }

    // Changing volume requires being in the channel; reading it doesn't.
    const botChannelId = ctx.guild.members.me?.voice?.channelId;
    if (botChannelId && ctx.voiceChannel?.id !== botChannelId) {
      return ctx.reply(embeds.error(`You need to be in <#${botChannelId}> to change the volume.`));
    }

    const applied = player.setVolume(level);
    if (applied === null) {
      return ctx.reply(embeds.error('That is not a valid volume.'));
    }

    const note =
      applied > VOLUME_SOFT_MAX
        ? '\n*Above 150% audio may start to clip.*'
        : '';
    return ctx.reply(embeds.success(`Volume set to **${applied}%**.${note}`));
  },
};
