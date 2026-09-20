import { SlashCommandBuilder } from 'discord.js';

import { VOLUME_MAX } from '../../constants.js';
import { getSettings, updateSettings } from '../../db/guildSettings.js';
import * as embeds from '../../ui/embeds.js';
import { clampVolume } from '../../util/validate.js';

export default {
  name: 'defaultvolume',
  aliases: ['dvol'],
  description: 'Set the volume the bot starts at',
  category: 'Settings',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'manageGuild'],

  args: [{ name: 'level', type: 'int', required: false, description: `0-${VOLUME_MAX}` }],

  slash: new SlashCommandBuilder()
    .setName('defaultvolume')
    .setDescription('Set the volume the bot starts at')
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription(`Starting volume (0-${VOLUME_MAX}). Omit to see the current value.`)
        .setMinValue(0)
        .setMaxValue(VOLUME_MAX),
    ),

  async execute(ctx) {
    const level = ctx.get('level');

    if (level === null || level === undefined) {
      const current = getSettings(ctx.guild.id).default_volume;
      return ctx.reply(embeds.info(`The starting volume is **${current}%**.`));
    }

    const value = clampVolume(level);
    if (value === null) return ctx.reply(embeds.error('That is not a valid volume.'));

    updateSettings(ctx.guild.id, { default_volume: value });
    return ctx.reply(
      embeds.success(
        `New sessions will start at **${value}%**. Use \`/volume\` to change the current one.`,
      ),
    );
  },
};
