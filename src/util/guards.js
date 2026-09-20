import { PermissionFlagsBits } from 'discord.js';

import { getSettings } from '../db/guildSettings.js';

/**
 * Preconditions commands declare by name in their `guards` array. Each returns
 * null when the check passes, or a user-facing message explaining the failure.
 */
const guards = {
  inGuild(ctx) {
    return ctx.guild ? null : 'This command only works inside a server.';
  },

  inVoice(ctx) {
    return ctx.voiceChannel ? null : 'You need to be in a voice channel first.';
  },

  /** The member must share the bot's current voice channel, if it's in one. */
  sameVoice(ctx) {
    const botChannelId = ctx.guild?.members?.me?.voice?.channelId;
    if (!botChannelId) return null;
    if (ctx.voiceChannel?.id === botChannelId) return null;
    return `You need to be in <#${botChannelId}> to control playback.`;
  },

  hasPlayer(ctx) {
    return ctx.player ? null : 'Nothing is playing right now.';
  },

  isPlaying(ctx) {
    return ctx.player?.current ? null : 'Nothing is playing right now.';
  },

  canJoin(ctx) {
    const channel = ctx.voiceChannel;
    if (!channel) return 'You need to be in a voice channel first.';
    const me = ctx.guild.members.me;
    const perms = channel.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.Connect)) {
      return `I don't have permission to join ${channel}.`;
    }
    if (!perms.has(PermissionFlagsBits.Speak)) {
      return `I don't have permission to speak in ${channel}.`;
    }
    if (channel.full && !perms.has(PermissionFlagsBits.MoveMembers)) {
      return `${channel} is full.`;
    }
    return null;
  },

  manageGuild(ctx) {
    return ctx.member?.permissions?.has(PermissionFlagsBits.ManageGuild)
      ? null
      : 'You need the **Manage Server** permission to change bot settings.';
  },

  /**
   * DJ role check. Passes when no DJ role is configured, when the member has
   * it, or when they can manage the server.
   */
  dj(ctx) {
    const settings = getSettings(ctx.guild.id);
    if (!settings.dj_role_id) return null;
    if (ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
    if (ctx.member.roles.cache.has(settings.dj_role_id)) return null;
    return `You need the <@&${settings.dj_role_id}> role to use that.`;
  },
};

/** Run a command's guards in order; returns the first failure message or null. */
export function checkGuards(command, ctx) {
  for (const name of command.guards ?? []) {
    const guard = guards[name];
    if (!guard) continue;
    const failure = guard(ctx);
    if (failure) return failure;
  }
  return null;
}

export default guards;
