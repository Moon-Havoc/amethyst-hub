const crypto = require("crypto");
const { statements, logAction, runMaintenance } = require("./db");

const LIFETIME_EXPIRY = "never";

function nowIso() {
  return new Date().toISOString();
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function generateKeyValue() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  while (suffix.length < 15) {
    const byte = crypto.randomBytes(1)[0];
    suffix += alphabet[byte % alphabet.length];
  }
  return `LUM_${suffix}`;
}

function normalizeName(value) {
  return String(value || "").trim();
}

function ensureUserRecord({ discordUserId, discordTag, robloxUser }) {
  statements.upsertUser.run({
    discord_user_id: discordUserId || null,
    discord_tag: discordTag || null,
    roblox_user: robloxUser || null,
    blacklisted: null,
    blacklist_reason: null,
  });

  if (discordUserId) {
    return statements.findUserByDiscordId.get(discordUserId);
  }
  return statements.findUserByRoblox.get(robloxUser);
}

function createOrReuseKey({
  discordUserId,
  discordTag,
  robloxUser,
  type = "normal",
  force = false,
  actorId,
  actorTag,
}) {
  runMaintenance();

  const cleanRobloxUser = normalizeName(robloxUser);
  if (!cleanRobloxUser) {
    throw new Error("Roblox username is required.");
  }

  if (discordUserId) {
    const user = ensureUserRecord({ discordUserId, discordTag, robloxUser: cleanRobloxUser });
    if (user && user.blacklisted) {
      throw new Error("This user is blacklisted and cannot receive keys.");
    }
  }

  if (!force && discordUserId) {
    const existing = statements.findActiveKey.get(discordUserId, cleanRobloxUser, type);
    if (existing) {
      return { record: existing, created: false };
    }
  }

  const record = {
    key: generateKeyValue(),
    discord_user_id: discordUserId || null,
    discord_tag: discordTag || null,
    roblox_user: cleanRobloxUser,
    type,
    status: "active",
    created_at: nowIso(),
    expires_at: type === "premium" ? LIFETIME_EXPIRY : hoursFromNow(24),
  };

  statements.insertKey.run(record);
  logAction({
    actorId,
    actorTag,
    action: type === "premium" ? "create_premium_key" : "create_normal_key",
    target: discordUserId || cleanRobloxUser,
    details: record.key,
  });

  return { record, created: true };
}

function revokeKey({ key, reason, actorId, actorTag }) {
  runMaintenance();
  const existing = statements.findKeyByValue.get(key);
  if (!existing) {
    throw new Error("Key not found.");
  }
  statements.revokeKey.run(reason || "Revoked by administrator", key);
  logAction({
    actorId,
    actorTag,
    action: "revoke_key",
    target: existing.discord_user_id || existing.roblox_user,
    details: key,
  });
  return statements.findKeyByValue.get(key);
}

function validateKey({ key, robloxUser }) {
  runMaintenance();

  const cleanKey = normalizeName(key);
  const cleanRobloxUser = normalizeName(robloxUser);

  if (!cleanKey || !cleanRobloxUser) {
    throw new Error("key and robloxUser are required.");
  }

  const record = statements.findValidKeyForRobloxUser.get(cleanKey, cleanRobloxUser);
  if (!record) {
    return {
      valid: false,
      reason: "Key is invalid, revoked, expired, or does not belong to this Roblox user.",
    };
  }

  return {
    valid: true,
    record,
  };
}

function resetHwid({ discordUserId, actorId, actorTag }) {
  statements.resetHwid.run(discordUserId);
  logAction({
    actorId,
    actorTag,
    action: "reset_hwid",
    target: discordUserId,
    details: "HWID cleared",
  });
}

function setBlacklist({ discordUserId, discordTag, robloxUser, blacklisted, reason, actorId, actorTag }) {
  ensureUserRecord({ discordUserId, discordTag, robloxUser });
  statements.setBlacklist.run(blacklisted ? 1 : 0, reason || null, discordUserId);
  logAction({
    actorId,
    actorTag,
    action: blacklisted ? "blacklist_user" : "unblacklist_user",
    target: discordUserId,
    details: reason || "",
  });
  return statements.findUserByDiscordId.get(discordUserId);
}

module.exports = {
  createOrReuseKey,
  revokeKey,
  resetHwid,
  setBlacklist,
  validateKey,
};
