const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
} = require("discord.js");
const config = require("./config");
const { statements } = require("./db");
const { createOrReuseKey, revokeKey, resetHwid, setBlacklist } = require("./key-service");
const { isBotAdmin } = require("./permissions");

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

async function resolveMember(message, raw) {
  if (!raw) {
    return null;
  }

  const mentionMatch = raw.match(/^<@!?(\d+)>$/);
  const userId = mentionMatch ? mentionMatch[1] : /^\d+$/.test(raw) ? raw : null;
  if (userId) {
    return message.guild.members.fetch(userId).catch(() => null);
  }

  const lowered = raw.toLowerCase();
  const cached = message.guild.members.cache.find((member) => {
    return (
      member.user.username.toLowerCase() === lowered ||
      member.user.tag.toLowerCase() === lowered ||
      member.displayName.toLowerCase() === lowered
    );
  });

  return cached || null;
}

function replyError(message, error) {
  return message.reply(`Error: ${error.message}`);
}

function formatKey(record) {
  return [
    `Key: \`${record.key}\``,
    `Type: ${record.type}`,
    `Status: ${record.status}`,
    `Expires: ${new Date(record.expires_at).toLocaleString()}`,
  ].join("\n");
}

async function ensureAdmin(message) {
  if (!isBotAdmin(message.member)) {
    await message.reply("You need admin or Manage Server permissions to use this command.");
    return false;
  }
  return true;
}

async function handleGenerate(message, args, type) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const robloxUser = args[1];
  if (!targetRaw || !robloxUser) {
    await message.reply(`Usage: ${config.commandPrefix}${type === "premium" ? "prem-gen" : "gen-key"} {user} {robloxuser}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await message.reply("I couldn't find that user in this server.");
    return;
  }

  try {
    const result = createOrReuseKey({
      discordUserId: member.id,
      discordTag: member.user.tag,
      robloxUser,
      type,
      force: true,
      actorId: message.author.id,
      actorTag: message.author.tag,
    });

    await message.reply(
      `${type === "premium" ? "Premium" : "Normal"} key created for ${member.user.tag}\n${formatKey(result.record)}`,
    );
  } catch (error) {
    await replyError(message, error);
  }
}

async function handleRevoke(message, args, type) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const key = args[1];
  if (!targetRaw || !key) {
    await message.reply(`Usage: ${config.commandPrefix}${type === "premium" ? "revoke_prem" : "revoke_key"} {user} {key}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await message.reply("I couldn't find that user in this server.");
    return;
  }

  const existing = statements.findKeyByValue.get(key);
  if (!existing || existing.discord_user_id !== member.id || existing.type !== type) {
    await message.reply("That key does not belong to that user and key type.");
    return;
  }

  try {
    const updated = revokeKey({
      key,
      reason: `Revoked by ${message.author.tag}`,
      actorId: message.author.id,
      actorTag: message.author.tag,
    });
    await message.reply(`Revoked ${type} key for ${member.user.tag}\n${formatKey(updated)}`);
  } catch (error) {
    await replyError(message, error);
  }
}

async function handleBlacklist(message, args, mode) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  if (mode === "list") {
    const blacklisted = statements.listBlacklistedUsers.all();
    if (!blacklisted.length) {
      await message.reply("No users are currently blacklisted.");
      return;
    }

    await message.reply(
      blacklisted
        .map((entry) => `${entry.discord_tag || entry.discord_user_id} - ${entry.blacklist_reason || "No reason provided"}`)
        .join("\n"),
    );
    return;
  }

  const targetRaw = args[0];
  if (!targetRaw) {
    await message.reply(`Usage: ${config.commandPrefix}${mode === "add" ? "blacklist" : "unblacklist"} {user} ${mode === "add" ? "{reason}" : ""}`.trim());
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await message.reply("I couldn't find that user in this server.");
    return;
  }

  const reason = mode === "add" ? args.slice(1).join(" ").trim() || "Blacklisted by administrator" : null;
  const updated = setBlacklist({
    discordUserId: member.id,
    discordTag: member.user.tag,
    robloxUser: null,
    blacklisted: mode === "add",
    reason,
    actorId: message.author.id,
    actorTag: message.author.tag,
  });

  await message.reply(
    mode === "add"
      ? `${member.user.tag} is now blacklisted. Reason: ${updated.blacklist_reason || "No reason provided"}`
      : `${member.user.tag} has been removed from the blacklist.`,
  );
}

async function handleResetHwid(message, args) {
  let member = message.member;

  if (args[0]) {
    if (!(await ensureAdmin(message))) {
      return;
    }
    const resolved = await resolveMember(message, args[0]);
    if (!resolved) {
      await message.reply("I couldn't find that user in this server.");
      return;
    }
    member = resolved;
  }

  resetHwid({
    discordUserId: member.id,
    actorId: message.author.id,
    actorTag: message.author.tag,
  });

  await message.reply(`HWID has been reset for ${member.user.tag}.`);
}

