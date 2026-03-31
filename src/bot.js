const {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
} = require("discord.js");
const config = require("./config");
const { statements, logAction } = require("./db");
const { setBotClient } = require("./discord-admin");
const { isScriptScope, keyTypeForScope, normalizeAccessScope, scopeLabel } = require("./access-scopes");
const {
  applyAutoModPreset,
  autoModRuleLabel,
  evaluateAutoModMessage,
  getAutoModConfig,
  listEnabledRules,
  updateAutoModList,
  updateAutoModValue,
} = require("./automod");
const { getGuildFeatures, renderWelcomeMessage, saveGuildFeatures } = require("./guild-features");
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

const REQUIRED_BOT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageRoles,
];

const BOT_PREFIX = config.commandPrefix;

const COMMAND_DESCRIPTIONS = [
  `\`${BOT_PREFIX}gen-key {user} {robloxuser}\` - create a 24-hour key and DM it to the user`,
  `\`${BOT_PREFIX}prem-gen {user} {robloxuser} {duration}\` - create a timed premium key and DM it to the user`,
  `\`${BOT_PREFIX}bloxfruits {user} {robloxuser}\` - create a Blox Fruits paid key locked to Blox Fruits`,
  `\`${BOT_PREFIX}revoke_key {user} {key}\` - revoke a normal key and DM the notice`,
  `\`${BOT_PREFIX}revoke_prem {user} {key}\` - revoke a premium key and DM the notice`,
  `\`${BOT_PREFIX}reset_hwid [user]\` - reset your HWID, or another user's if you are staff`,
  `\`${BOT_PREFIX}blacklist {user} {reason}\` - add a user to the blacklist`,
  `\`${BOT_PREFIX}blacklists\` - list blacklisted users`,
  `\`${BOT_PREFIX}unblacklist {user}\` - remove a user from the blacklist`,
  `\`${BOT_PREFIX}ban {user} {reason}\` - ban a user`,
  `\`${BOT_PREFIX}kick {user} {reason}\` - kick a user`,
  `\`${BOT_PREFIX}mute {user} {duration} {reason}\` - timeout a user`,
  `\`${BOT_PREFIX}unmute {user}\` - remove a timeout`,
  `\`${BOT_PREFIX}role {user} {role}\` - add a role to a user`,
  `\`${BOT_PREFIX}purge {count}\` - remove recent messages from the current channel`,
  `\`${BOT_PREFIX}verify {user}\` - apply the configured verification role`,
  `\`${BOT_PREFIX}unverify {user}\` - remove the configured verification role`,
  `\`${BOT_PREFIX}config\` - show current onboarding config`,
  `\`${BOT_PREFIX}verify-role {role}\` - set the verification role quickly`,
  `\`${BOT_PREFIX}unverified-role {role}\` - set the unverified role quickly`,
  `\`${BOT_PREFIX}autorole {role}\` - set the join autorole quickly`,
  `\`${BOT_PREFIX}welcome-channel {channel}\` - set the welcome channel quickly`,
  `\`${BOT_PREFIX}welcome-message {text}\` - set the welcome message quickly`,
  `\`${BOT_PREFIX}welcome-test [user]\` - preview the welcome embed quickly`,
  `\`${BOT_PREFIX}unban {userId}\` - unban a user by ID`,
  `\`${BOT_PREFIX}commands\` - show this list`,
  `\`${BOT_PREFIX}check-perms\` - check the bot's Discord permissions in this server`,
  `\`${BOT_PREFIX}setup status\` - show current welcome, autorole, and verification config`,
  `\`${BOT_PREFIX}setup verify-role|unverified-role|autorole|welcome-channel {value|off}\` - configure onboarding roles and channels`,
  `\`${BOT_PREFIX}setup welcome-message {text|off}\` - set the welcome text. Tokens: {user}, {server}, {membercount}`,
  `\`${BOT_PREFIX}setup welcome-test [user]\` - preview the current welcome message`,
  `\`${BOT_PREFIX}automod on|off\` - quickly enable or disable auto-mod`,
  `\`${BOT_PREFIX}automod logs {channel|off}\` - set the automod log channel quickly`,
  `\`${BOT_PREFIX}automod allow-domain {domain}\` - whitelist a domain quickly`,
  `\`${BOT_PREFIX}automod allow-invite {code}\` - whitelist a Discord invite quickly`,
  `\`${BOT_PREFIX}automod block-word {phrase}\` - add a blocked phrase quickly`,
  `\`${BOT_PREFIX}automod exempt-role {role}\` - exempt a role quickly`,
  `\`${BOT_PREFIX}automod exempt-channel {channel}\` - exempt a channel quickly`,
  `\`${BOT_PREFIX}automod status\` - show current automod state, actions, and live rules`,
  `\`${BOT_PREFIX}automod toggle {setting} {on|off}\` - enable or disable a rule or action`,
  `\`${BOT_PREFIX}automod set {setting} {value}\` - change thresholds, timeout, or log channel`,
  `\`${BOT_PREFIX}automod add/remove/list {category}\` - manage allowlists, blocklists, and exemptions`,
  `\`${BOT_PREFIX}automod preset {balanced|strict|relaxed|off}\` - apply a full automod preset`,
];

const PERMISSION_LABELS = {
  [PermissionFlagsBits.ViewChannel.toString()]: "View Channels",
  [PermissionFlagsBits.SendMessages.toString()]: "Send Messages",
  [PermissionFlagsBits.EmbedLinks.toString()]: "Embed Links",
  [PermissionFlagsBits.ReadMessageHistory.toString()]: "Read Message History",
  [PermissionFlagsBits.ManageMessages.toString()]: "Manage Messages",
  [PermissionFlagsBits.KickMembers.toString()]: "Kick Members",
  [PermissionFlagsBits.BanMembers.toString()]: "Ban Members",
  [PermissionFlagsBits.ModerateMembers.toString()]: "Moderate Members",
  [PermissionFlagsBits.ManageRoles.toString()]: "Manage Roles",
};

function commandNameForScope(scope) {
  const cleanScope = normalizeAccessScope(scope);
  switch (cleanScope) {
    case "normal":
      return "gen-key";
    case "premium":
      return "prem-gen";
    case "bloxfruits":
      return "bloxfruits";
    default:
      return cleanScope;
  }
}

function accessLabelForRecord(record) {
  return scopeLabel(record.scope || (record.type === "premium" ? "premium" : "normal"));
}

