import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

import { Colors } from '../../constants.js';
import { getSettings, updateSettings } from '../../db/guildSettings.js';
import * as embeds from '../../ui/embeds.js';
import { formatDurationLong } from '../../util/time.js';

export default {
  name: 'settings',
  aliases: ['config'],
  description: 'Show the current server settings',
  category: 'Settings',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild'],

  args: [
    { name: 'key', type: 'string', required: false },
    { name: 'value', type: 'string', required: false },
  ],

  slash: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Show the current server settings')
    .addStringOption((option) =>
      option
        .setName('key')
        .setDescription('Setting to change (requires Manage Server)')
        .addChoices(
          { name: 'Idle timeout (seconds)', value: 'idle_timeout_s' },
          { name: 'DJ role ID', value: 'dj_role_id' },
          { name: 'Announce tracks (on/off)', value: 'announce_tracks' },
        ),
    )
    .addStringOption((option) =>
      option.setName('value').setDescription('New value for the chosen setting'),
    ),

  async execute(ctx) {
    const key = ctx.get('key');
    const value = ctx.get('value');

    if (key && value) {
      if (!ctx.member.permissions.has('ManageGuild')) {
        return ctx.reply(
          embeds.error('You need the **Manage Server** permission to change settings.'),
        );
      }

      const patch = buildPatch(key, value);
      if (!patch) return ctx.reply(embeds.error('That value is not valid for this setting.'));

      updateSettings(ctx.guild.id, patch);
      return ctx.reply(embeds.success(`Updated \`${key}\`.`));
    }

    const settings = getSettings(ctx.guild.id);
    const embed = new EmbedBuilder()
      .setColor(Colors.PRIMARY)
      .setTitle(`Settings for ${ctx.guild.name}`)
      .addFields(
        { name: 'Prefix', value: `\`${settings.prefix}\``, inline: true },
        { name: 'Starting volume', value: `${settings.default_volume}%`, inline: true },
        { name: 'Autoplay', value: settings.autoplay ? 'On' : 'Off', inline: true },
        {
          name: 'Idle timeout',
          value: formatDurationLong(settings.idle_timeout_s * 1000),
          inline: true,
        },
        {
          name: 'DJ role',
          value: settings.dj_role_id ? `<@&${settings.dj_role_id}>` : 'Everyone',
          inline: true,
        },
        {
          name: 'Track announcements',
          value: settings.announce_tracks ? 'On' : 'Off',
          inline: true,
        },
      );

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
};

function buildPatch(key, value) {
  switch (key) {
    case 'idle_timeout_s': {
      const seconds = Number.parseInt(value, 10);
      if (Number.isNaN(seconds) || seconds < 10 || seconds > 3600) return null;
      return { idle_timeout_s: seconds };
    }
    case 'dj_role_id': {
      const id = value.replace(/[<@&>]/g, '');
      if (value.toLowerCase() === 'none' || value.toLowerCase() === 'off') {
        return { dj_role_id: null };
      }
      return /^\d{17,20}$/.test(id) ? { dj_role_id: id } : null;
    }
    case 'announce_tracks': {
      const on = ['on', 'true', 'yes', '1'].includes(value.toLowerCase());
      const off = ['off', 'false', 'no', '0'].includes(value.toLowerCase());
      if (!on && !off) return null;
      return { announce_tracks: on ? 1 : 0 };
    }
    default:
      return null;
  }
}
