const {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
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
  return replyEmbed(message, {
    color: "error",
    title: "Command Error",
    description: error.message,
  });
}

function colorValue(color) {
  const colors = {
    success: 0x57f287,
    error: 0xed4245,
    info: 0x5865f2,
    warning: 0xfee75c,
  };

  return colors[color] || colors.info;
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString();
}

function keyFields(record) {
  return [
    {
      name: "Key",
      value: `\`${record.key}\``,
      inline: false,
    },
    {
      name: "Type",
      value: record.type,
      inline: true,
    },
    {
      name: "Status",
      value: record.status,
      inline: true,
    },
    {
      name: "Expires",
      value: formatTimestamp(record.expires_at),
      inline: false,
    },
  ];
}

function deliveryFields(record) {
  return [
    {
      name: "Roblox User",
      value: record.roblox_user,
      inline: true,
    },
    {
      name: "Type",
      value: record.type,
      inline: true,
    },
    {
      name: "Expires",
      value: formatTimestamp(record.expires_at),
      inline: false,
    },
  ];
}

function createEmbed({ color = "info", title, description, fields = [], footerText }) {
  const embed = new EmbedBuilder()
    .setColor(colorValue(color))
    .setTimestamp();

  if (footerText) {
    embed.setFooter({ text: footerText });
  }

  if (title) {
    embed.setTitle(title);
  }

  if (description) {
    embed.setDescription(description);
  }

  if (fields.length) {
    embed.addFields(fields);
  }

  return embed;
}

function buildEmbed(message, payload) {
  return createEmbed({
    ...payload,
    footerText: `Requested by ${message.author.tag}`,
  });
}

function replyEmbed(message, payload) {
  return message.reply({
    embeds: [buildEmbed(message, payload)],
  });
}

function sendEmbed(target, payload) {
  return target.send({
    embeds: [createEmbed(payload)],
  });
}

function replyUsage(message, usage) {
  return replyEmbed(message, {
    color: "warning",
    title: "Usage",
    description: `\`${usage}\``,
  });
}