const AUTOMOD_TOGGLE_PATHS = {
  enabled: { path: "enabled", label: "Auto-Mod" },
  delete: { path: "actions.deleteMessage", label: "Delete Message" },
  timeout: { path: "actions.timeoutEnabled", label: "Timeout Action" },
  notice: { path: "actions.sendPublicNotice", label: "Public Notice" },
  invites: { path: "rules.invites.enabled", label: autoModRuleLabel("invites") },
  links: { path: "rules.links.enabled", label: autoModRuleLabel("links") },
  words: { path: "rules.blockedWords.enabled", label: autoModRuleLabel("blockedWords") },
  blockedwords: { path: "rules.blockedWords.enabled", label: autoModRuleLabel("blockedWords") },
  mentions: { path: "rules.massMentions.enabled", label: autoModRuleLabel("massMentions") },
  repeat: { path: "rules.repeatMessages.enabled", label: autoModRuleLabel("repeatMessages") },
  burst: { path: "rules.burstSpam.enabled", label: autoModRuleLabel("burstSpam") },
  caps: { path: "rules.caps.enabled", label: autoModRuleLabel("caps") },
  chars: { path: "rules.repeatedChars.enabled", label: autoModRuleLabel("repeatedChars") },
  repeatedchars: { path: "rules.repeatedChars.enabled", label: autoModRuleLabel("repeatedChars") },
  emoji: { path: "rules.emojiSpam.enabled", label: autoModRuleLabel("emojiSpam") },
  lines: { path: "rules.lineSpam.enabled", label: autoModRuleLabel("lineSpam") },
  attachments: { path: "rules.attachments.enabled", label: autoModRuleLabel("attachments") },
};

const AUTOMOD_SET_PATHS = {
  timeout: { path: "actions.timeoutMinutes", label: "Timeout Minutes", type: "int", min: 0, max: 10_080 },
  "notice-seconds": { path: "actions.noticeSeconds", label: "Notice Seconds", type: "int", min: 3, max: 120 },
  noticeseconds: { path: "actions.noticeSeconds", label: "Notice Seconds", type: "int", min: 3, max: 120 },
  "log-channel": { path: "actions.logChannelId", label: "Log Channel", type: "channel" },
  logchannel: { path: "actions.logChannelId", label: "Log Channel", type: "channel" },
  mentions: { path: "rules.massMentions.limit", label: "Mass Mention Limit", type: "int", min: 2, max: 50 },
  "repeat-limit": { path: "rules.repeatMessages.limit", label: "Repeat Limit", type: "int", min: 2, max: 10 },
  repeatlimit: { path: "rules.repeatMessages.limit", label: "Repeat Limit", type: "int", min: 2, max: 10 },
  "repeat-window": { path: "rules.repeatMessages.windowSeconds", label: "Repeat Window (seconds)", type: "int", min: 3, max: 120 },
  repeatwindow: { path: "rules.repeatMessages.windowSeconds", label: "Repeat Window (seconds)", type: "int", min: 3, max: 120 },
  "burst-limit": { path: "rules.burstSpam.limit", label: "Burst Limit", type: "int", min: 3, max: 20 },
  burstlimit: { path: "rules.burstSpam.limit", label: "Burst Limit", type: "int", min: 3, max: 20 },
  "burst-window": { path: "rules.burstSpam.windowSeconds", label: "Burst Window (seconds)", type: "int", min: 3, max: 120 },
  burstwindow: { path: "rules.burstSpam.windowSeconds", label: "Burst Window (seconds)", type: "int", min: 3, max: 120 },
  "caps-min": { path: "rules.caps.minLength", label: "Caps Minimum Length", type: "int", min: 4, max: 200 },
  capsmin: { path: "rules.caps.minLength", label: "Caps Minimum Length", type: "int", min: 4, max: 200 },
  "caps-ratio": { path: "rules.caps.ratio", label: "Caps Ratio", type: "ratio" },
  capsratio: { path: "rules.caps.ratio", label: "Caps Ratio", type: "ratio" },
  "char-limit": { path: "rules.repeatedChars.limit", label: "Repeated Character Limit", type: "int", min: 4, max: 40 },
  charlimit: { path: "rules.repeatedChars.limit", label: "Repeated Character Limit", type: "int", min: 4, max: 40 },
  "emoji-limit": { path: "rules.emojiSpam.limit", label: "Emoji Limit", type: "int", min: 3, max: 100 },
  emojilimit: { path: "rules.emojiSpam.limit", label: "Emoji Limit", type: "int", min: 3, max: 100 },
  "line-limit": { path: "rules.lineSpam.limit", label: "Line Limit", type: "int", min: 3, max: 50 },
  linelimit: { path: "rules.lineSpam.limit", label: "Line Limit", type: "int", min: 3, max: 50 },
};

const AUTOMOD_LIST_PATHS = {
  invite: "allowedInviteCodes",
  invites: "allowedInviteCodes",
  domain: "allowedDomains",
  domains: "allowedDomains",
  word: "blockedWords",
  words: "blockedWords",
  extension: "blockedExtensions",
  extensions: "blockedExtensions",
  role: "exemptRoleIds",
  roles: "exemptRoleIds",
  channel: "exemptChannelIds",
  channels: "exemptChannelIds",
  user: "exemptUserIds",
  users: "exemptUserIds",
};

const AUTOMOD_LIST_LABELS = {
  allowedInviteCodes: "Allowed Invite Codes",
  allowedDomains: "Allowed Domains",
  blockedWords: "Blocked Words",
  blockedExtensions: "Blocked Extensions",
  exemptRoleIds: "Exempt Roles",
  exemptChannelIds: "Exempt Channels",
  exemptUserIds: "Exempt Users",
};

function parseAutoModToggleValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["on", "true", "enable", "enabled", "yes", "1"].includes(normalized)) {
    return true;
  }
  if (["off", "false", "disable", "disabled", "no", "0"].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeAutoModInviteCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\//, "")
    .replace(/[^a-z0-9-].*$/i, "");
}

function normalizeAutoModDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function parseUserIdLike(raw) {
  const value = String(raw || "").trim();
  const mentionMatch = value.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }
  return /^\d+$/.test(value) ? value : null;
}

function parseRoleIdLike(raw) {
  const value = String(raw || "").trim();
  const mentionMatch = value.match(/^<@&(\d+)>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }
  return /^\d+$/.test(value) ? value : null;
}

