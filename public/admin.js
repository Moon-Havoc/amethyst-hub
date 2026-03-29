const loginView = document.getElementById("admin-login-view");
const dashboardView = document.getElementById("admin-dashboard-view");
const loginForm = document.getElementById("admin-login-form");
const loginButton = document.getElementById("login-button");
const loginFeedback = document.getElementById("login-feedback");
const logoutButton = document.getElementById("logout-button");
const configWarning = document.getElementById("admin-config-warning");
const adminUserLabel = document.getElementById("admin-user-label");
const scriptCountLabel = document.getElementById("script-count-label");
const activeKeyLabel = document.getElementById("active-key-label");
const premiumKeyLabel = document.getElementById("premium-key-label");
const totalUserLabel = document.getElementById("total-user-label");
const blacklistedUserLabel = document.getElementById("blacklisted-user-label");
const activeModerationLabel = document.getElementById("active-moderation-label");
const auditCountLabel = document.getElementById("audit-count-label");
const adminApiStatus = document.getElementById("admin-api-status");
const dashboardRefreshButton = document.getElementById("dashboard-refresh-button");

const issueKeyForm = document.getElementById("issue-key-form");
const issueDiscordId = document.getElementById("issue-discord-id");
const issueDiscordTag = document.getElementById("issue-discord-tag");
const issueRobloxUser = document.getElementById("issue-roblox-user");
const issueKeyType = document.getElementById("issue-key-type");
const issueKeyButton = document.getElementById("issue-key-button");
const issueKeyFeedback = document.getElementById("issue-key-feedback");

const userActionForm = document.getElementById("user-action-form");
const userDiscordId = document.getElementById("user-discord-id");
const userDiscordTag = document.getElementById("user-discord-tag");
const userRobloxUser = document.getElementById("user-roblox-user");
const userBlacklistReason = document.getElementById("user-blacklist-reason");
const blacklistUserButton = document.getElementById("blacklist-user-button");
const unblacklistUserButton = document.getElementById("unblacklist-user-button");
const resetHwidButton = document.getElementById("reset-hwid-button");
const userActionFeedback = document.getElementById("user-action-feedback");

const revokeKeyForm = document.getElementById("revoke-key-form");
const revokeKeyInput = document.getElementById("revoke-key-input");
const revokeReasonInput = document.getElementById("revoke-reason-input");
const revokeKeyButton = document.getElementById("revoke-key-button");
const revokeKeyFeedback = document.getElementById("revoke-key-feedback");

const discordActionForm = document.getElementById("discord-action-form");
const discordActionSelect = document.getElementById("discord-action-select");
const discordActionTarget = document.getElementById("discord-action-target");
const discordActionDuration = document.getElementById("discord-action-duration");
const discordActionRole = document.getElementById("discord-action-role");
const discordActionReason = document.getElementById("discord-action-reason");
const discordActionButton = document.getElementById("discord-action-button");
const discordActionFeedback = document.getElementById("discord-action-feedback");

const scriptForm = document.getElementById("script-form");
const scriptEditId = document.getElementById("script-edit-id");
const scriptTitle = document.getElementById("script-title");
const scriptSlug = document.getElementById("script-slug");
const scriptPlaceId = document.getElementById("script-place-id");
const scriptStatusLabel = document.getElementById("script-status-label");
const scriptCoverImage = document.getElementById("script-cover-image");
const scriptFeatureList = document.getElementById("script-feature-list");
const scriptDescription = document.getElementById("script-description");
const scriptFile = document.getElementById("script-file");
const scriptContent = document.getElementById("script-content");
const scriptSaveButton = document.getElementById("script-save-button");
const scriptResetButton = document.getElementById("script-reset-button");
const scriptFeedback = document.getElementById("script-feedback");
const scriptList = document.getElementById("script-list");
const scriptEmptyState = document.getElementById("script-empty-state");
const scriptPreview = document.getElementById("script-preview");
const scriptSearch = document.getElementById("script-search");

const keySearch = document.getElementById("key-search");
const userSearch = document.getElementById("user-search");
const auditSearch = document.getElementById("audit-search");
const keyList = document.getElementById("key-list");
const userList = document.getElementById("user-list");
const auditList = document.getElementById("audit-list");
const moderationList = document.getElementById("moderation-list");

