import { SlashCommandBuilder } from 'discord.js';

import { getSettings, updateSettings } from '../../db/guildSettings.js';
import * as embeds from '../../ui/embeds.js';

export default {
  name: 'prefix',
  aliases: [],
  description: 'Show or change the text-command prefix',
  category: 'Settings',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild'],

  args: [{ name: 'value', type: 'string', required: false, description: 'New prefix' }],

  slash: new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('Show or change the text-command prefix')
    .addStringOption((option) =>
      option
        .setName('value')
        .setDescription('New prefix (1-5 characters). Omit to see the current one.')
        .setMinLength(1)
        .setMaxLength(5),
    ),

  async execute(ctx) {
    const value = ctx.get('value');

    if (!value) {
      const current = getSettings(ctx.guild.id).prefix;
      return ctx.reply(
        embeds.info(
          `The prefix is \`${current}\`. You can always mention me instead: ${ctx.client.user}`,
        ),
      );
    }

    // The permission check only applies to changing it, so it's inline here
    // rather than in `guards` — anyone may look the prefix up.
    const denied = ctx.member.permissions.has('ManageGuild')
      ? null
      : 'You need the **Manage Server** permission to change the prefix.';
    if (denied) return ctx.reply(embeds.error(denied));

    if (value.length > 5 || /\s/.test(value)) {
      return ctx.reply(embeds.error('The prefix must be 1-5 characters with no spaces.'));
    }

    updateSettings(ctx.guild.id, { prefix: value });
    return ctx.reply(embeds.success(`Prefix set to \`${value}\`. Try \`${value}play\`.`));
  },
};