function parseChannelIdLike(raw) {
  const value = String(raw || "").trim();
  const mentionMatch = value.match(/^<#(\d+)>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }
  return /^\d+$/.test(value) ? value : null;
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

function resolveRoleId(guild, raw) {
  const directId = parseRoleIdLike(raw);
  if (directId && guild.roles.cache.has(directId)) {
    return directId;
  }

  const lowered = String(raw || "").trim().toLowerCase();
  const role = guild.roles.cache.find((entry) => entry.name.toLowerCase() === lowered);
  return role?.id || null;
}

function resolveChannelId(guild, raw) {
  const directId = parseChannelIdLike(raw);
  if (directId && guild.channels.cache.has(directId)) {
    return directId;
  }

  const lowered = String(raw || "").trim().toLowerCase().replace(/^#/, "");
  const channel = guild.channels.cache.find((entry) => entry.name?.toLowerCase() === lowered);
  return channel?.id || null;
}

function resolveRole(guild, raw) {
  const roleId = resolveRoleId(guild, raw);
  return roleId ? guild.roles.cache.get(roleId) || null : null;
}

async function resolveUserId(message, raw) {
  const directId = parseUserIdLike(raw);
  if (directId) {
    return directId;
  }

  const member = await resolveMember(message, raw);
  return member?.id || null;
}

async function getBotMember(message) {
  return message.guild.members.me || message.guild.members.fetchMe();
}

async function getGuildBotMember(guild) {
  return guild.members.me || guild.members.fetchMe();
}

function roleMentionOrText(roleId) {
  return roleId ? `<@&${roleId}>` : "Not set";
}

function channelMentionOrText(channelId) {
  return channelId ? `<#${channelId}>` : "Not set";
}

function isClearValue(value) {
  return ["off", "clear", "none", "disable", "disabled"].includes(String(value || "").trim().toLowerCase());
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
  if (!value || value === "never") {
    return "Never";
  }
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
      name: "Access",
      value: accessLabelForRecord(record),
      inline: true,
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
      name: "Access",
      value: accessLabelForRecord(record),
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

async function sendTemporaryChannelEmbed(channel, payload, timeoutMs = 4000) {
  const notice = await channel.send({
    embeds: [createEmbed(payload)],
  });

  setTimeout(() => {
    notice.delete().catch(() => {});
  }, timeoutMs);

  return notice;
}

function permissionName(permission) {
  return PERMISSION_LABELS[permission.toString()] || String(permission);
}

async function ensureBotPermissions(message, permissions, actionLabel) {
  const botMember = await getBotMember(message);
  const missing = permissions.filter((permission) => !botMember.permissions.has(permission));

  if (!missing.length) {
    return { ok: true, botMember };
  }

  await replyEmbed(message, {
    color: "error",
    title: "Missing Discord Permission",
    description: `The bot is missing permission for ${actionLabel}.`,
    fields: [
      {
        name: "Missing",
        value: missing.map(permissionName).join("\n"),
        inline: false,
      },
    ],
  });

  return { ok: false, botMember };
}

async function ensureActionableTarget(message, member, actionLabel) {
  const botMember = await getBotMember(message);

  const checks = {
    kick: member.kickable,
    ban: member.bannable,
    mute: member.moderatable,
    unmute: member.moderatable,
  };

  if (checks[actionLabel]) {
    return { ok: true, botMember };
  }

  await replyEmbed(message, {
    color: "error",
    title: "Role Hierarchy Issue",
    description: `The bot cannot ${actionLabel} **${member.user.tag}**.`,
    fields: [
      {
        name: "Why This Happens",
        value: "The bot's highest role must be above the target user, and the target cannot be a server administrator.",
        inline: false,
      },
      {
        name: "Bot Highest Role",
        value: botMember.roles.highest.name,
        inline: true,
      },
      {
        name: "Target Highest Role",
        value: member.roles.highest.name,
        inline: true,
      },
    ],
  });

  return { ok: false, botMember };
}

async function ensureGuildRoleAssignable(guild, role, label = "that role") {
  const botMember = await getGuildBotMember(guild);
  if (!role) {
    throw new Error(`I couldn't find ${label}.`);
  }

  if (role.comparePositionTo(botMember.roles.highest) >= 0) {
    throw new Error(`The bot's highest role must stay above ${label}.`);
  }

  return role;
}

async function sendSetupStatus(message, title = "Guild Setup Status") {
  const features = getGuildFeatures(message.guild.id);

  await replyEmbed(message, {
    color: "info",
    title,
    description: "Welcome, verification, and autorole settings for this server.",
    fields: [
      {
        name: "Verification Role",
        value: roleMentionOrText(features.verifyRoleId),
        inline: true,
      },
      {
        name: "Unverified Role",
        value: roleMentionOrText(features.unverifiedRoleId),
        inline: true,
      },
      {
        name: "Auto Role",
        value: roleMentionOrText(features.autoRoleId),
        inline: true,
      },
      {
        name: "Welcome Channel",
        value: channelMentionOrText(features.welcomeChannelId),
        inline: true,
      },
      {
        name: "Welcome Message",
        value: features.welcomeMessage || "Not set",
        inline: false,
      },
      {
        name: "Tokens",
        value: "`{user}` `{username}` `{tag}` `{server}` `{membercount}`",
        inline: false,
      },
    ],
  });
}

async function handleSetup(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const subcommand = String(args.shift() || "status").trim().toLowerCase();
  const features = getGuildFeatures(message.guild.id);

  if (["status", "show"].includes(subcommand)) {
    await sendSetupStatus(message);
    return;
  }

  if (["help", "?"].includes(subcommand)) {
    await replyEmbed(message, {
      color: "info",
      title: "Setup Command Guide",
      description: [
        `\`${config.commandPrefix}config\``,
        `\`${config.commandPrefix}verify-role @role\``,
        `\`${config.commandPrefix}unverified-role @role\``,
        `\`${config.commandPrefix}autorole @role\``,
        `\`${config.commandPrefix}welcome-channel #channel\``,
        `\`${config.commandPrefix}welcome-message Welcome to {server}, {user}!\``,
        `\`${config.commandPrefix}welcome-test [user]\``,
        `\`${config.commandPrefix}setup status\``,
        `\`${config.commandPrefix}setup verify-role @role\``,
        `\`${config.commandPrefix}setup unverified-role @role\``,
        `\`${config.commandPrefix}setup autorole @role\``,
        `\`${config.commandPrefix}setup welcome-channel #channel\``,
        `\`${config.commandPrefix}setup welcome-message Welcome to {server}, {user}!\``,
        `\`${config.commandPrefix}setup welcome-test [user]\``,
      ].join("\n"),
    });
    return;
  }

  if (subcommand === "welcome-test") {
    const targetRaw = args.join(" ").trim();
    const member = targetRaw ? await resolveMember(message, targetRaw) : message.member;
    if (!member) {
      await replyEmbed(message, {
        color: "error",
        title: "User Not Found",
        description: "I couldn't find that user in this server.",
      });
      return;
    }

    await replyEmbed(message, {
      color: "success",
      title: `Welcome, ${member.displayName || member.user.username}`,
      description: renderWelcomeMessage(features.welcomeMessage, member),
      fields: [
        {
          name: "Previewing For",
          value: member.user.tag,
          inline: true,
        },
        {
          name: "Member Count",
          value: String(member.guild.memberCount || member.guild.members.cache.size || 0),
          inline: true,
        },
      ],
    });
    return;
  }

  const rawValue = args.join(" ").trim();
  if (!rawValue) {
    await replyUsage(message, `${config.commandPrefix}setup {status|verify-role|unverified-role|autorole|welcome-channel|welcome-message|welcome-test}`);
    return;
  }

  if (["verify-role", "unverified-role", "autorole"].includes(subcommand)) {
    const fieldMap = {
      "verify-role": "verifyRoleId",
      "unverified-role": "unverifiedRoleId",
      autorole: "autoRoleId",
    };
    const labelMap = {
      "verify-role": "Verification Role",
      "unverified-role": "Unverified Role",
      autorole: "Auto Role",
    };

    if (isClearValue(rawValue)) {
      saveGuildFeatures(message.guild.id, {
        [fieldMap[subcommand]]: "",
      }, {
        actorId: message.author.id,
        actorTag: message.author.tag,
      });

      await replyEmbed(message, {
        color: "success",
        title: "Setup Updated",
        description: `${labelMap[subcommand]} cleared.`,
      });
      return;
    }

    const role = resolveRole(message.guild, rawValue);
    await ensureGuildRoleAssignable(message.guild, role, labelMap[subcommand].toLowerCase());

    saveGuildFeatures(message.guild.id, {
      [fieldMap[subcommand]]: role.id,
    }, {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });

    await replyEmbed(message, {
      color: "success",
      title: "Setup Updated",
      description: `${labelMap[subcommand]} set to ${roleMentionOrText(role.id)}.`,
    });
    return;
  }

  if (subcommand === "welcome-channel") {
    if (isClearValue(rawValue)) {
      saveGuildFeatures(message.guild.id, {
        welcomeChannelId: "",
      }, {
        actorId: message.author.id,
        actorTag: message.author.tag,
      });

      await replyEmbed(message, {
        color: "success",
        title: "Setup Updated",
        description: "Welcome channel cleared.",
      });
      return;
    }

    const channelId = resolveChannelId(message.guild, rawValue);
    const channel = channelId ? message.guild.channels.cache.get(channelId) : null;
    if (!channelId || !channel?.isTextBased()) {
      await replyEmbed(message, {
        color: "error",
        title: "Channel Not Found",
        description: "Use a text channel mention, ID, or exact channel name.",
      });
      return;
    }

    saveGuildFeatures(message.guild.id, {
      welcomeChannelId: channelId,
    }, {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });

    await replyEmbed(message, {
      color: "success",
      title: "Setup Updated",
      description: `Welcome channel set to ${channelMentionOrText(channelId)}.`,
    });
    return;
  }

  if (subcommand === "welcome-message") {
    const value = isClearValue(rawValue)
      ? "Welcome to {server}, {user}! You are member #{membercount}."
      : rawValue;

    saveGuildFeatures(message.guild.id, {
      welcomeMessage: value,
    }, {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });

    await replyEmbed(message, {
      color: "success",
      title: "Setup Updated",
      description: "Welcome message saved.",
      fields: [
        {
          name: "Current Message",
          value,
          inline: false,
        },
      ],
    });
    return;
  }

  await replyUsage(message, `${config.commandPrefix}setup {status|verify-role|unverified-role|autorole|welcome-channel|welcome-message|welcome-test}`);
}

async function handleVerify(message, args, mode = "verify") {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const permissionCheck = await ensureBotPermissions(
    message,
    [PermissionFlagsBits.ManageRoles],
    `\`${mode}\``,
  );
  if (!permissionCheck.ok) {
    return;
  }

  const targetRaw = args.join(" ").trim();
  if (!targetRaw) {
    await replyUsage(message, `${config.commandPrefix}${mode} {user}`);
    return;
  }

  const features = getGuildFeatures(message.guild.id);
  const verifyRole = features.verifyRoleId ? message.guild.roles.cache.get(features.verifyRoleId) || null : null;
  const unverifiedRole = features.unverifiedRoleId
    ? message.guild.roles.cache.get(features.unverifiedRoleId) || null
    : null;

  if (!verifyRole) {
    await replyEmbed(message, {
      color: "warning",
      title: "Verification Role Not Set",
      description: `Set one first with \`${config.commandPrefix}setup verify-role @role\`.`,
    });
    return;
  }

  await ensureGuildRoleAssignable(message.guild, verifyRole, "the verification role");
  if (unverifiedRole) {
    await ensureGuildRoleAssignable(message.guild, unverifiedRole, "the unverified role");
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

  const botMember = await getBotMember(message);
  if (!member.manageable || member.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) {
    await replyEmbed(message, {
      color: "error",
      title: "Role Hierarchy Issue",
      description: `The bot cannot update verification roles for **${member.user.tag}**.`,
    });
    return;
  }

  if (mode === "verify") {
    if (!member.roles.cache.has(verifyRole.id)) {
      await member.roles.add(verifyRole);
    }
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await member.roles.remove(unverifiedRole).catch(() => {});
    }

    statements.createModerationAction.run({
      action_type: "verify",
      discord_user_id: member.id,
      discord_tag: member.user.tag,
      reason: `Verified by ${message.author.tag}`,
      duration_minutes: null,
      role_id: verifyRole.id,
      role_name: verifyRole.name,
      active: 0,
      expires_at: null,
    });

    await replyEmbed(message, {
      color: "success",
      title: "User Verified",
      description: `Applied ${roleMentionOrText(verifyRole.id)} to **${member.user.tag}**.`,
    });
    return;
  }

  if (member.roles.cache.has(verifyRole.id)) {
    await member.roles.remove(verifyRole);
  }
  if (unverifiedRole && !member.roles.cache.has(unverifiedRole.id)) {
    await member.roles.add(unverifiedRole).catch(() => {});
  }

  statements.createModerationAction.run({
    action_type: "unverify",
    discord_user_id: member.id,
    discord_tag: member.user.tag,
    reason: `Unverified by ${message.author.tag}`,
    duration_minutes: null,
    role_id: verifyRole.id,
    role_name: verifyRole.name,
    active: 0,
    expires_at: null,
  });

  await replyEmbed(message, {
    color: "warning",
    title: "Verification Removed",
    description: `Removed ${roleMentionOrText(verifyRole.id)} from **${member.user.tag}**.`,
  });
}

async function handlePurge(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const permissionCheck = await ensureBotPermissions(
    message,
    [PermissionFlagsBits.ManageMessages],
    "`purge`",
  );
  if (!permissionCheck.ok) {
    return;
  }

  const count = Number.parseInt(String(args[0] || "").trim(), 10);
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    await replyUsage(message, `${config.commandPrefix}purge {1-100}`);
    return;
  }

  const deleted = await message.channel.bulkDelete(count, true);
  const removed = deleted.size;

  logAction({
    actorId: message.author.id,
    actorTag: message.author.tag,
    action: "purge_messages",
    target: message.channel.id,
    details: `${removed} deleted`,
  });

  await sendTemporaryChannelEmbed(message.channel, {
    color: "success",
    title: "Channel Purged",
    description: `Deleted **${removed}** recent messages.`,
  });
}

async function applyJoinFeatures(member) {
  if (!member.guild || member.user.bot) {
    return;
  }

  const features = getGuildFeatures(member.guild.id);
  const rolesToApply = [features.autoRoleId, features.unverifiedRoleId]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  if (rolesToApply.length) {
    const botMember = await getGuildBotMember(member.guild).catch(() => null);
    if (botMember) {
      for (const roleId of rolesToApply) {
        const role = member.guild.roles.cache.get(roleId);
        if (!role || role.comparePositionTo(botMember.roles.highest) >= 0) {
          continue;
        }

        await member.roles.add(role).catch(() => {});
      }
    }
  }

  if (!features.welcomeChannelId) {
    return;
  }

  const channel =
    member.guild.channels.cache.get(features.welcomeChannelId) ||
    (await member.guild.channels.fetch(features.welcomeChannelId).catch(() => null));

  if (!channel?.isTextBased()) {
    return;
  }

  await channel
    .send({
      embeds: [
        createEmbed({
          color: "success",
          title: `Welcome to ${member.guild.name}`,
          description: renderWelcomeMessage(features.welcomeMessage, member),
          fields: [
            {
              name: "Member Count",
              value: String(member.guild.memberCount || member.guild.members.cache.size || 0),
              inline: true,
            },
            {
              name: "Verification",
              value: features.verifyRoleId ? `Use ${roleMentionOrText(features.verifyRoleId)} when ready.` : "Not configured",
              inline: true,
            },
          ],
        }),
      ],
    })
    .catch(() => {});
}

async function handleCommands(message) {
  await replyEmbed(message, {
    color: "info",
    title: "Amethyst Hub Commands",
    description: COMMAND_DESCRIPTIONS.join("\n"),
  });
}

async function handleCheckPerms(message) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const botMember = await getBotMember(message);
  const fields = REQUIRED_BOT_PERMISSIONS.map((permission) => ({
    name: permissionName(permission),
    value: botMember.permissions.has(permission) ? "Yes" : "No",
    inline: true,
  }));
  const missing = REQUIRED_BOT_PERMISSIONS.filter((permission) => !botMember.permissions.has(permission));

  await replyEmbed(message, {
    color: missing.length ? "warning" : "success",
    title: "Bot Permission Check",
    description: missing.length
      ? "Some required Discord permissions are missing for full bot functionality."
      : "The bot has all required Discord permissions in this server.",
    fields: [
      ...fields,
      {
        name: "Bot Highest Role",
        value: botMember.roles.highest.name,
        inline: false,
      },
      {
        name: "Role Hierarchy Reminder",
        value: "For `kick`, `ban`, `mute`, and `role`, the bot's highest role must stay above the target member and above any role it should assign.",
        inline: false,
      },
    ],
  });
}

function formatAutoModThresholdSummary(config) {
  return [
    `Mentions: ${config.rules.massMentions.limit}`,
    `Repeat: ${config.rules.repeatMessages.limit} in ${config.rules.repeatMessages.windowSeconds}s`,
    `Burst: ${config.rules.burstSpam.limit} in ${config.rules.burstSpam.windowSeconds}s`,
    `Caps: ${Math.round(config.rules.caps.ratio * 100)}% after ${config.rules.caps.minLength} letters`,
    `Chars: ${config.rules.repeatedChars.limit}+`,
    `Emoji: ${config.rules.emojiSpam.limit}`,
    `Lines: ${config.rules.lineSpam.limit}`,
  ].join("\n");
}

function formatAutoModListValue(path, value) {
  switch (path) {
    case "exemptRoleIds":
      return `<@&${value}>`;
    case "exemptChannelIds":
      return `<#${value}>`;
    case "exemptUserIds":
      return `<@${value}>`;
    default:
      return `\`${value}\``;
  }
}

function getAutoModListValues(config, path) {
  return Array.isArray(config[path]) ? config[path] : [];
}

async function sendAutoModStatus(message, title = "Auto-Mod Status") {
  const config = getAutoModConfig();
  const enabledRules = listEnabledRules(config);

  await replyEmbed(message, {
    color: config.enabled ? "info" : "warning",
    title,
    description: config.enabled
      ? "Shared automod is active. Discord commands and the admin panel are editing the same profile."
      : "Auto-mod is currently disabled server-wide.",
    fields: [
      {
        name: "Actions",
        value: [
          `Delete: ${config.actions.deleteMessage ? "On" : "Off"}`,
          `Timeout: ${config.actions.timeoutEnabled ? `On (${config.actions.timeoutMinutes}m)` : "Off"}`,
          `Public notice: ${config.actions.sendPublicNotice ? `On (${config.actions.noticeSeconds}s)` : "Off"}`,
          `Log channel: ${config.actions.logChannelId ? `<#${config.actions.logChannelId}>` : "Not set"}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "Enabled Rules",
        value: enabledRules.length ? enabledRules.map(autoModRuleLabel).join(", ") : "None",
        inline: false,
      },
      {
        name: "Thresholds",
        value: formatAutoModThresholdSummary(config),
        inline: false,
      },
      {
        name: "Lists",
        value: [
          `Allowed invites: ${config.allowedInviteCodes.length}`,
          `Allowed domains: ${config.allowedDomains.length}`,
          `Blocked words: ${config.blockedWords.length}`,
          `Blocked extensions: ${config.blockedExtensions.length}`,
          `Exempt roles: ${config.exemptRoleIds.length}`,
          `Exempt channels: ${config.exemptChannelIds.length}`,
          `Exempt users: ${config.exemptUserIds.length}`,
        ].join("\n"),
        inline: false,
      },
    ],
  });
}

function parseAutoModInteger(raw, minimum, maximum, label) {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number.`);
  }
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function parseAutoModRatio(raw) {
  const parsed = Number.parseFloat(String(raw || "").trim());
  if (!Number.isFinite(parsed)) {
    throw new Error("Caps ratio must be a number like 0.75 or 75.");
  }

  if (parsed > 1) {
    if (parsed > 100) {
      throw new Error("Caps ratio must be between 0 and 100.");
    }
    return parsed / 100;
  }

  if (parsed < 0 || parsed > 1) {
    throw new Error("Caps ratio must be between 0 and 1.");
  }

  return parsed;
}

async function resolveAutoModSetValue(message, setting, rawValue) {
  if (setting.type === "int") {
    return parseAutoModInteger(rawValue, setting.min, setting.max, setting.label);
  }

  if (setting.type === "ratio") {
    return parseAutoModRatio(rawValue);
  }

  if (setting.type === "channel") {
    const clean = String(rawValue || "").trim();
    if (!clean || ["none", "clear", "off"].includes(clean.toLowerCase())) {
      return "";
    }

    const channelId = resolveChannelId(message.guild, clean);
    if (!channelId) {
      throw new Error("I couldn't resolve that channel. Use a channel mention, ID, or exact name.");
    }

    return channelId;
  }

  return String(rawValue || "").trim();
}

async function resolveAutoModListValue(message, path, rawArgs) {
  const joined = rawArgs.join(" ").trim();
  if (!joined) {
    throw new Error("That list command needs a value.");
  }

  switch (path) {
    case "allowedInviteCodes": {
      const code = normalizeAutoModInviteCode(joined);
      if (!code) {
        throw new Error("Give me an invite code or Discord invite URL.");
      }
      return code;
    }
    case "allowedDomains": {
      const domain = normalizeAutoModDomain(joined);
      if (!domain || !domain.includes(".")) {
        throw new Error("Give me a domain like example.com.");
      }
      return domain;
    }
    case "blockedWords":
      return joined.toLowerCase();
    case "blockedExtensions":
      return joined.toLowerCase().replace(/^\./, "");
    case "exemptRoleIds": {
      const roleId = resolveRoleId(message.guild, joined);
      if (!roleId) {
        throw new Error("I couldn't resolve that role. Use a role mention, ID, or exact name.");
      }
      return roleId;
    }
    case "exemptChannelIds": {
      const channelId = resolveChannelId(message.guild, joined);
      if (!channelId) {
        throw new Error("I couldn't resolve that channel. Use a channel mention, ID, or exact name.");
      }
      return channelId;
    }
    case "exemptUserIds": {
      const userId = await resolveUserId(message, joined);
      if (!userId) {
        throw new Error("I couldn't resolve that user. Use a mention, ID, or exact username.");
      }
      return userId;
    }
    default:
      return joined;
  }
}

async function applyAutoModListShortcut(message, path, operation, rawArgs, title) {
  const value = await resolveAutoModListValue(message, path, rawArgs);
  const autoModConfig = updateAutoModList(
    path,
    operation,
    value,
    {
      actorId: message.author.id,
      actorTag: message.author.tag,
    },
  );

  await replyEmbed(message, {
    color: "success",
    title,
    description: `${AUTOMOD_LIST_LABELS[path]} ${operation === "remove" ? "updated" : "saved"}.`,
    fields: [
      {
        name: "Value",
        value: formatAutoModListValue(path, value),
        inline: false,
      },
      {
        name: "Current Count",
        value: String(getAutoModListValues(autoModConfig, path).length),
        inline: true,
      },
    ],
  });
}

function formatAutoModSettingResult(setting, value) {
  if (setting.type === "ratio") {
    return `${Math.round(value * 100)}%`;
  }
  if (setting.type === "channel") {
    return value ? `<#${value}>` : "Cleared";
  }
  return String(value);
}

async function handleAutoModCommand(message, args) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const subcommand = String(args.shift() || "status").trim().toLowerCase();

  if (["status", "show", "summary"].includes(subcommand)) {
    await sendAutoModStatus(message);
    return;
  }

  if (["help", "?"].includes(subcommand)) {
    await replyEmbed(message, {
      color: "info",
      title: "Auto-Mod Command Guide",
      description: [
        `\`${config.commandPrefix}automod status\``,
        `\`${config.commandPrefix}automod on\``,
        `\`${config.commandPrefix}automod off\``,
        `\`${config.commandPrefix}automod logs #mod-logs\``,
        `\`${config.commandPrefix}automod allow-domain youtube.com\``,
        `\`${config.commandPrefix}automod allow-invite vFdWTQ3uKC\``,
        `\`${config.commandPrefix}automod block-word scam link\``,
        `\`${config.commandPrefix}automod exempt-role @Trusted\``,
        `\`${config.commandPrefix}automod exempt-channel #self-promo\``,
        `\`${config.commandPrefix}automod toggle links on\``,
        `\`${config.commandPrefix}automod set timeout 15\``,
        `\`${config.commandPrefix}automod set log-channel #mod-logs\``,
        `\`${config.commandPrefix}automod add domain example.com\``,
        `\`${config.commandPrefix}automod add word scam link\``,
        `\`${config.commandPrefix}automod exempt role @Trusted\``,
        `\`${config.commandPrefix}automod list domains\``,
        `\`${config.commandPrefix}automod preset strict\``,
      ].join("\n"),
    });
    return;
  }

  if (["on", "enable", "enabled"].includes(subcommand)) {
    updateAutoModValue("enabled", true, {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });
    await sendAutoModStatus(message, "Auto-Mod Enabled");
    return;
  }

  if (["off", "disable", "disabled"].includes(subcommand)) {
    updateAutoModValue("enabled", false, {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });
    await sendAutoModStatus(message, "Auto-Mod Disabled");
    return;
  }

  if (subcommand === "logs") {
    const rawValue = args.join(" ").trim();
    if (!rawValue) {
      await replyUsage(message, `${config.commandPrefix}automod logs {#channel|off}`);
      return;
    }

    const channelId = isClearValue(rawValue) ? "" : resolveChannelId(message.guild, rawValue);
    if (!isClearValue(rawValue) && !channelId) {
      await replyEmbed(message, {
        color: "error",
        title: "Channel Not Found",
        description: "Use a channel mention, ID, or exact name.",
      });
      return;
    }

    updateAutoModValue("actions.logChannelId", channelId, {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });

    await replyEmbed(message, {
      color: "success",
      title: "Auto-Mod Updated",
      description: `Log channel set to **${channelId ? `<#${channelId}>` : "Not set"}**.`,
    });
    return;
  }

  if (subcommand === "allow-domain") {
    await applyAutoModListShortcut(message, "allowedDomains", "add", args, "Allowed Domain Saved");
    return;
  }

  if (subcommand === "unallow-domain") {
    await applyAutoModListShortcut(message, "allowedDomains", "remove", args, "Allowed Domain Removed");
    return;
  }

  if (subcommand === "allow-invite") {
    await applyAutoModListShortcut(message, "allowedInviteCodes", "add", args, "Allowed Invite Saved");
    return;
  }

  if (subcommand === "unallow-invite") {
    await applyAutoModListShortcut(message, "allowedInviteCodes", "remove", args, "Allowed Invite Removed");
    return;
  }

  if (subcommand === "block-word") {
    await applyAutoModListShortcut(message, "blockedWords", "add", args, "Blocked Phrase Saved");
    return;
  }

  if (subcommand === "unblock-word") {
    await applyAutoModListShortcut(message, "blockedWords", "remove", args, "Blocked Phrase Removed");
    return;
  }

  if (subcommand === "exempt-role") {
    await applyAutoModListShortcut(message, "exemptRoleIds", "add", args, "Exempt Role Saved");
    return;
  }

  if (subcommand === "unexempt-role") {
    await applyAutoModListShortcut(message, "exemptRoleIds", "remove", args, "Exempt Role Removed");
    return;
  }

  if (subcommand === "exempt-channel") {
    await applyAutoModListShortcut(message, "exemptChannelIds", "add", args, "Exempt Channel Saved");
    return;
  }

  if (subcommand === "unexempt-channel") {
    await applyAutoModListShortcut(message, "exemptChannelIds", "remove", args, "Exempt Channel Removed");
    return;
  }

  if (subcommand === "exempt-user") {
    await applyAutoModListShortcut(message, "exemptUserIds", "add", args, "Exempt User Saved");
    return;
  }

  if (subcommand === "unexempt-user") {
    await applyAutoModListShortcut(message, "exemptUserIds", "remove", args, "Exempt User Removed");
    return;
  }

  if (subcommand === "toggle") {
    const key = String(args[0] || "").trim().toLowerCase().replace(/[^a-z-]/g, "");
    const value = parseAutoModToggleValue(args[1]);
    const target = AUTOMOD_TOGGLE_PATHS[key];
    if (!target || value === null) {
      await replyUsage(message, `${config.commandPrefix}automod toggle {setting} {on|off}`);
      return;
    }

    updateAutoModValue(target.path, value, {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });

    await replyEmbed(message, {
      color: "success",
      title: "Auto-Mod Updated",
      description: `${target.label} is now **${value ? "enabled" : "disabled"}**.`,
    });
    return;
  }

  if (subcommand === "set") {
    const key = String(args[0] || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    const target = AUTOMOD_SET_PATHS[key];
    const rawValue = args.slice(1).join(" ").trim();
    if (!target || !rawValue) {
      await replyUsage(message, `${config.commandPrefix}automod set {setting} {value}`);
      return;
    }

    const value = await resolveAutoModSetValue(message, target, rawValue);
    updateAutoModValue(target.path, value, {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });

    await replyEmbed(message, {
      color: "success",
      title: "Auto-Mod Updated",
      description: `${target.label} set to **${formatAutoModSettingResult(target, value)}**.`,
    });
    return;
  }

  if (["add", "remove", "allow", "block", "exempt", "unallow", "unblock", "unexempt"].includes(subcommand)) {
    const operation = ["remove", "unallow", "unblock", "unexempt"].includes(subcommand) ? "remove" : "add";
    const category = String(args.shift() || "").trim().toLowerCase();
    const path = AUTOMOD_LIST_PATHS[category];
    if (!path) {
      await replyUsage(message, `${config.commandPrefix}automod ${subcommand} {category} {value}`);
      return;
    }

    const value = await resolveAutoModListValue(message, path, args);
    const autoModConfig = updateAutoModList(
      path,
      operation,
      value,
      {
        actorId: message.author.id,
        actorTag: message.author.tag,
      },
    );

    await replyEmbed(message, {
      color: "success",
      title: "Auto-Mod List Updated",
      description: `${AUTOMOD_LIST_LABELS[path]} ${operation === "remove" ? "removed" : "updated"}.`,
      fields: [
        {
          name: "Value",
          value: formatAutoModListValue(path, value),
          inline: false,
        },
        {
          name: "Current Count",
          value: String(getAutoModListValues(autoModConfig, path).length),
          inline: true,
        },
      ],
    });
    return;
  }

  if (subcommand === "list") {
    const category = String(args[0] || "").trim().toLowerCase();
    const path = AUTOMOD_LIST_PATHS[category];
    if (!path) {
      await replyUsage(message, `${config.commandPrefix}automod list {category}`);
      return;
    }

    const currentConfig = getAutoModConfig();
    const values = getAutoModListValues(currentConfig, path);
    await replyEmbed(message, {
      color: "info",
      title: AUTOMOD_LIST_LABELS[path],
      description: values.length
        ? values.slice(0, 20).map((value) => `• ${formatAutoModListValue(path, value)}`).join("\n")
        : "No values are stored there yet.",
      fields:
        values.length > 20
          ? [
              {
                name: "Trimmed",
                value: `${values.length - 20} additional values not shown.`,
                inline: false,
              },
            ]
          : [],
    });
    return;
  }

  if (subcommand === "preset") {
    const preset = String(args[0] || "").trim().toLowerCase();
    if (!preset || !["balanced", "strict", "relaxed", "off", "default", "disabled"].includes(preset)) {
      await replyUsage(message, `${config.commandPrefix}automod preset {balanced|strict|relaxed|off}`);
      return;
    }

    applyAutoModPreset(preset, {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });
    await sendAutoModStatus(message, `Auto-Mod Preset Applied: ${preset}`);
    return;
  }

  if (subcommand === "reset") {
    applyAutoModPreset("balanced", {
      actorId: message.author.id,
      actorTag: message.author.tag,
    });
    await sendAutoModStatus(message, "Auto-Mod Reset To Balanced");
    return;
  }

  await replyUsage(message, `${config.commandPrefix}automod {status|toggle|set|add|remove|list|preset|reset}`);
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

async function handleAutoMod(message) {
  if (!message.member || isBotAdmin(message.member)) {
    return false;
  }

  const violation = evaluateAutoModMessage(message);
  if (!violation) {
    return false;
  }

  const autoModConfig = violation.config || getAutoModConfig();
  const botMember = await getBotMember(message).catch(() => null);
  const canDelete =
    Boolean(botMember) &&
    autoModConfig.actions.deleteMessage &&
    message.deletable &&
    message.channel?.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageMessages);
  const timeoutMs = autoModConfig.actions.timeoutEnabled
    ? autoModConfig.actions.timeoutMinutes * 60_000
    : 0;
  const canTimeout =
    Boolean(botMember) &&
    timeoutMs > 0 &&
    botMember.permissions.has(PermissionFlagsBits.ModerateMembers) &&
    message.member.moderatable;

  if (canDelete) {
    await message.delete().catch(() => {});
  }

  if (canTimeout) {
    await message.member.timeout(timeoutMs, `Automod: ${violation.code}`).catch(() => {});
    statements.createModerationAction.run({
      action_type: "automod",
      discord_user_id: message.author.id,
      discord_tag: message.author.tag,
      reason: `${violation.ruleLabel}: ${violation.description}`,
      duration_minutes: Math.round(timeoutMs / 60000),
      role_id: null,
      role_name: null,
      active: 1,
      expires_at: new Date(Date.now() + timeoutMs).toISOString(),
    });
  } else {
    statements.createModerationAction.run({
      action_type: "automod",
      discord_user_id: message.author.id,
      discord_tag: message.author.tag,
      reason: `${violation.ruleLabel}: ${violation.description}`,
      duration_minutes: null,
      role_id: null,
      role_name: null,
      active: 0,
      expires_at: null,
    });
  }

  const actionSummary = canDelete
    ? canTimeout
      ? `Message removed and timed out for ${autoModConfig.actions.timeoutMinutes} minutes.`
      : "Message removed."
    : canTimeout
      ? `Timed out for ${autoModConfig.actions.timeoutMinutes} minutes.`
      : "Event logged.";

  const logEmbed = createEmbed({
    color: "warning",
    title: `Auto-Mod • ${violation.ruleLabel}`,
    description: `**${message.author.tag}** triggered auto-mod in <#${message.channel.id}>.`,
    fields: [
      {
        name: "Reason",
        value: violation.description,
        inline: false,
      },
      {
        name: "Evidence",
        value: violation.evidence ? `\`${String(violation.evidence).slice(0, 200)}\`` : "No extra evidence",
        inline: false,
      },
      {
        name: "Action",
        value: actionSummary,
        inline: false,
      },
    ],
  });

  if (autoModConfig.actions.logChannelId) {
    const logChannel =
      message.guild.channels.cache.get(autoModConfig.actions.logChannelId) ||
      (await message.guild.channels.fetch(autoModConfig.actions.logChannelId).catch(() => null));

    if (logChannel?.isTextBased()) {
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
  }

  if (!autoModConfig.actions.sendPublicNotice) {
    return true;
  }

  const warning = await message.channel
    .send({
      embeds: [
        createEmbed({
          color: "warning",
          title: "Auto-Mod Triggered",
          description: `A message from **${message.author.tag}** was filtered by **${violation.ruleLabel}**.`,
          fields: [
            {
              name: "Reason",
              value: violation.description,
              inline: false,
            },
            {
              name: "Action",
              value: actionSummary,
              inline: false,
            },
          ],
        }),
      ],
    })
    .catch(() => null);

  if (warning) {
    setTimeout(() => {
      warning.delete().catch(() => {});
    }, Math.max(3, autoModConfig.actions.noticeSeconds) * 1000);
  }

  return true;
}

async function handleGenerate(message, args, requestedScope) {
  if (!(await ensureAdmin(message))) {
    return;
  }

  const scope = normalizeAccessScope(requestedScope, "normal");
  const type = keyTypeForScope(scope);
  const accessLabel = scopeLabel(scope);
  const commandName = commandNameForScope(scope);
  const targetRaw = args[0];
  const robloxUser = args[1];
  const durationRaw = args[2];

  if (!targetRaw || !robloxUser || (scope === "premium" && !durationRaw)) {
    await replyUsage(
      message,
      `${config.commandPrefix}${commandName} {user} {robloxuser}${scope === "premium" ? " {duration}" : ""}`,
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
    const durationMs = scope === "premium" ? parseDuration(durationRaw) : null;
    const result = createOrReuseKey({
      discordUserId: member.id,
      discordTag: member.user.tag,
      robloxUser,
      type,
      scope,
      durationMs,
      force: true,
      actorId: message.author.id,
      actorTag: message.author.tag,
    });

    try {
      await sendEmbed(member.user, {
        color: type === "premium" ? "info" : "success",
        title: `${accessLabel} Key Ready`,
        description: `Here is your Amethyst Hub access key for **${result.record.roblox_user}**.`,
        fields: keyFields(result.record),
        footerText: `Issued by ${message.author.tag}`,
      });

      await replyEmbed(message, {
        color: type === "premium" ? "info" : "success",
        title: `${accessLabel} Key Delivered`,
        description: `The key for **${member.user.tag}** was sent by DM.`,
        fields: deliveryFields(result.record),
      });
    } catch (dmError) {
      let sentToIssuer = false;

      try {
        await sendEmbed(message.author, {
          color: "warning",
          title: `${accessLabel} Key Delivery Failed`,
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
    const accessLabel = accessLabelForRecord(updated);

    try {
      await sendEmbed(member.user, {
        color: "warning",
        title: `${accessLabel} Key Revoked`,
        description: `Your Amethyst Hub key for **${updated.roblox_user}** has been revoked.`,
        fields: keyFields(updated),
        footerText: `Revoked by ${message.author.tag}`,
      });

      await replyEmbed(message, {
        color: "warning",
        title: `${accessLabel} Key Revoked`,
        description: `The revocation notice for **${member.user.tag}** was sent by DM.`,
        fields: deliveryFields(updated),
      });
    } catch (dmError) {
      let sentToIssuer = false;

      try {
        await sendEmbed(message.author, {
          color: "warning",
          title: `${accessLabel} Revocation Notice Failed`,
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

  const permissionCheck = await ensureBotPermissions(
    message,
    [PermissionFlagsBits.BanMembers],
    "`ban`",
  );
  if (!permissionCheck.ok) {
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

  const targetCheck = await ensureActionableTarget(message, member, "ban");
  if (!targetCheck.ok) {
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

  const permissionCheck = await ensureBotPermissions(
    message,
    [PermissionFlagsBits.KickMembers],
    "`kick`",
  );
  if (!permissionCheck.ok) {
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

  const targetCheck = await ensureActionableTarget(message, member, "kick");
  if (!targetCheck.ok) {
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

  const permissionCheck = await ensureBotPermissions(
    message,
    [PermissionFlagsBits.ModerateMembers],
    "`mute`",
  );
  if (!permissionCheck.ok) {
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

  const targetCheck = await ensureActionableTarget(message, member, "mute");
  if (!targetCheck.ok) {
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

  const permissionCheck = await ensureBotPermissions(
    message,
    [PermissionFlagsBits.ManageRoles],
    "`role`",
  );
  if (!permissionCheck.ok) {
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

  const botMember = await getBotMember(message);
  if (!member.manageable || role.comparePositionTo(botMember.roles.highest) >= 0) {
    await replyEmbed(message, {
      color: "error",
      title: "Role Hierarchy Issue",
      description: `The bot cannot add **${role.name}** to **${member.user.tag}**.`,
      fields: [
        {
          name: "Why This Happens",
          value: "The bot's highest role must be above the target member and above the role being assigned.",
          inline: false,
        },
        {
          name: "Bot Highest Role",
          value: botMember.roles.highest.name,
          inline: true,
        },
        {
          name: "Requested Role",
          value: role.name,
          inline: true,
        },
      ],
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

  const permissionCheck = await ensureBotPermissions(
    message,
    [PermissionFlagsBits.BanMembers],
    "`unban`",
  );
  if (!permissionCheck.ok) {
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

  const permissionCheck = await ensureBotPermissions(
    message,
    [PermissionFlagsBits.ModerateMembers],
    "`unmute`",
  );
  if (!permissionCheck.ok) {
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

  const targetCheck = await ensureActionableTarget(message, member, "unmute");
  if (!targetCheck.ok) {
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

  client.on("guildMemberAdd", async (member) => {
    try {
      await applyJoinFeatures(member);
    } catch (error) {
      console.error("Failed to apply join features", error);
    }
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) {
      return;
    }

    if (!message.content.startsWith(config.commandPrefix)) {
      await handleAutoMod(message);
      return;
    }

    const content = message.content.slice(config.commandPrefix.length).trim();
    const [command, ...args] = content.split(/\s+/);

    try {
      switch (command.toLowerCase()) {
        case "commands":
        case "help":
          await handleCommands(message);
          break;
        case "check-perms":
          await handleCheckPerms(message);
          break;
        case "config":
          await handleSetup(message, ["status"]);
          break;
        case "verify-role":
          await handleSetup(message, ["verify-role", ...args]);
          break;
        case "unverified-role":
          await handleSetup(message, ["unverified-role", ...args]);
          break;
        case "autorole":
          await handleSetup(message, ["autorole", ...args]);
          break;
        case "welcome-channel":
          await handleSetup(message, ["welcome-channel", ...args]);
          break;
        case "welcome-message":
          await handleSetup(message, ["welcome-message", ...args]);
          break;
        case "welcome-test":
          await handleSetup(message, ["welcome-test", ...args]);
          break;
        case "automod":
          await handleAutoModCommand(message, args);
          break;
        case "prem-gen":
          await handleGenerate(message, args, "premium");
          break;
        case "gen-key":
          await handleGenerate(message, args, "normal");
          break;
        case "bloxfruits":
          await handleGenerate(message, args, "bloxfruits");
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
        case "purge":
          await handlePurge(message, args);
          break;
        case "verify":
          await handleVerify(message, args, "verify");
          break;
        case "unverify":
          await handleVerify(message, args, "unverify");
          break;
        case "unban":
          await handleUnban(message, args);
          break;
        case "unmute":
          await handleUnmute(message, args);
          break;
        case "setup":
          await handleSetup(message, args);
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
    setBotClient(null);
    return null;
  }

  await client.login(config.discordToken);
  setBotClient(client);
  return client;
}

module.exports = {
  startBot,
};
