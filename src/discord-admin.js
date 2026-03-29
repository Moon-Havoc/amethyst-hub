const { PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { statements, logAction } = require("./db");

let activeClient = null;

const PERMISSION_LABELS = {
  [PermissionFlagsBits.ViewChannel.toString()]: "View Channels",
  [PermissionFlagsBits.SendMessages.toString()]: "Send Messages",
  [PermissionFlagsBits.EmbedLinks.toString()]: "Embed Links",
  [PermissionFlagsBits.ReadMessageHistory.toString()]: "Read Message History",
  [PermissionFlagsBits.KickMembers.toString()]: "Kick Members",
  [PermissionFlagsBits.BanMembers.toString()]: "Ban Members",
  [PermissionFlagsBits.ModerateMembers.toString()]: "Moderate Members",
  [PermissionFlagsBits.ManageRoles.toString()]: "Manage Roles",
};

function setBotClient(client) {
  activeClient = client;
}

function getBotClient() {
  return activeClient;
}

function parseDuration(value) {
  const input = String(value || "").trim().toLowerCase();
  const match = input.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    throw new Error("Duration must look like 30m, 12h, or 7d.");
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit];
}

function permissionName(permission) {
  return PERMISSION_LABELS[permission.toString()] || String(permission);
}

async function getReadyClient() {
  if (!activeClient || !activeClient.isReady()) {
    throw new Error("Discord bot is not connected right now. Check that the bot is online before running website actions.");
  }

  return activeClient;
}

async function getConfiguredGuild() {
  const client = await getReadyClient();
  const guildId = String(config.discordGuildId || "").trim();

  if (!guildId) {
    throw new Error("DISCORD_GUILD_ID is not configured.");
  }

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    throw new Error("The configured Discord server could not be found by the bot.");
  }

  return guild;
}

async function getBotMember(guild) {
  return guild.members.me || guild.members.fetchMe();
}

async function ensureBotPermissions(guild, permissions, actionLabel) {
  const botMember = await getBotMember(guild);
  const missing = permissions.filter((permission) => !botMember.permissions.has(permission));

  if (!missing.length) {
    return botMember;
  }

  throw new Error(
    `The bot is missing permission for ${actionLabel}: ${missing.map(permissionName).join(", ")}.`,
  );
}

async function resolveMember(guild, raw) {
  if (!raw) {
    return null;
  }

  const input = String(raw).trim();
  const mentionMatch = input.match(/^<@!?(\d+)>$/);
  const userId = mentionMatch ? mentionMatch[1] : /^\d+$/.test(input) ? input : null;

  if (userId) {
    return guild.members.fetch(userId).catch(() => null);
  }

  const lowered = input.toLowerCase();
  const cached = guild.members.cache.find((member) => {
    return (
      member.user.username.toLowerCase() === lowered ||
      member.user.tag.toLowerCase() === lowered ||
      member.displayName.toLowerCase() === lowered
    );
  });

  if (cached) {
    return cached;
  }

  const fetched = await guild.members.fetch({ query: input, limit: 10 }).catch(() => null);
  if (!fetched) {
    return null;
  }

  return (
    fetched.find((member) => {
      return (
        member.user.username.toLowerCase() === lowered ||
        member.user.tag.toLowerCase() === lowered ||
        member.displayName.toLowerCase() === lowered
      );
    }) || null
  );
}

async function ensureActionableTarget(guild, member, actionLabel) {
  const botMember = await getBotMember(guild);

  const checks = {
    kick: member.kickable,
    ban: member.bannable,
    mute: member.moderatable,
    unmute: member.moderatable,
  };

  if (checks[actionLabel]) {
    return botMember;
  }

  throw new Error(
    `The bot cannot ${actionLabel} ${member.user.tag}. Its highest role must be above the target user, and the target cannot be a server administrator.`,
  );
}

function resolveRole(guild, query) {
  const input = String(query || "").trim();
  if (!input) {
    return null;
  }

  return (
    guild.roles.cache.get(input) ||
    guild.roles.cache.find((role) => role.name.toLowerCase() === input.toLowerCase()) ||
    null
  );
}

async function ensureRoleAssignable(guild, member, role) {
  const botMember = await getBotMember(guild);
  if (!member.manageable || role.comparePositionTo(botMember.roles.highest) >= 0) {
    throw new Error(
      `The bot cannot add ${role.name} to ${member.user.tag}. Its highest role must be above the target member and above the role being assigned.`,
    );
  }
}

function recordModerationAction({
  actionType,
  discordUserId,
  discordTag,
  reason,
  durationMinutes = null,
  roleId = null,
  roleName = null,
  active = 0,
  expiresAt = null,
}) {
  statements.createModerationAction.run({
    action_type: actionType,
    discord_user_id: discordUserId,
    discord_tag: discordTag,
    reason,
    duration_minutes: durationMinutes,
    role_id: roleId,
    role_name: roleName,
    active,
    expires_at: expiresAt,
  });
}

function recordAudit({ actorId, actorTag, action, target, details }) {
  logAction({
    actorId,
    actorTag,
    action,
    target,
    details,
  });
}