async function ensureAdmin(message) {
  if (!isBotAdmin(message.member)) {
    await replyEmbed(message, {
      color: "warning",
      title: "Permission Required",
      description: "You need `Administrator` or `Manage Server` permissions to use this command.",
    });
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
    await replyUsage(
      message,
      `${config.commandPrefix}${type === "premium" ? "prem-gen" : "gen-key"} {user} {robloxuser}`,
    );
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await replyEmbed(message, {
      color: "error",
      title: "User Not Found",
      description: "I couldn't find that user in this server.",
    });
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

    try {
      await sendEmbed(member.user, {
        color: type === "premium" ? "info" : "success",
        title: `${type === "premium" ? "Premium" : "Normal"} Key Ready`,
        description: `Here is your Luminia Hub access key for **${result.record.roblox_user}**.`,
        fields: keyFields(result.record),
        footerText: `Issued by ${message.author.tag}`,
      });

      await replyEmbed(message, {
        color: type === "premium" ? "info" : "success",
        title: `${type === "premium" ? "Premium" : "Normal"} Key Delivered`,
        description: `The key for **${member.user.tag}** was sent by DM.`,
        fields: deliveryFields(result.record),
      });
    } catch (dmError) {
      let sentToIssuer = false;

      try {
        await sendEmbed(message.author, {
          color: "warning",
          title: `${type === "premium" ? "Premium" : "Normal"} Key Delivery Failed`,
          description: `I couldn't DM **${member.user.tag}**, so I'm sending the key to you instead.`,
          fields: keyFields(result.record),
          footerText: "Share this manually only if appropriate.",
        });
        sentToIssuer = true;
      } catch (issuerDmError) {
        sentToIssuer = false;
      }

      await replyEmbed(message, {
        color: "warning",
        title: "Recipient DMs Closed",
        description: sentToIssuer
          ? `I created the key for **${member.user.tag}**, but their DMs are closed. I sent the key to your DMs so you can pass it along manually.`
          : `I created the key for **${member.user.tag}**, but their DMs are closed and I couldn't DM you either. Ask them to enable DMs, then run the command again.`,
        fields: deliveryFields(result.record),
      });
    }
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
    await replyUsage(
      message,
      `${config.commandPrefix}${type === "premium" ? "revoke_prem" : "revoke_key"} {user} {key}`,
    );
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await replyEmbed(message, {
      color: "error",
      title: "User Not Found",
      description: "I couldn't find that user in this server.",
    });
    return;
  }

  const existing = statements.findKeyByValue.get(key);
  if (!existing || existing.discord_user_id !== member.id || existing.type !== type) {
    await replyEmbed(message, {
      color: "error",
      title: "Key Mismatch",
      description: "That key does not belong to that user and key type.",
    });
    return;
  }

  try {
    const updated = revokeKey({
      key,
      reason: `Revoked by ${message.author.tag}`,
      actorId: message.author.id,
      actorTag: message.author.tag,
    });

    try {
      await sendEmbed(member.user, {
        color: "warning",
        title: `${type === "premium" ? "Premium" : "Normal"} Key Revoked`,
        description: `Your Luminia Hub key for **${updated.roblox_user}** has been revoked.`,
        fields: keyFields(updated),
        footerText: `Revoked by ${message.author.tag}`,
      });

      await replyEmbed(message, {
        color: "warning",
        title: `${type === "premium" ? "Premium" : "Normal"} Key Revoked`,
        description: `The revocation notice for **${member.user.tag}** was sent by DM.`,
        fields: deliveryFields(updated),
      });
    } catch (dmError) {
      let sentToIssuer = false;

      try {
        await sendEmbed(message.author, {
          color: "warning",
          title: `${type === "premium" ? "Premium" : "Normal"} Revocation Notice Failed`,
          description: `I couldn't DM **${member.user.tag}**, so I'm sending the revoked key details to you instead.`,
          fields: keyFields(updated),
          footerText: "Share this manually only if appropriate.",
        });
        sentToIssuer = true;
      } catch (issuerDmError) {
        sentToIssuer = false;
      }

      await replyEmbed(message, {
        color: "warning",
        title: "Recipient DMs Closed",
        description: sentToIssuer
          ? `I revoked the key for **${member.user.tag}**, but their DMs are closed. I sent the revoked key details to your DMs so you can notify them manually.`
          : `I revoked the key for **${member.user.tag}**, but their DMs are closed and I couldn't DM you either.`,
        fields: deliveryFields(updated),
      });
    }
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
      await replyEmbed(message, {
        color: "info",
        title: "Blacklist",
        description: "No users are currently blacklisted.",
      });
      return;
    }

    await replyEmbed(message, {
      color: "warning",
      title: "Blacklisted Users",
      description: blacklisted
        .slice(0, 10)
        .map((entry) => `• **${entry.discord_tag || entry.discord_user_id}** — ${entry.blacklist_reason || "No reason provided"}`)
        .join("\n"),
    });
    return;
  }

  const targetRaw = args[0];
  if (!targetRaw) {
    await replyUsage(
      message,
      `${config.commandPrefix}${mode === "add" ? "blacklist" : "unblacklist"} {user} ${mode === "add" ? "{reason}" : ""}`.trim(),
    );
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await replyEmbed(message, {
      color: "error",
      title: "User Not Found",
      description: "I couldn't find that user in this server.",
    });
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

  await replyEmbed(message, {
    color: mode === "add" ? "warning" : "success",
    title: mode === "add" ? "User Blacklisted" : "User Unblacklisted",
    description:
      mode === "add"
        ? `**${member.user.tag}** is now blacklisted.`
        : `**${member.user.tag}** has been removed from the blacklist.`,
    fields:
      mode === "add"
        ? [
            {
              name: "Reason",
              value: updated.blacklist_reason || "No reason provided",
              inline: false,
            },
          ]
        : [],
  });
}

