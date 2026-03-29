const express = require("express");
const path = require("path");
const config = require("./config");
const { statements, runMaintenance } = require("./db");
const { createOrReuseKey, validateKey } = require("./key-service");

const app = express();

app.use(express.json());
app.use(express.static(path.join(config.rootDir, "public")));

app.get("/api/health", (req, res) => {
  runMaintenance();
  res.json({
    ok: true,
    name: "Luminia Hub",
    time: new Date().toISOString(),
  });
});

app.post("/api/keys/generate", (req, res) => {
  try {
    const { discordUserId, discordTag, robloxUser } = req.body || {};
    if (!discordUserId || !robloxUser) {
      return res.status(400).json({
        ok: false,
        error: "discordUserId and robloxUser are required.",
      });
    }

    const result = createOrReuseKey({
      discordUserId: String(discordUserId).trim(),
      discordTag: String(discordTag || discordUserId).trim(),
      robloxUser: String(robloxUser).trim(),
      type: "normal",
      actorId: "website",
      actorTag: "website",
    });

    return res.json({
      ok: true,
      created: result.created,
      key: result.record.key,
      type: result.record.type,
      status: result.record.status,
      createdAt: result.record.created_at,
      expiresAt: result.record.expires_at,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/keys/validate", (req, res) => {
  try {
    const { key, robloxUser } = req.body || {};
    const result = validateKey({
      key: String(key || "").trim(),
      robloxUser: String(robloxUser || "").trim(),
    });

    if (!result.valid) {
      return res.status(200).json({
        ok: true,
        valid: false,
        reason: result.reason,
      });
    }

    return res.json({
      ok: true,
      valid: true,
      type: result.record.type,
      status: result.record.status,
      robloxUser: result.record.roblox_user,
      expiresAt: result.record.expires_at,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      valid: false,
      error: error.message,
    });
  }
});

app.get("/api/keys/status", (req, res) => {
  runMaintenance();
  const discordUserId = String(req.query.discordUserId || "").trim();
  if (!discordUserId) {
    return res.status(400).json({
      ok: false,
      error: "discordUserId is required.",
    });
  }

  const keys = statements.listKeysForUser.all(discordUserId);
  return res.json({
    ok: true,
    keys,
  });
});

app.use((req, res) => {
  res.sendFile(path.join(config.rootDir, "public", "index.html"));
});

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      console.log(`Website running at ${config.siteUrl}`);
      resolve(server);
    });
  });
}

module.exports = {
  startServer,
};
