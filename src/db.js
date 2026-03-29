const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id TEXT UNIQUE,
    discord_tag TEXT,
    roblox_user TEXT,
    active_hwid TEXT,
    blacklisted INTEGER NOT NULL DEFAULT 0,
    blacklist_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    discord_user_id TEXT,
    discord_tag TEXT,
    roblox_user TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('normal', 'premium')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked', 'expired')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    revoked_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS moderation_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    discord_user_id TEXT,
    discord_tag TEXT,
    reason TEXT,
    duration_minutes INTEGER,
    role_id TEXT,
    role_name TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    lifted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT,
    actor_tag TEXT,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_keys_lookup
    ON keys(discord_user_id, roblox_user, type, status, expires_at);
`);

// Preserve lifetime premium keys in existing databases without rebuilding the table.
db.exec(`
  UPDATE keys
  SET expires_at = 'never'
  WHERE type = 'premium' AND status = 'active' AND expires_at != 'never';
`);

const statements = {
  upsertUser: db.prepare(`
    INSERT INTO users (discord_user_id, discord_tag, roblox_user, blacklisted, blacklist_reason, updated_at)
    VALUES (@discord_user_id, @discord_tag, @roblox_user, COALESCE(@blacklisted, 0), @blacklist_reason, CURRENT_TIMESTAMP)
    ON CONFLICT(discord_user_id) DO UPDATE SET
      discord_tag = excluded.discord_tag,
      roblox_user = COALESCE(excluded.roblox_user, users.roblox_user),
      blacklisted = COALESCE(excluded.blacklisted, users.blacklisted),
      blacklist_reason = COALESCE(excluded.blacklist_reason, users.blacklist_reason),
      updated_at = CURRENT_TIMESTAMP
  `),
  findUserByDiscordId: db.prepare(`
    SELECT * FROM users WHERE discord_user_id = ?
  `),
  findUserByRoblox: db.prepare(`
    SELECT * FROM users WHERE roblox_user = ?
  `),
  resetHwid: db.prepare(`
    UPDATE users
    SET active_hwid = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE discord_user_id = ?
  `),
  setBlacklist: db.prepare(`
    UPDATE users
    SET blacklisted = ?, blacklist_reason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE discord_user_id = ?
  `),
  insertKey: db.prepare(`
    INSERT INTO keys (
      key, discord_user_id, discord_tag, roblox_user, type, status, created_at, expires_at
    ) VALUES (
      @key, @discord_user_id, @discord_tag, @roblox_user, @type, @status, @created_at, @expires_at
    )
  `),
  findActiveKey: db.prepare(`
    SELECT *
    FROM keys
    WHERE discord_user_id = ?
      AND roblox_user = ?
      AND type = ?
      AND status = 'active'
      AND (expires_at = 'never' OR datetime(expires_at) > datetime('now'))
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `),
  findKeyByValue: db.prepare(`
    SELECT * FROM keys WHERE key = ?
  `),
  findValidKeyForRobloxUser: db.prepare(`
    SELECT *
    FROM keys
    WHERE key = ?
      AND lower(roblox_user) = lower(?)
      AND status = 'active'
      AND (expires_at = 'never' OR datetime(expires_at) > datetime('now'))
    LIMIT 1
  `),
  revokeKey: db.prepare(`
    UPDATE keys
    SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoked_reason = ?
    WHERE key = ?
  `),
  expireOldKeys: db.prepare(`
    UPDATE keys
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at != 'never'
      AND datetime(expires_at) <= datetime('now')
  `),
  listKeysForUser: db.prepare(`
    SELECT *
    FROM keys
    WHERE discord_user_id = ?
    ORDER BY datetime(created_at) DESC
  `),
  listBlacklistedUsers: db.prepare(`
    SELECT *
    FROM users
    WHERE blacklisted = 1
    ORDER BY updated_at DESC
  `),
  createModerationAction: db.prepare(`
    INSERT INTO moderation_actions (
      action_type, discord_user_id, discord_tag, reason, duration_minutes, role_id, role_name, active, expires_at
    ) VALUES (
      @action_type, @discord_user_id, @discord_tag, @reason, @duration_minutes, @role_id, @role_name, @active, @expires_at
    )
  `),
  liftModerationAction: db.prepare(`
    UPDATE moderation_actions
    SET active = 0, lifted_at = CURRENT_TIMESTAMP
    WHERE discord_user_id = ? AND action_type = ? AND active = 1
  `),
  insertAuditLog: db.prepare(`
    INSERT INTO audit_logs (actor_id, actor_tag, action, target, details)
    VALUES (?, ?, ?, ?, ?)
  `),
};

function logAction({ actorId, actorTag, action, target, details }) {
  statements.insertAuditLog.run(actorId || null, actorTag || null, action, target || null, details || null);
}

function runMaintenance() {
  statements.expireOldKeys.run();
}

module.exports = {
  db,
  statements,
  logAction,
  runMaintenance,
};