async function handleResetHwid(message, args) {
  let member = message.member;

  if (args[0]) {
    if (!(await ensureAdmin(message))) {
      return;
    }
    const resolved = await resolveMember(message, args[0]);
    if (!resolved) {
      await replyEmbed(message, {
        color: "error",
        title: "User Not Found",
        description: "I couldn't find that user in this server.",
      });
      return;
    }
    member = resolved;
  }

  resetHwid({
    discordUserId: member.id,
    actorId: message.author.id,
    actorTag: message.author.tag,
  });

  await replyEmbed(message, {
    color: "success",
    title: "HWID Reset",
    description: `HWID has been reset for **${member.user.tag}**.`,
  });
}

async function handleBan(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  if (!targetRaw) {
    await replyUsage(message, `${config.commandPrefix}ban {user} {reason}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await replyEmbed(message, {
      color: "error",
      title: "User Not Found",
      description: "I couldn't find that user in this server.",
    });
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
  await replyEmbed(message, {
    color: "warning",
    title: "User Banned",
    description: `**${member.user.tag}** has been banned.`,
    fields: [
      {
        name: "Reason",
        value: reason,
        inline: false,
      },
    ],
  });
}

async function handleKick(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  if (!targetRaw) {
    await replyUsage(message, `${config.commandPrefix}kick {user} {reason}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await replyEmbed(message, {
      color: "error",
      title: "User Not Found",
      description: "I couldn't find that user in this server.",
    });
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
  await replyEmbed(message, {
    color: "warning",
    title: "User Kicked",
    description: `**${member.user.tag}** has been kicked.`,
    fields: [
      {
        name: "Reason",
        value: reason,
        inline: false,
      },
    ],
  });
}

async function handleMute(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const durationRaw = args[1];
  const reason = args.slice(2).join(" ").trim() || "No reason provided";
  if (!targetRaw || !durationRaw) {
    await replyUsage(message, `${config.commandPrefix}mute {user} {duration} {reason}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await replyEmbed(message, {
      color: "error",
      title: "User Not Found",
      description: "I couldn't find that user in this server.",
    });
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

  await replyEmbed(message, {
    color: "warning",
    title: "User Muted",
    description: `**${member.user.tag}** has been muted for **${durationRaw}**.`,
    fields: [
      {
        name: "Reason",
        value: reason,
        inline: false,
      },
    ],
  });
}

async function handleRole(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  const roleName = args.slice(1).join(" ").trim();
  if (!targetRaw || !roleName) {
    await replyUsage(message, `${config.commandPrefix}role {user} {role}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await replyEmbed(message, {
      color: "error",
      title: "User Not Found",
      description: "I couldn't find that user in this server.",
    });
    return;
  }

  const role =
    message.guild.roles.cache.find((entry) => entry.name.toLowerCase() === roleName.toLowerCase()) ||
    message.guild.roles.cache.get(roleName);

  if (!role) {
    await replyEmbed(message, {
      color: "error",
      title: "Role Not Found",
      description: "I couldn't find that role.",
    });
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
  await replyEmbed(message, {
    color: "success",
    title: "Role Added",
    description: `Added **${role.name}** to **${member.user.tag}**.`,
  });
}

async function handleUnban(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  if (!targetRaw) {
    await replyUsage(message, `${config.commandPrefix}unban {user}`);
    return;
  }

  const userId = targetRaw.replace(/[<@!>]/g, "");
  await message.guild.members.unban(userId);
  statements.liftModerationAction.run(userId, "ban");
  await replyEmbed(message, {
    color: "success",
    title: "User Unbanned",
    description: `User **${userId}** has been unbanned.`,
  });
}

async function handleUnmute(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const targetRaw = args[0];
  if (!targetRaw) {
    await replyUsage(message, `${config.commandPrefix}unmute {user}`);
    return;
  }

  const member = await resolveMember(message, targetRaw);
  if (!member) {
    await replyEmbed(message, {
      color: "error",
      title: "User Not Found",
      description: "I couldn't find that user in this server.",
    });
    return;
  }

  await member.timeout(null);
  statements.liftModerationAction.run(member.id, "mute");
  await replyEmbed(message, {
    color: "success",
    title: "User Unmuted",
    description: `**${member.user.tag}** has been unmuted.`,
  });
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
        await replyEmbed(message, {
          color: "error",
          title: "Missing Discord Permission",
          description: "The bot is missing a Discord permission needed for that action.",
        });
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