async function performDiscordAdminAction({
  action,
  target,
  reason,
  duration,
  roleQuery,
  actorId,
  actorTag,
}) {
  const cleanAction = String(action || "").trim().toLowerCase();
  const cleanTarget = String(target || "").trim();
  const cleanReason = String(reason || "").trim();
  const guild = await getConfiguredGuild();

  if (!cleanAction) {
    throw new Error("Action is required.");
  }

  if (!cleanTarget) {
    throw new Error("Target user is required.");
  }

  switch (cleanAction) {
    case "ban": {
      await ensureBotPermissions(guild, [PermissionFlagsBits.BanMembers], "`ban`");
      const member = await resolveMember(guild, cleanTarget);
      if (!member) {
        throw new Error("I couldn't find that user in the configured Discord server.");
      }

      await ensureActionableTarget(guild, member, "ban");
      const finalReason = cleanReason || "No reason provided";
      await member.ban({ reason: finalReason });
      recordModerationAction({
        actionType: "ban",
        discordUserId: member.id,
        discordTag: member.user.tag,
        reason: finalReason,
        active: 1,
      });
      recordAudit({
        actorId,
        actorTag,
        action: "web_ban",
        target: member.id,
        details: finalReason,
      });

      return {
        action: "ban",
        targetId: member.id,
        targetTag: member.user.tag,
        reason: finalReason,
      };
    }

    case "kick": {
      await ensureBotPermissions(guild, [PermissionFlagsBits.KickMembers], "`kick`");
      const member = await resolveMember(guild, cleanTarget);
      if (!member) {
        throw new Error("I couldn't find that user in the configured Discord server.");
      }

      await ensureActionableTarget(guild, member, "kick");
      const finalReason = cleanReason || "No reason provided";
      await member.kick(finalReason);
      recordModerationAction({
        actionType: "kick",
        discordUserId: member.id,
        discordTag: member.user.tag,
        reason: finalReason,
        active: 0,
      });
      recordAudit({
        actorId,
        actorTag,
        action: "web_kick",
        target: member.id,
        details: finalReason,
      });

      return {
        action: "kick",
        targetId: member.id,
        targetTag: member.user.tag,
        reason: finalReason,
      };
    }

    case "mute": {
      await ensureBotPermissions(guild, [PermissionFlagsBits.ModerateMembers], "`mute`");
      const member = await resolveMember(guild, cleanTarget);
      if (!member) {
        throw new Error("I couldn't find that user in the configured Discord server.");
      }

      await ensureActionableTarget(guild, member, "mute");
      const durationMs = parseDuration(duration);
      const finalReason = cleanReason || "No reason provided";
      await member.timeout(durationMs, finalReason);

      recordModerationAction({
        actionType: "mute",
        discordUserId: member.id,
        discordTag: member.user.tag,
        reason: finalReason,
        durationMinutes: Math.round(durationMs / 60000),
        active: 1,
        expiresAt: new Date(Date.now() + durationMs).toISOString(),
      });
      recordAudit({
        actorId,
        actorTag,
        action: "web_mute",
        target: member.id,
        details: `${duration} ${finalReason}`.trim(),
      });

      return {
        action: "mute",
        targetId: member.id,
        targetTag: member.user.tag,
        reason: finalReason,
        duration,
      };
    }

    case "unmute": {
      await ensureBotPermissions(guild, [PermissionFlagsBits.ModerateMembers], "`unmute`");
      const member = await resolveMember(guild, cleanTarget);
      if (!member) {
        throw new Error("I couldn't find that user in the configured Discord server.");
      }

      await ensureActionableTarget(guild, member, "unmute");
      const finalReason = cleanReason || "Unmuted by admin dashboard";
      await member.timeout(null, finalReason);
      statements.liftModerationAction.run(member.id, "mute");
      recordAudit({
        actorId,
        actorTag,
        action: "web_unmute",
        target: member.id,
        details: finalReason,
      });

      return {
        action: "unmute",
        targetId: member.id,
        targetTag: member.user.tag,
        reason: finalReason,
      };
    }

    case "role": {
      await ensureBotPermissions(guild, [PermissionFlagsBits.ManageRoles], "`role`");
      const member = await resolveMember(guild, cleanTarget);
      if (!member) {
        throw new Error("I couldn't find that user in the configured Discord server.");
      }

      const role = resolveRole(guild, roleQuery);
      if (!role) {
        throw new Error("I couldn't find that role in the configured Discord server.");
      }

      await ensureRoleAssignable(guild, member, role);
      const finalReason = cleanReason || `Role granted by ${actorTag || actorId || "admin dashboard"}`;
      await member.roles.add(role, finalReason);
      recordModerationAction({
        actionType: "role",
        discordUserId: member.id,
        discordTag: member.user.tag,
        reason: finalReason,
        roleId: role.id,
        roleName: role.name,
        active: 0,
      });
      recordAudit({
        actorId,
        actorTag,
        action: "web_role",
        target: member.id,
        details: role.name,
      });

      return {
        action: "role",
        targetId: member.id,
        targetTag: member.user.tag,
        roleId: role.id,
        roleName: role.name,
        reason: finalReason,
      };
    }

    case "unban": {
      await ensureBotPermissions(guild, [PermissionFlagsBits.BanMembers], "`unban`");
      const userId = cleanTarget.replace(/[<@!>]/g, "");
      if (!/^\d+$/.test(userId)) {
        throw new Error("Unban requires a Discord user ID.");
      }

      const ban = await guild.bans.fetch(userId).catch(() => null);
      if (!ban) {
        throw new Error("That user is not currently banned in the configured Discord server.");
      }

      const finalReason = cleanReason || "Unbanned by admin dashboard";
      await guild.members.unban(userId, finalReason);
      statements.liftModerationAction.run(userId, "ban");
      recordAudit({
        actorId,
        actorTag,
        action: "web_unban",
        target: userId,
        details: finalReason,
      });

      return {
        action: "unban",
        targetId: userId,
        targetTag: ban.user?.tag || userId,
        reason: finalReason,
      };
    }

    default:
      throw new Error("Unsupported Discord action.");
  }
}

module.exports = {
  getBotClient,
  performDiscordAdminAction,
  setBotClient,
};
