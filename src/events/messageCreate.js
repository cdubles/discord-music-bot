import { Events } from 'discord.js';

import { ExtractionError } from '../audio/errors.js';
import { resolveCommand } from '../commands/index.js';
import { getPrefix } from '../db/guildSettings.js';
import logger from '../logger.js';
import * as embeds from '../ui/embeds.js';
import { createPrefixCtx, missingArgs } from '../util/ctx.js';
import { checkGuards } from '../util/guards.js';

const log = logger.child({ module: 'prefix' });

export default {
  name: Events.MessageCreate,

  async execute(client, message) {
    if (message.author.bot || !message.guild || !message.content) return;

    const prefix = getPrefix(message.guild.id);

    // A mention works as a prefix too, so a forgotten custom prefix is always
    // recoverable without needing slash commands.
    const mention = new RegExp(`^<@!?${client.user.id}>\\s*`);
    const mentioned = mention.test(message.content);

    if (!mentioned && !message.content.startsWith(prefix)) return;

    const withoutPrefix = mentioned
      ? message.content.replace(mention, '')
      : message.content.slice(prefix.length);

    const tokens = withoutPrefix.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      if (mentioned) {
        await message.reply(
          embeds.info(`My prefix here is \`${prefix}\`. Try \`${prefix}help\`.`),
        );
      }
      return;
    }

    const command = resolveCommand(client, tokens[0]);
    if (!command || !(command.surfaces ?? []).includes('prefix')) return;

    const ctx = createPrefixCtx(message, command, tokens.slice(1));

    const denied = checkGuards(command, ctx);
    if (denied) {
      await message.reply(embeds.error(denied));
      return;
    }

    const missing = missingArgs(command, ctx);
    if (missing.length > 0) {
      const usage = (command.args ?? [])
        .map((arg) => (arg.required ? `<${arg.name}>` : `[${arg.name}]`))
        .join(' ');
      await message.reply(
        embeds.error(
          `Missing \`${missing.join('`, `')}\`.\nUsage: \`${prefix}${command.name} ${usage}\``,
        ),
      );
      return;
    }

    try {
      await command.execute(ctx);
    } catch (error) {
      const userMessage =
        error instanceof ExtractionError
          ? error.message
          : (error.message ?? 'Something went wrong running that command.');

      if (error instanceof ExtractionError) {
        log[error.operatorActionable ? 'warn' : 'debug'](
          { kind: error.kind, command: command.name },
          'Command failed during extraction',
        );
      } else {
        log.error({ err: error, command: command.name }, 'Command threw');
      }

      await ctx.reply(embeds.error(userMessage)).catch(() => {});
    }
  },
};
