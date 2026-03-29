const loginView = document.getElementById("admin-login-view");
const dashboardView = document.getElementById("admin-dashboard-view");
const loginForm = document.getElementById("admin-login-form");
const loginButton = document.getElementById("login-button");
const loginFeedback = document.getElementById("login-feedback");
const logoutButton = document.getElementById("logout-button");
const configWarning = document.getElementById("admin-config-warning");
const adminUserLabel = document.getElementById("admin-user-label");
const scriptCountLabel = document.getElementById("script-count-label");
const adminApiStatus = document.getElementById("admin-api-status");
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

let scripts = [];
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

  if (value.includes("offline") || value.includes("private") || value.includes("down")) {
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
      "Content-Type": "application/json",
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

async function refreshHealth() {
  try {
    const payload = await requestJson("/api/health", { headers: {} });
    adminApiStatus.textContent = `Live • ${new Date(payload.time).toLocaleTimeString()}`;
  } catch (error) {
    adminApiStatus.textContent = "Offline";
  }
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
  } else {
    const getScriptButton = document.createElement("button");
    getScriptButton.type = "button";
    getScriptButton.dataset.copyLoader = script.slug;
    getScriptButton.dataset.idleLabel = "Get Script";
    getScriptButton.textContent = "Get Script";

    const rawLink = document.createElement("a");
    rawLink.className = "ghost-button";
    rawLink.href = rawUrlFor(script.slug);
    rawLink.target = "_blank";
    rawLink.rel = "noreferrer";
    rawLink.textContent = "Raw";

    actions.append(getScriptButton, rawLink);
  }

  footer.append(meta, actions);
  body.append(top, footer);
  card.appendChild(body);

  return card;
}

function renderPreview() {
  scriptPreview.innerHTML = "";
  scriptPreview.appendChild(createScriptCard(currentDraft()));
}

function resetScriptForm(options = {}) {
  const { clearMessage = true } = options;
  scriptEditId.value = "";
  scriptForm.reset();
  slugEditedManually = false;
  scriptSaveButton.textContent = "Save Script";
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
  renderPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function filteredScripts() {
  const query = scriptSearch.value.trim().toLowerCase();
  if (!query) {
    return scripts;
  }

  return scripts.filter((script) =>
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

function renderScripts() {
  const visibleScripts = filteredScripts();
  scriptList.innerHTML = "";
  scriptCountLabel.textContent = String(scripts.length);
  scriptEmptyState.classList.toggle("hidden", visibleScripts.length > 0);
  if (!visibleScripts.length) {
    scriptEmptyState.textContent = scripts.length
      ? "No scripts match that search yet."
      : "No scripts uploaded yet. Save your first script to create a public library card.";
  }

  visibleScripts.forEach((script) => {
    scriptList.appendChild(createScriptCard(script, { admin: true }));
  });
}

async function loadScripts() {
  const payload = await requestJson("/api/admin/scripts", { headers: {} });
  scripts = payload.scripts || [];
  renderScripts();
}

async function bootstrap() {
  await refreshHealth();
  renderPreview();

  try {
    const payload = await requestJson("/api/admin/session", { headers: {} });
    if (payload.authenticated) {
      showDashboard(payload.username);
      await loadScripts();
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
    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";

    const payload = await requestJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(body),
    });

    showDashboard(payload.username);
    await loadScripts();
  } catch (error) {
    setFeedback(loginFeedback, error.message, "error");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Enter Dashboard";
  }
});

logoutButton.addEventListener("click", async () => {
  await requestJson("/api/admin/logout", {
    method: "POST",
  }).catch(() => {});
  showLogin(true);
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

  try {
    const wasEditing = Boolean(scriptEditId.value);
    scriptSaveButton.disabled = true;
    scriptSaveButton.textContent = scriptEditId.value ? "Updating..." : "Saving...";

    await requestJson("/api/admin/scripts", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    await loadScripts();
    resetScriptForm({ clearMessage: false });
    setFeedback(
      scriptFeedback,
      wasEditing ? "Library entry updated successfully." : "Library entry saved successfully.",
      "success",
    );
  } catch (error) {
    setFeedback(scriptFeedback, error.message, "error");
  } finally {
    scriptSaveButton.disabled = false;
    scriptSaveButton.textContent = scriptEditId.value ? "Update Script" : "Save Script";
  }
});

scriptList.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-script]");
  if (editButton) {
    const script = scripts.find((entry) => String(entry.id) === editButton.dataset.editScript);
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
    const script = scripts.find((entry) => String(entry.id) === deleteButton.dataset.deleteScript);
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
      await loadScripts();
      setFeedback(scriptFeedback, "Script deleted.", "success");
      if (String(scriptEditId.value) === String(script.id)) {
        resetScriptForm();
      }
    } catch (error) {
      setFeedback(scriptFeedback, error.message, "error");
    }
  }
});

bootstrap();