async function handleBan(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  if (!targetRaw) {
    await message.reply(`Usage: ${config.commandPrefix}ban {user} {reason}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await message.reply("I couldn't find that user in this server.");
    return;
  }

  await member.ban({ reason });
  statements.createModerationAction.run({
    action_type: "ban",
    discord_user_id: member.id,
    discord_tag: member.user.tag,
    reason,
    duration_minutes: null,
    role_id: null,
    role_name: null,
    active: 1,
    expires_at: null,
  });
  await message.reply(`${member.user.tag} has been banned. Reason: ${reason}`);
}

async function handleKick(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  if (!targetRaw) {
    await message.reply(`Usage: ${config.commandPrefix}kick {user} {reason}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await message.reply("I couldn't find that user in this server.");
    return;
  }

  await member.kick(reason);
  statements.createModerationAction.run({
    action_type: "kick",
    discord_user_id: member.id,
    discord_tag: member.user.tag,
    reason,
    duration_minutes: null,
    role_id: null,
    role_name: null,
    active: 0,
    expires_at: null,
  });
  await message.reply(`${member.user.tag} has been kicked. Reason: ${reason}`);
}

async function handleMute(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const durationRaw = args[1];
  const reason = args.slice(2).join(" ").trim() || "No reason provided";
  if (!targetRaw || !durationRaw) {
    await message.reply(`Usage: ${config.commandPrefix}mute {user} {duration} {reason}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await message.reply("I couldn't find that user in this server.");
    return;
  }

  const durationMs = parseDuration(durationRaw);
  await member.timeout(durationMs, reason);

  statements.createModerationAction.run({
    action_type: "mute",
    discord_user_id: member.id,
    discord_tag: member.user.tag,
    reason,
    duration_minutes: Math.round(durationMs / 60000),
    role_id: null,
    role_name: null,
    active: 1,
    expires_at: new Date(Date.now() + durationMs).toISOString(),
  });

  await message.reply(`${member.user.tag} has been muted for ${durationRaw}. Reason: ${reason}`);
}

async function handleRole(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const roleName = args.slice(1).join(" ").trim();
  if (!targetRaw || !roleName) {
    await message.reply(`Usage: ${config.commandPrefix}role {user} {role}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await message.reply("I couldn't find that user in this server.");
    return;
  }

  const role =
    message.guild.roles.cache.find((entry) => entry.name.toLowerCase() === roleName.toLowerCase()) ||
    message.guild.roles.cache.get(roleName);

  if (!role) {
    await message.reply("I couldn't find that role.");
    return;
  }

  await member.roles.add(role);
  statements.createModerationAction.run({
    action_type: "role",
    discord_user_id: member.id,
    discord_tag: member.user.tag,
    reason: `Role granted by ${message.author.tag}`,
    duration_minutes: null,
    role_id: role.id,
    role_name: role.name,
    active: 0,
    expires_at: null,
  });
  await message.reply(`${role.name} has been added to ${member.user.tag}.`);
}

async function handleUnban(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  if (!targetRaw) {
    await message.reply(`Usage: ${config.commandPrefix}unban {user}`);
    return;
  }

  const userId = targetRaw.replace(/[<@!>]/g, "");
  await message.guild.members.unban(userId);
  statements.liftModerationAction.run(userId, "ban");
  await message.reply(`User ${userId} has been unbanned.`);
}

async function handleUnmute(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  if (!targetRaw) {
    await message.reply(`Usage: ${config.commandPrefix}unmute {user}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await message.reply("I couldn't find that user in this server.");
    return;
  }

  await member.timeout(null);
  statements.liftModerationAction.run(member.id, "mute");
  await message.reply(`${member.user.tag} has been unmuted.`);
}

function createBot() {
  if (!config.discordToken) {
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.Channel],
  });

  client.once("clientReady", () => {
    console.log(`Discord bot connected as ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) {
      return;
    }

    if (!message.content.startsWith(config.commandPrefix)) {
      return;
    }

    const content = message.content.slice(config.commandPrefix.length).trim();
    const [command, ...args] = content.split(/\s+/);

    try {
      switch (command.toLowerCase()) {
        case "prem-gen":
          await handleGenerate(message, args, "premium");
          break;
        case "gen-key":
          await handleGenerate(message, args, "normal");
          break;
        case "reset_hwid":
          await handleResetHwid(message, args);
          break;
        case "revoke_key":
          await handleRevoke(message, args, "normal");
          break;
        case "revoke_prem":
          await handleRevoke(message, args, "premium");
          break;
        case "blacklists":
          await handleBlacklist(message, args, "list");
          break;
        case "blacklist":
          await handleBlacklist(message, args, "add");
          break;
        case "unblacklist":
          await handleBlacklist(message, args, "remove");
          break;
        case "ban":
          await handleBan(message, args);
          break;
        case "kick":
          await handleKick(message, args);
          break;
        case "mute":
          await handleMute(message, args);
          break;
        case "role":
          await handleRole(message, args);
          break;
        case "unban":
          await handleUnban(message, args);
          break;
        case "unmute":
          await handleUnmute(message, args);
          break;
        default:
          break;
      }
    } catch (error) {
      if (error.code === 50013 || error.code === 50001) {
        await message.reply("The bot is missing a Discord permission needed for that action.");
        return;
      }
      await replyError(message, error);
    }
  });

  return client;
}

async function startBot() {
  const client = createBot();
  if (!client) {
    console.log("DISCORD_TOKEN not set, skipping Discord bot startup.");
    return null;
  }

  await client.login(config.discordToken);
  return client;
}

module.exports = {
  startBot,
};
