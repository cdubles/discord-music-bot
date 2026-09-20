import { MessageFlags } from 'discord.js';

import { parseDuration } from './time.js';

/**
 * The shared command context.
 *
 * Commands declare their arguments once (the `args` spec) and implement
 * `execute(ctx)` once. `createSlashCtx` and `createPrefixCtx` both produce an
 * object with this same surface, so handlers never branch on where the command
 * came from — except for genuinely surface-specific affordances like ephemeral
 * replies, which degrade to normal replies on the prefix side.
 */

class BaseContext {
  constructor(command, { client, guild, member, channel, user }) {
    this.command = command;
    this.client = client;
    this.guild = guild;
    this.member = member;
    this.channel = channel;
    this.user = user;
  }

  /** The voice channel the invoking member is currently in, if any. */
  get voiceChannel() {
    return this.member?.voice?.channel ?? null;
  }

  /** The guild's MusicPlayer, or undefined when nothing is playing. */
  get player() {
    return this.client.players?.get(this.guild?.id);
  }
}

class SlashContext extends BaseContext {
  isSlash = true;

  constructor(interaction, command) {
    super(command, {
      client: interaction.client,
      guild: interaction.guild,
      member: interaction.member,
      channel: interaction.channel,
      user: interaction.user,
    });
    this.interaction = interaction;
    this.raw = interaction;
  }

  /** Subcommand name for grouped commands like /playlist save. */
  get subcommand() {
    return this.interaction.options.getSubcommand(false);
  }

  get(name) {
    const spec = this.command.args?.find((arg) => arg.name === name);
    const options = this.interaction.options;

    switch (spec?.type) {
      case 'int':
        return options.getInteger(name) ?? spec.default ?? null;
      case 'number':
        return options.getNumber(name) ?? spec.default ?? null;
      case 'boolean':
        return options.getBoolean(name) ?? spec.default ?? null;
      case 'user':
        return options.getUser(name) ?? null;
      case 'channel':
        return options.getChannel(name) ?? null;
      case 'duration': {
        const value = options.getString(name);
        return value === null ? (spec.default ?? null) : parseDuration(value);
      }
      default:
        return options.getString(name) ?? spec?.default ?? null;
    }
  }

  async defer({ ephemeral = false } = {}) {
    if (this.interaction.deferred || this.interaction.replied) return;
    await this.interaction.deferReply(
      ephemeral ? { flags: MessageFlags.Ephemeral } : {},
    );
  }

  async reply(payload) {
    const data = normalize(payload, true);
    if (this.interaction.deferred || this.interaction.replied) {
      return this.interaction.editReply(stripFlags(data));
    }
    return this.interaction.reply(data);
  }

  async followUp(payload) {
    return this.interaction.followUp(normalize(payload, true));
  }

  async edit(payload) {
    return this.interaction.editReply(stripFlags(normalize(payload, true)));
  }

  async fetchReply() {
    return this.interaction.fetchReply();
  }
}

class PrefixContext extends BaseContext {
  isSlash = false;
  #sent = null;

  constructor(message, command, args) {
    super(command, {
      client: message.client,
      guild: message.guild,
      member: message.member,
      channel: message.channel,
      user: message.author,
    });
    this.message = message;
    this.raw = message;
    this.rawArgs = args;
    this.parsed = parseArgs(command, args);
  }

  /**
   * For grouped commands the first token acts as the subcommand,
   * e.g. `!playlist save myjams`.
   */
  get subcommand() {
    return this.command.subcommands ? (this.rawArgs[0]?.toLowerCase() ?? null) : null;
  }

  get(name) {
    return this.parsed[name] ?? null;
  }

  async defer() {
    // No interaction to acknowledge; a typing indicator is the closest analogue.
    try {
      await this.channel.sendTyping();
    } catch {
      // Typing is best-effort — never fail a command over it.
    }
  }

  async reply(payload) {
    const data = normalize(payload, false);
    if (this.#sent) return this.edit(data);
    this.#sent = await this.message.reply({
      ...data,
      allowedMentions: { repliedUser: false },
    });
    return this.#sent;
  }

  async followUp(payload) {
    return this.channel.send(normalize(payload, false));
  }

  async edit(payload) {
    const data = normalize(payload, false);
    if (!this.#sent) return this.reply(data);
    return this.#sent.edit(data);
  }

  async fetchReply() {
    return this.#sent;
  }
}

/** Drop `ephemeral` for prefix, translate it to flags for slash. */
function normalize(payload, isSlash) {
  const data = typeof payload === 'string' ? { content: payload } : { ...payload };
  const { ephemeral, ...rest } = data;

  if (!isSlash) return rest;
  if (!ephemeral) return rest;
  return { ...rest, flags: MessageFlags.Ephemeral };
}

/** editReply rejects message flags; strip them. */
function stripFlags(data) {
  const { flags, ...rest } = data;
  return rest;
}

/**
 * Turn raw prefix tokens into named values using the command's `args` spec.
 *
 * Supported types: string, rest (consumes the remainder), int, number,
 * boolean, choice, duration, user, channel.
 */
function parseArgs(command, tokens) {
  const spec = command.args ?? [];
  const values = {};
  let cursor = 0;

  for (const arg of spec) {
    if (arg.type === 'rest') {
      const remainder = tokens.slice(cursor).join(' ').trim();
      values[arg.name] = remainder || arg.default || null;
      cursor = tokens.length;
      continue;
    }

    const token = tokens[cursor];
    if (token === undefined) {
      values[arg.name] = arg.default ?? null;
      continue;
    }
    cursor += 1;

    switch (arg.type) {
      case 'int': {
        const n = Number.parseInt(token, 10);
        values[arg.name] = Number.isNaN(n) ? (arg.default ?? null) : n;
        break;
      }
      case 'number': {
        const n = Number.parseFloat(token);
        values[arg.name] = Number.isNaN(n) ? (arg.default ?? null) : n;
        break;
      }
      case 'boolean':
        values[arg.name] = ['true', 'yes', 'on', '1'].includes(token.toLowerCase());
        break;
      case 'choice': {
        const choice = token.toLowerCase();
        values[arg.name] = arg.choices?.includes(choice) ? choice : (arg.default ?? null);
        break;
      }
      case 'duration':
        values[arg.name] = parseDuration(token) ?? arg.default ?? null;
        break;
      case 'user':
        values[arg.name] = token.replace(/[<@!>]/g, '') || null;
        break;
      case 'channel':
        values[arg.name] = token.replace(/[<#>]/g, '') || null;
        break;
      default:
        values[arg.name] = token;
    }
  }

  return values;
}

/** Names of required args the user failed to supply. */
export function missingArgs(command, ctx) {
  return (command.args ?? [])
    .filter((arg) => arg.required && (ctx.get(arg.name) === null || ctx.get(arg.name) === undefined))
    .map((arg) => arg.name);
}

export function createSlashCtx(interaction, command) {
  return new SlashContext(interaction, command);
}

export function createPrefixCtx(message, command, args) {
  return new PrefixContext(message, command, args);
}
