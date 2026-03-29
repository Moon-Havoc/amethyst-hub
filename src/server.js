const express = require("express");
const path = require("path");
const config = require("./config");
const { statements, runMaintenance } = require("./db");
const { createOrReuseKey, validateKey } = require("./key-service");
const {
  authenticateAdmin,
  clearAdminCookie,
  createSession,
  getAdminUser,
  requireAdminApi,
  setAdminCookie,
} = require("./admin-auth");

const app = express();

app.use(express.json());
app.use(express.static(path.join(config.rootDir, "public")));

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeFeatureList(value) {
  return String(value || "")
    .split(/[\n,|]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(", ");
}

function sanitizeScriptInput(payload) {
  const title = String(payload.title || "").trim();
  const slug = slugify(payload.slug || payload.title);
  const description = String(payload.description || "").trim();
  const coverImage = String(payload.coverImage || payload.cover_image || "").trim();
  const placeId = String(payload.placeId || payload.place_id || "").trim();
  const statusLabel = String(payload.statusLabel || payload.status_label || "Working").trim();
  const featureList = normalizeFeatureList(
    payload.featureList || payload.feature_list || payload.features,
  );
  const content = String(payload.content || "");

  if (!title) {
    throw new Error("Script title is required.");
  }

  if (!slug) {
    throw new Error("Script slug is required.");
  }

  if (!content.trim()) {
    throw new Error("Script content is required.");
  }

  return {
    title,
    slug,
    description,
    cover_image: coverImage.slice(0, 500),
    place_id: placeId.slice(0, 120),
    status_label: (statusLabel || "Working").slice(0, 40),
    feature_list: featureList,
    content,
  };
}

function respondWithValidationResult(res, key, robloxUser) {
  try {
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
}

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
  const { key, robloxUser } = req.body || {};
  return respondWithValidationResult(res, key, robloxUser);
});

app.get("/api/keys/validate", (req, res) => {
  return respondWithValidationResult(res, req.query.key, req.query.robloxUser);
});

app.get("/api/admin/session", (req, res) => {
  const adminUser = getAdminUser(req);
  return res.json({
    ok: true,
    authenticated: Boolean(adminUser),
    username: adminUser,
    configured: config.adminUsers.length > 0,
  });
});

app.post("/api/admin/login", (req, res) => {
  if (!config.adminUsers.length) {
    return res.status(503).json({
      ok: false,
      error: "Admin panel is not configured yet. Add ADMIN_USERS in the environment.",
    });
  }

  const account = authenticateAdmin(req.body?.username, req.body?.password);
  if (!account) {
    return res.status(401).json({
      ok: false,
      error: "Invalid username or password.",
    });
  }

  const session = createSession(account.username);
  setAdminCookie(res, req, session);

  return res.json({
    ok: true,
    username: account.username,
  });
});

app.post("/api/admin/logout", (req, res) => {
  clearAdminCookie(res, req);
  return res.json({ ok: true });
});

app.get("/api/admin/scripts", requireAdminApi, (req, res) => {
  return res.json({
    ok: true,
    scripts: statements.listScriptsWithContent.all(),
  });
});

app.get("/api/scripts", (req, res) => {
  return res.json({
    ok: true,
    scripts: statements.listScripts.all(),
  });
});

app.post("/api/admin/scripts", requireAdminApi, (req, res) => {
  try {
    const script = sanitizeScriptInput(req.body || {});
    statements.upsertScript.run({
      ...script,
      uploaded_by: req.adminUser,
    });

    return res.json({
      ok: true,
      script: statements.findScriptBySlug.get(script.slug),
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.delete("/api/admin/scripts/:id", requireAdminApi, (req, res) => {
  statements.deleteScriptById.run(req.params.id);
  return res.json({ ok: true });
});

app.get("/api/scripts/:slug/raw", (req, res) => {
  const script = statements.findScriptBySlug.get(req.params.slug);
  if (!script) {
    return res.status(404).type("text/plain").send("Script not found.");
  }

  return res.type("text/plain; charset=utf-8").send(script.content);
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

app.get("/admin", (req, res) => {
  res.sendFile(path.join(config.rootDir, "public", "admin.html"));
});

app.get("/scripts", (req, res) => {
  res.sendFile(path.join(config.rootDir, "public", "scripts.html"));
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
