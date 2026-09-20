import { Events, MessageFlags } from 'discord.js';

import { ExtractionError } from '../audio/errors.js';
import { resolveCommand } from '../commands/index.js';
import logger from '../logger.js';
import * as embeds from '../ui/embeds.js';
import { createSlashCtx, missingArgs } from '../util/ctx.js';
import { checkGuards } from '../util/guards.js';

const log = logger.child({ module: 'interactions' });

export default {
  name: Events.InteractionCreate,

  async execute(client, interaction) {
    if (interaction.isAutocomplete()) {
      return handleAutocomplete(client, interaction);
    }
    if (interaction.isChatInputCommand()) {
      return handleCommand(client, interaction);
    }
    // Buttons and select menus are handled by per-message collectors attached
    // in the commands that create them.
    return undefined;
  },
};

async function handleCommand(client, interaction) {
  const command = resolveCommand(client, interaction.commandName);
  if (!command) return;

  const ctx = createSlashCtx(interaction, command);

  const denied = checkGuards(command, ctx);
  if (denied) {
    return interaction.reply({
      ...embeds.error(denied),
      flags: MessageFlags.Ephemeral,
    });
  }

  const missing = missingArgs(command, ctx);
  if (missing.length > 0) {
    return interaction.reply({
      ...embeds.error(`Missing required option: \`${missing.join('`, `')}\`.`),
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    await command.execute(ctx);
  } catch (error) {
    await reportFailure(ctx, command, error);
  }

  return undefined;
}

async function handleAutocomplete(client, interaction) {
  const command = resolveCommand(client, interaction.commandName);
  if (!command?.autocomplete) return interaction.respond([]);

  try {
    return await command.autocomplete(interaction);
  } catch (error) {
    log.debug({ err: error, command: interaction.commandName }, 'Autocomplete failed');
    // Never leave the user staring at a spinner.
    return interaction.respond([]).catch(() => {});
  }
}

async function reportFailure(ctx, command, error) {
  // ExtractionErrors already carry a message written for the user.
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

  const payload = { ...embeds.error(userMessage), ephemeral: true };
  try {
    await ctx.reply(payload);
  } catch {
    // The interaction may have expired; nothing more we can do.
  }
}
