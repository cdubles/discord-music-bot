import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

import { Colors } from '../../constants.js';
import { getPrefix } from '../../db/guildSettings.js';
import * as embeds from '../../ui/embeds.js';
import { resolveCommand } from '../index.js';

export default {
  name: 'help',
  aliases: ['h', 'commands'],
  description: 'List the commands, or explain one',
  category: 'Misc',
  surfaces: ['slash', 'prefix'],

  args: [{ name: 'command', type: 'string', required: false, description: 'Command to explain' }],

  slash: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List the commands, or explain one')
    .addStringOption((option) =>
      option.setName('command').setDescription('Command to explain').setAutocomplete(true),
    ),

  async execute(ctx) {
    const prefix = ctx.guild ? getPrefix(ctx.guild.id) : '!';
    const requested = ctx.get('command');

    if (requested) {
      const command = resolveCommand(ctx.client, requested);
      if (!command) return ctx.reply(embeds.error(`There's no \`${requested}\` command.`));
      return ctx.reply({ embeds: [detailEmbed(command, prefix)] });
    }

    const byCategory = new Map();
    for (const command of ctx.client.commands.values()) {
      const category = command.category ?? 'Other';
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(command);
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.PRIMARY)
      .setTitle('Commands')
      .setDescription(
        `Every command works as a slash command (\`/play\`) or with the prefix (\`${prefix}play\`).`,
      );

    for (const [category, commands] of [...byCategory].sort()) {
      embed.addFields({
        name: category,
        value: commands
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((command) => `\`${command.name}\``)
          .join(' '),
      });
    }

    embed.setFooter({ text: `Use ${prefix}help <command> for details on one.` });
    return ctx.reply({ embeds: [embed] });
  },

  async autocomplete(interaction) {
    const focused = String(interaction.options.getFocused() ?? '').toLowerCase();
    const names = [...interaction.client.commands.keys()]
      .filter((name) => name.includes(focused))
      .slice(0, 25)
      .map((name) => ({ name, value: name }));
    return interaction.respond(names);
  },
};

function detailEmbed(command, prefix) {
  const usageArgs = (command.args ?? [])
    .map((arg) => (arg.required ? `<${arg.name}>` : `[${arg.name}]`))
    .join(' ');

  const embed = new EmbedBuilder()
    .setColor(Colors.PRIMARY)
    .setTitle(`${prefix}${command.name}`)
    .setDescription(command.description ?? 'No description.')
    .addFields({
      name: 'Usage',
      value: `\`${prefix}${command.name}${usageArgs ? ` ${usageArgs}` : ''}\`\n\`/${command.name}\``,
    });

  if (command.aliases?.length) {
    embed.addFields({
      name: 'Aliases',
      value: command.aliases.map((alias) => `\`${alias}\``).join(' '),
      inline: true,
    });
  }

  if (command.args?.length) {
    embed.addFields({
      name: 'Arguments',
      value: command.args
        .map(
          (arg) =>
            `\`${arg.name}\`${arg.required ? '' : ' *(optional)*'} — ${
              arg.description ?? 'no description'
            }`,
        )
        .join('\n'),
    });
  }

  return embed;
}