const state = {
  overview: {},
  scripts: [],
  keys: [],
  users: [],
  auditLogs: [],
  moderationActions: [],
};

let slugEditedManually = false;

function setFeedback(node, message, type) {
  node.textContent = message;
  node.classList.remove("hidden", "error", "success");
  if (type) {
    node.classList.add(type);
  }
}

function clearFeedback(node) {
  node.textContent = "";
  node.classList.add("hidden");
  node.classList.remove("error", "success");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseFeatures(value) {
  return String(value || "")
    .split(/[\n,|]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function rawUrlFor(slug) {
  return `${window.location.origin}/api/scripts/${slug}/raw`;
}

function loadstringFor(slug) {
  return `loadstring(game:HttpGet("${rawUrlFor(slug)}"))()`;
}

function toneFromStatus(label) {
  const value = String(label || "").toLowerCase();
  if (value.includes("beta") || value.includes("testing")) {
    return "beta";
  }

  if (value.includes("maintenance") || value.includes("update")) {
    return "maintenance";
  }

  if (value.includes("offline") || value.includes("private") || value.includes("down") || value.includes("revoked")) {
    return "dormant";
  }

  return "stable";
}

function showLogin(configured) {
  loginView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  logoutButton.classList.add("hidden");

  if (!configured) {
    configWarning.classList.remove("hidden");
    configWarning.textContent =
      "Admin access is not configured yet. Add ADMIN_USERS and ADMIN_SESSION_SECRET in your environment.";
  } else {
    configWarning.classList.add("hidden");
    configWarning.textContent = "";
  }
}

function showDashboard(username) {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  logoutButton.classList.remove("hidden");
  adminUserLabel.textContent = username;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({
    ok: false,
    error: "Invalid server response.",
  }));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function copyText(value, successLabel, fallbackNode) {
  try {
    await navigator.clipboard.writeText(value);
    if (fallbackNode) {
      fallbackNode.textContent = successLabel;
      window.setTimeout(() => {
        fallbackNode.textContent = fallbackNode.dataset.idleLabel || "Copy";
      }, 1400);
    }
  } catch (error) {
    if (fallbackNode) {
      fallbackNode.textContent = "Copy failed";
    }
  }
}

function setBusy(button, busy, busyLabel) {
  if (!button) {
    return;
  }

  if (!button.dataset.idleLabel) {
    button.dataset.idleLabel = button.textContent;
  }

  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.idleLabel;
}

function formatTimestamp(value) {
  if (!value || value === "never") {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function keyIsActive(record) {
  if (!record || record.status !== "active") {
    return false;
  }

  if (record.expires_at === "never") {
    return true;
  }

  return Date.parse(record.expires_at) > Date.now();
}

function currentDraft() {
  return {
    id: scriptEditId.value,
    title: scriptTitle.value.trim() || "Untitled Script",
    slug: scriptSlug.value.trim() || "untitled-script",
    place_id: scriptPlaceId.value.trim(),
    status_label: scriptStatusLabel.value.trim() || "Working",
    cover_image: scriptCoverImage.value.trim(),
    feature_list: scriptFeatureList.value.trim(),
    description: scriptDescription.value.trim() || "Short library description will appear here.",
    uploaded_by: adminUserLabel.textContent || "admin",
    updated_at: new Date().toISOString(),
  };
}

function createScriptCard(script, options = {}) {
  const features = parseFeatures(script.feature_list);
  const tone = toneFromStatus(script.status_label);

  const card = document.createElement("article");
  card.className = `library-card tone-${tone}`;

  if (script.cover_image) {
    const image = document.createElement("img");
    image.src = script.cover_image;
    image.alt = `${script.title} cover art`;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.remove();
    });
    card.appendChild(image);
  }

  const body = document.createElement("div");
  body.className = "library-card-body";

  const top = document.createElement("div");
  top.className = "library-card-top";

  const placeChip = document.createElement("div");
  placeChip.className = "place-chip";
  placeChip.textContent = script.place_id ? `PLACE ID ${script.place_id}` : "LUMINIA SCRIPT";

  const statusRow = document.createElement("div");
  statusRow.className = "card-status-row";

  const status = document.createElement("div");
  status.className = "card-status";

  const dot = document.createElement("span");
  dot.className = "status-dot";

  const statusText = document.createElement("span");
  statusText.textContent = script.status_label || "Working";
  status.append(dot, statusText);
  statusRow.appendChild(status);

  const title = document.createElement("h3");
  title.textContent = script.title;

  const description = document.createElement("p");
  description.textContent = script.description || "No description provided.";

  const featureRow = document.createElement("div");
  featureRow.className = "feature-row";
  if (features.length) {
    features.forEach((feature) => {
      const pill = document.createElement("span");
      pill.className = "feature-pill";
      pill.textContent = feature;
      featureRow.appendChild(pill);
    });
  } else {
    const pill = document.createElement("span");
    pill.className = "feature-pill";
    pill.textContent = "No tags yet";
    featureRow.appendChild(pill);
  }

  top.append(placeChip, statusRow, title, description, featureRow);

  const footer = document.createElement("div");
  const meta = document.createElement("div");
  meta.className = "library-meta";

  const slugMeta = document.createElement("span");
  slugMeta.textContent = `Slug: ${script.slug}`;
  const uploaderMeta = document.createElement("span");
  uploaderMeta.textContent = `By: ${script.uploaded_by}`;

  meta.append(slugMeta, uploaderMeta);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  if (options.admin) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.dataset.editScript = script.id;
    editButton.textContent = "Edit";

    const copyLoaderButton = document.createElement("button");
    copyLoaderButton.type = "button";
    copyLoaderButton.className = "ghost-button";
    copyLoaderButton.dataset.copyLoader = script.slug;
    copyLoaderButton.dataset.idleLabel = "Copy Loader";
    copyLoaderButton.textContent = "Copy Loader";

    const copyRawButton = document.createElement("button");
    copyRawButton.type = "button";
    copyRawButton.className = "ghost-button";
    copyRawButton.dataset.copyScript = script.slug;
    copyRawButton.dataset.idleLabel = "Copy Raw";
    copyRawButton.textContent = "Copy Raw";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ghost-button";
    deleteButton.dataset.deleteScript = script.id;
    deleteButton.textContent = "Delete";

    actions.append(editButton, copyLoaderButton, copyRawButton, deleteButton);
  }

  footer.append(meta, actions);
  body.append(top, footer);
  card.appendChild(body);

  return card;
}

function createPill(text, tone = "stable") {
  const pill = document.createElement("span");
  pill.className = `data-pill tone-${tone}`;
  pill.textContent = text;
  return pill;
}

function createActionButton(label, dataset, tone = "ghost") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = tone === "ghost" ? "ghost-button small-button" : "small-button";
  Object.entries(dataset).forEach(([key, value]) => {
    button.dataset[key] = value;
  });
  return button;
}

function createMetaText(items) {
  return items.filter(Boolean).join(" • ");
}

function formatDiscordActionResult(result) {
  switch (result.action) {
    case "ban":
      return `Banned ${result.targetTag}.`;
    case "kick":
      return `Kicked ${result.targetTag}.`;
    case "mute":
      return `Muted ${result.targetTag} for ${result.duration}.`;
    case "unmute":
      return `Removed timeout for ${result.targetTag}.`;
    case "role":
      return `Added ${result.roleName} to ${result.targetTag}.`;
    case "unban":
      return `Unbanned ${result.targetTag}.`;
    default:
      return "Discord action completed.";
  }
}

function updateDiscordActionFieldHints() {
  const action = discordActionSelect.value;
  const needsDuration = action === "mute";
  const needsRole = action === "role";

  discordActionDuration.disabled = !needsDuration;
  discordActionDuration.placeholder = needsDuration ? "10m" : "Only used for mute";
  if (!needsDuration) {
    discordActionDuration.value = "";
  }

  discordActionRole.disabled = !needsRole;
  discordActionRole.placeholder = needsRole ? "Premium" : "Only used for Add Role";
  if (!needsRole) {
    discordActionRole.value = "";
  }
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function createDataCard({ title, summary, meta, pills = [], actions = [] }) {
  const card = document.createElement("article");
  card.className = "data-card";

  const top = document.createElement("div");
  top.className = "data-card-top";

  const titleNode = document.createElement("h3");
  titleNode.className = "data-card-title";
  titleNode.textContent = title;

  const summaryNode = document.createElement("p");
  summaryNode.className = "data-card-summary";
  summaryNode.textContent = summary;

  const metaNode = document.createElement("div");
  metaNode.className = "data-card-meta";
  metaNode.textContent = meta;

  const pillRow = document.createElement("div");
  pillRow.className = "data-pill-row";
  pills.forEach((pill) => {
    pillRow.appendChild(pill);
  });

  top.append(titleNode, summaryNode, metaNode);
  if (pills.length) {
    top.appendChild(pillRow);
  }

  card.appendChild(top);

  if (actions.length) {
    const footer = document.createElement("div");
    footer.className = "data-card-actions";
    actions.forEach((action) => footer.appendChild(action));
    card.appendChild(footer);
  }

  return card;
}

function renderPreview() {
  scriptPreview.innerHTML = "";
  const previewCard = createScriptCard(currentDraft());
  previewCard.classList.add("is-visible");
  scriptPreview.appendChild(previewCard);
}

function resetScriptForm(options = {}) {
  const { clearMessage = true } = options;
  scriptEditId.value = "";
  scriptForm.reset();
  slugEditedManually = false;
  scriptSaveButton.textContent = "Save Script";
  scriptSaveButton.dataset.idleLabel = "Save Script";
  if (clearMessage) {
    clearFeedback(scriptFeedback);
  }
  renderPreview();
}

function loadScriptIntoForm(script) {
  scriptEditId.value = script.id;
  scriptTitle.value = script.title;
  scriptSlug.value = script.slug;
  scriptPlaceId.value = script.place_id || "";
  scriptStatusLabel.value = script.status_label || "Working";
  scriptCoverImage.value = script.cover_image || "";
  scriptFeatureList.value = script.feature_list || "";
  scriptDescription.value = script.description || "";
  scriptContent.value = script.content;
  slugEditedManually = true;
  scriptSaveButton.textContent = "Update Script";
  scriptSaveButton.dataset.idleLabel = "Update Script";
  renderPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function applyDashboard(payload) {
  state.overview = payload.overview || {};
  state.scripts = payload.scripts || [];
  state.keys = payload.keys || [];
  state.users = payload.users || [];
  state.auditLogs = payload.auditLogs || [];
  state.moderationActions = payload.moderationActions || [];
  renderDashboard();
}

function renderMetrics() {
  const overview = state.overview || {};
  scriptCountLabel.textContent = String(overview.totalScripts ?? state.scripts.length);
  activeKeyLabel.textContent = String(overview.activeKeys ?? state.keys.filter(keyIsActive).length);
  premiumKeyLabel.textContent = String(
    overview.premiumKeys ?? state.keys.filter((record) => record.type === "premium").length,
  );
  totalUserLabel.textContent = String(overview.totalUsers ?? state.users.length);
  blacklistedUserLabel.textContent = String(
    overview.blacklistedUsers ?? state.users.filter((record) => record.blacklisted).length,
  );
  activeModerationLabel.textContent = String(
    overview.activeModeration ?? state.moderationActions.filter((record) => record.active).length,
  );
  auditCountLabel.textContent = String(overview.recentAuditEvents ?? state.auditLogs.length);
}

function filteredScripts() {
  const query = scriptSearch.value.trim().toLowerCase();
  if (!query) {
    return state.scripts;
  }

  return state.scripts.filter((script) =>
    [
      script.title,
      script.slug,
      script.description,
      script.place_id,
      script.status_label,
      script.feature_list,
      script.uploaded_by,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

function filteredKeys() {
  const query = keySearch.value.trim().toLowerCase();
  if (!query) {
    return state.keys;
  }

  return state.keys.filter((record) =>
    [
      record.key,
      record.roblox_user,
      record.discord_user_id,
      record.discord_tag,
      record.type,
      record.status,
      record.revoked_reason,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

function filteredUsers() {
  const query = userSearch.value.trim().toLowerCase();
  if (!query) {
    return state.users;
  }

  return state.users.filter((record) =>
    [
      record.discord_user_id,
      record.discord_tag,
      record.roblox_user,
      record.blacklist_reason,
      record.active_hwid ? "hwid" : "",
      record.blacklisted ? "blacklisted" : "clear",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

function filteredAuditLogs() {
  const query = auditSearch.value.trim().toLowerCase();
  if (!query) {
    return state.auditLogs;
  }

  return state.auditLogs.filter((record) =>
    [record.actor_id, record.actor_tag, record.action, record.target, record.details]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

function userKeyStats(discordUserId) {
  const keys = state.keys.filter((record) => record.discord_user_id === discordUserId);
  return {
    total: keys.length,
    active: keys.filter(keyIsActive).length,
    premium: keys.filter((record) => record.type === "premium").length,
  };
}

function renderScripts() {
  const visibleScripts = filteredScripts();
  scriptList.innerHTML = "";
  scriptEmptyState.classList.toggle("hidden", visibleScripts.length > 0);
  if (!visibleScripts.length) {
    scriptEmptyState.textContent = state.scripts.length
      ? "No scripts match that search yet."
      : "No scripts uploaded yet. Save your first script to create a public library card.";
  }

  visibleScripts.forEach((script, index) => {
    const card = createScriptCard(script, { admin: true });
    scriptList.appendChild(card);
    window.LuminiaSite?.observeReveal(card, index * 50);
  });
}

function renderKeys() {
  const visibleKeys = filteredKeys();
  keyList.innerHTML = "";

  if (!visibleKeys.length) {
    keyList.appendChild(createEmptyState("No keys match the current search."));
    return;
  }

  visibleKeys.forEach((record, index) => {
    const pills = [
      createPill(record.type === "premium" ? "Premium" : "Normal", record.type === "premium" ? "beta" : "stable"),
      createPill(record.status, toneFromStatus(record.status)),
      createPill(keyIsActive(record) ? "Live" : "Inactive", keyIsActive(record) ? "stable" : "dormant"),
    ];

    const actions = [
      createActionButton("Copy Key", { copyKey: record.key }),
      createActionButton("Revoke", { fillRevoke: record.key }, "primary"),
    ];

    const card = createDataCard({
      title: record.roblox_user || record.key,
      summary: record.key,
      meta: createMetaText([
        record.discord_tag || record.discord_user_id || "No Discord tag",
        `Created ${formatTimestamp(record.created_at)}`,
        `Expires ${formatTimestamp(record.expires_at)}`,
      ]),
      pills,
      actions,
    });

    keyList.appendChild(card);
    window.LuminiaSite?.observeReveal(card, index * 30);
  });
}

function renderUsers() {
  const visibleUsers = filteredUsers();
  userList.innerHTML = "";

  if (!visibleUsers.length) {
    userList.appendChild(createEmptyState("No users match the current search."));
    return;
  }

  visibleUsers.forEach((record, index) => {
    const stats = userKeyStats(record.discord_user_id);
    const pills = [
      createPill(record.blacklisted ? "Blacklisted" : "Clear", record.blacklisted ? "dormant" : "stable"),
      createPill(record.active_hwid ? "HWID set" : "No HWID", record.active_hwid ? "beta" : "stable"),
      createPill(`${stats.active} active keys`, stats.active ? "stable" : "maintenance"),
    ];

    const actions = [
      createActionButton("Use In Forms", { fillUser: record.id }),
      createActionButton("Copy ID", { copyDiscordId: record.discord_user_id || "" }),
    ];

    const card = createDataCard({
      title: record.roblox_user || record.discord_tag || record.discord_user_id || "Unlinked user",
      summary: createMetaText([
        record.discord_tag || "No tag",
        record.discord_user_id || "No Discord ID",
      ]),
      meta: createMetaText([
        record.blacklist_reason || "No blacklist reason",
        `${stats.total} total keys`,
        `Updated ${formatTimestamp(record.updated_at)}`,
      ]),
      pills,
      actions,
    });

    userList.appendChild(card);
    window.LuminiaSite?.observeReveal(card, index * 30);
  });
}

function renderAuditLogs() {
  const visibleLogs = filteredAuditLogs();
  auditList.innerHTML = "";

  if (!visibleLogs.length) {
    auditList.appendChild(createEmptyState("No audit events match the current search."));
    return;
  }

  visibleLogs.forEach((record, index) => {
    const pills = [
      createPill(record.action || "action", toneFromStatus(record.action)),
    ];

    const card = createDataCard({
      title: record.action || "Unknown event",
      summary: record.details || "No extra details recorded.",
      meta: createMetaText([
        record.actor_tag || record.actor_id || "Unknown actor",
        record.target ? `Target ${record.target}` : null,
        formatTimestamp(record.created_at),
      ]),
      pills,
    });

    auditList.appendChild(card);
    window.LuminiaSite?.observeReveal(card, index * 25);
  });
}

function renderModeration() {
  moderationList.innerHTML = "";

  if (!state.moderationActions.length) {
    moderationList.appendChild(createEmptyState("No moderation actions have been stored yet."));
    return;
  }

  state.moderationActions.forEach((record, index) => {
    const pills = [
      createPill(record.active ? "Active" : "Closed", record.active ? "stable" : "dormant"),
      createPill(record.action_type || "action", toneFromStatus(record.action_type)),
    ];

    const card = createDataCard({
      title: record.discord_tag || record.discord_user_id || "Unknown user",
      summary: record.reason || "No moderation reason stored.",
      meta: createMetaText([
        record.role_name || null,
        record.duration_minutes ? `${record.duration_minutes} minutes` : null,
        `Created ${formatTimestamp(record.created_at)}`,
      ]),
      pills,
    });

    moderationList.appendChild(card);
    window.LuminiaSite?.observeReveal(card, index * 25);
  });
}

function renderDashboard() {
  renderMetrics();
  renderScripts();
  renderKeys();
  renderUsers();
  renderAuditLogs();
  renderModeration();
}

async function refreshHealth() {
  try {
    const payload = await requestJson("/api/health");
    adminApiStatus.textContent = `Live • ${new Date(payload.time).toLocaleTimeString()}`;
  } catch (error) {
    adminApiStatus.textContent = "Offline";
  }
}

async function loadDashboard() {
  const payload = await requestJson("/api/admin/dashboard");
  applyDashboard(payload);
}

function prefillUserForms(userId) {
  const record = state.users.find((entry) => String(entry.id) === String(userId));
  if (!record) {
    return;
  }

  issueDiscordId.value = record.discord_user_id || "";
  issueDiscordTag.value = record.discord_tag || "";
  issueRobloxUser.value = record.roblox_user || "";

  userDiscordId.value = record.discord_user_id || "";
  userDiscordTag.value = record.discord_tag || "";
  userRobloxUser.value = record.roblox_user || "";
  userBlacklistReason.value = record.blacklist_reason || "";
  discordActionTarget.value = record.discord_user_id || record.discord_tag || "";
}

async function runUserAction(action) {
  clearFeedback(userActionFeedback);

  const body = {
    discordUserId: userDiscordId.value.trim(),
    discordTag: userDiscordTag.value.trim(),
    robloxUser: userRobloxUser.value.trim(),
    reason: userBlacklistReason.value.trim(),
  };

  const endpointByAction = {
    blacklist: "/api/admin/users/blacklist",
    unblacklist: "/api/admin/users/unblacklist",
    reset: "/api/admin/users/reset-hwid",
  };

  const buttonByAction = {
    blacklist: blacklistUserButton,
    unblacklist: unblacklistUserButton,
    reset: resetHwidButton,
  };

  const busyLabelByAction = {
    blacklist: "Blacklisting...",
    unblacklist: "Restoring...",
    reset: "Resetting...",
  };

  const successLabelByAction = {
    blacklist: "User blacklisted successfully.",
    unblacklist: "User removed from blacklist.",
    reset: "HWID reset successfully.",
  };

  try {
    setBusy(buttonByAction[action], true, busyLabelByAction[action]);

    const payload = await requestJson(endpointByAction[action], {
      method: "POST",
      body: JSON.stringify(body),
    });

    applyDashboard(payload.dashboard);
    setFeedback(userActionFeedback, successLabelByAction[action], "success");
  } catch (error) {
    setFeedback(userActionFeedback, error.message, "error");
  } finally {
    setBusy(buttonByAction[action], false, buttonByAction[action].dataset.idleLabel);
  }
}

async function bootstrap() {
  await refreshHealth();
  renderPreview();

  try {
    const payload = await requestJson("/api/admin/session");
    if (payload.authenticated) {
      showDashboard(payload.username);
      await loadDashboard();
      return;
    }

    showLogin(payload.configured);
  } catch (error) {
    showLogin(false);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFeedback(loginFeedback);

  const body = {
    username: document.getElementById("login-username").value,
    password: document.getElementById("login-password").value,
  };

  try {
    setBusy(loginButton, true, "Signing in...");

    const payload = await requestJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(body),
    });

    showDashboard(payload.username);
    await loadDashboard();
  } catch (error) {
    setFeedback(loginFeedback, error.message, "error");
  } finally {
    setBusy(loginButton, false, loginButton.dataset.idleLabel);
  }
});

logoutButton.addEventListener("click", async () => {
  await requestJson("/api/admin/logout", {
    method: "POST",
  }).catch(() => {});
  showLogin(true);
});

dashboardRefreshButton?.addEventListener("click", async () => {
  try {
    setBusy(dashboardRefreshButton, true, "Refreshing...");
    await Promise.all([refreshHealth(), loadDashboard()]);
  } finally {
    setBusy(dashboardRefreshButton, false, dashboardRefreshButton.dataset.idleLabel);
  }
});

issueKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFeedback(issueKeyFeedback);

  const body = {
    discordUserId: issueDiscordId.value.trim(),
    discordTag: issueDiscordTag.value.trim(),
    robloxUser: issueRobloxUser.value.trim(),
    type: issueKeyType.value,
  };

  try {
    setBusy(issueKeyButton, true, "Issuing...");

    const payload = await requestJson("/api/admin/keys/issue", {
      method: "POST",
      body: JSON.stringify(body),
    });

    applyDashboard(payload.dashboard);
    setFeedback(
      issueKeyFeedback,
      payload.created
        ? `Key created for ${payload.record.roblox_user}: ${payload.record.key}`
        : `Existing active key reused for ${payload.record.roblox_user}: ${payload.record.key}`,
      "success",
    );
  } catch (error) {
    setFeedback(issueKeyFeedback, error.message, "error");
  } finally {
    setBusy(issueKeyButton, false, issueKeyButton.dataset.idleLabel);
  }
});

blacklistUserButton.addEventListener("click", () => runUserAction("blacklist"));
unblacklistUserButton.addEventListener("click", () => runUserAction("unblacklist"));
resetHwidButton.addEventListener("click", () => runUserAction("reset"));

revokeKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFeedback(revokeKeyFeedback);

  try {
    setBusy(revokeKeyButton, true, "Revoking...");

    const payload = await requestJson("/api/admin/keys/revoke", {
      method: "POST",
      body: JSON.stringify({
        key: revokeKeyInput.value.trim(),
        reason: revokeReasonInput.value.trim(),
      }),
    });

    applyDashboard(payload.dashboard);
    setFeedback(revokeKeyFeedback, `Key ${payload.record.key} revoked successfully.`, "success");
  } catch (error) {
    setFeedback(revokeKeyFeedback, error.message, "error");
  } finally {
    setBusy(revokeKeyButton, false, revokeKeyButton.dataset.idleLabel);
  }
});

discordActionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFeedback(discordActionFeedback);

  const body = {
    action: discordActionSelect.value,
    target: discordActionTarget.value.trim(),
    duration: discordActionDuration.value.trim(),
    roleQuery: discordActionRole.value.trim(),
    reason: discordActionReason.value.trim(),
  };

  try {
    setBusy(discordActionButton, true, "Running...");

    const payload = await requestJson("/api/admin/discord/action", {
      method: "POST",
      body: JSON.stringify(body),
    });

    applyDashboard(payload.dashboard);
    setFeedback(discordActionFeedback, formatDiscordActionResult(payload.result), "success");
  } catch (error) {
    setFeedback(discordActionFeedback, error.message, "error");
  } finally {
    setBusy(discordActionButton, false, discordActionButton.dataset.idleLabel);
  }
});

scriptTitle.addEventListener("input", () => {
  if (!slugEditedManually) {
    scriptSlug.value = slugify(scriptTitle.value);
  }
  renderPreview();
});

scriptSlug.addEventListener("input", () => {
  slugEditedManually = true;
  renderPreview();
});

[scriptPlaceId, scriptStatusLabel, scriptCoverImage, scriptFeatureList, scriptDescription, scriptContent].forEach(
  (field) => {
    field.addEventListener("input", renderPreview);
  },
);

scriptFile.addEventListener("change", async () => {
  const [file] = scriptFile.files || [];
  if (!file) {
    return;
  }

  const text = await file.text();
  scriptContent.value = text;

  if (!scriptTitle.value) {
    scriptTitle.value = file.name.replace(/\.[^/.]+$/, "");
  }

  if (!slugEditedManually) {
    scriptSlug.value = slugify(scriptTitle.value || file.name);
  }

  renderPreview();
});

scriptSearch.addEventListener("input", renderScripts);
keySearch.addEventListener("input", renderKeys);
userSearch.addEventListener("input", renderUsers);
auditSearch.addEventListener("input", renderAuditLogs);
discordActionSelect.addEventListener("change", updateDiscordActionFieldHints);

scriptResetButton.addEventListener("click", () => {
  resetScriptForm();
});

scriptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFeedback(scriptFeedback);

  const payload = {
    title: scriptTitle.value,
    slug: scriptSlug.value,
    placeId: scriptPlaceId.value,
    statusLabel: scriptStatusLabel.value,
    coverImage: scriptCoverImage.value,
    featureList: scriptFeatureList.value,
    description: scriptDescription.value,
    content: scriptContent.value,
  };

  const wasEditing = Boolean(scriptEditId.value);

  try {
    setBusy(scriptSaveButton, true, wasEditing ? "Updating..." : "Saving...");

    await requestJson("/api/admin/scripts", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    await loadDashboard();
    resetScriptForm({ clearMessage: false });
    setFeedback(
      scriptFeedback,
      wasEditing ? "Library entry updated successfully." : "Library entry saved successfully.",
      "success",
    );
  } catch (error) {
    setFeedback(scriptFeedback, error.message, "error");
  } finally {
    setBusy(scriptSaveButton, false, scriptSaveButton.dataset.idleLabel);
  }
});

scriptList.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-script]");
  if (editButton) {
    const script = state.scripts.find((entry) => String(entry.id) === editButton.dataset.editScript);
    if (script) {
      loadScriptIntoForm(script);
    }
    return;
  }

  const copyRawButton = event.target.closest("[data-copy-script]");
  if (copyRawButton) {
    await copyText(rawUrlFor(copyRawButton.dataset.copyScript), "Copied raw", copyRawButton);
    return;
  }

  const copyLoaderButton = event.target.closest("[data-copy-loader]");
  if (copyLoaderButton) {
    await copyText(loadstringFor(copyLoaderButton.dataset.copyLoader), "Copied loader", copyLoaderButton);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-script]");
  if (deleteButton) {
    const script = state.scripts.find((entry) => String(entry.id) === deleteButton.dataset.deleteScript);
    if (!script) {
      return;
    }

    const confirmed = window.confirm(`Delete ${script.title}?`);
    if (!confirmed) {
      return;
    }

    try {
      await requestJson(`/api/admin/scripts/${script.id}`, {
        method: "DELETE",
      });
      await loadDashboard();
      setFeedback(scriptFeedback, "Script deleted.", "success");
      if (String(scriptEditId.value) === String(script.id)) {
        resetScriptForm();
      }
    } catch (error) {
      setFeedback(scriptFeedback, error.message, "error");
    }
  }
});

keyList.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy-key]");
  if (copyButton) {
    await copyText(copyButton.dataset.copyKey, "Copied key", copyButton);
    return;
  }

  const revokeButton = event.target.closest("[data-fill-revoke]");
  if (revokeButton) {
    revokeKeyInput.value = revokeButton.dataset.fillRevoke;
    revokeReasonInput.focus();
  }
});

userList.addEventListener("click", async (event) => {
  const fillButton = event.target.closest("[data-fill-user]");
  if (fillButton) {
    prefillUserForms(fillButton.dataset.fillUser);
    return;
  }

  const copyIdButton = event.target.closest("[data-copy-discord-id]");
  if (copyIdButton && copyIdButton.dataset.copyDiscordId) {
    await copyText(copyIdButton.dataset.copyDiscordId, "Copied ID", copyIdButton);
  }
});

bootstrap();
updateDiscordActionFieldHints();
