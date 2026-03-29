const libraryGrid = document.getElementById("library-grid");
const librarySearch = document.getElementById("library-search");
const libraryEmpty = document.getElementById("library-empty");
const servicePill = document.getElementById("service-pill");
const scriptCount = document.getElementById("script-count");
const toast = document.getElementById("toast");

let scripts = [];

function setServiceStatus(mode, label) {
  servicePill.classList.remove("loading", "online", "offline");
  servicePill.classList.add(mode);
  servicePill.querySelector("span:last-child").textContent = label;
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

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 1800);
}

function filteredScripts() {
  const query = librarySearch.value.trim().toLowerCase();
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

function createCard(script) {
  const card = document.createElement("article");
  card.className = `library-card tone-${toneFromStatus(script.status_label)}`;

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
  body.className = "card-body";

  const top = document.createElement("div");
  top.className = "card-top";

  const placeChip = document.createElement("div");
  placeChip.className = "place-chip";
  placeChip.textContent = script.place_id ? `Place ID ${script.place_id}` : "Luminia Script";

  const status = document.createElement("div");
  status.className = "card-status";
  const dot = document.createElement("span");
  dot.className = "status-dot";
  const statusText = document.createElement("span");
  statusText.textContent = script.status_label || "Working";
  status.append(dot, statusText);

  const title = document.createElement("h3");
  title.textContent = script.title;

  const description = document.createElement("p");
  description.textContent = script.description || "No description provided.";

  const featureRow = document.createElement("div");
  featureRow.className = "feature-row";
  const features = parseFeatures(script.feature_list);
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

  top.append(placeChip, status, title, description, featureRow);

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const by = document.createElement("span");
  by.textContent = `By: ${script.uploaded_by}`;
  const slug = document.createElement("span");
  slug.textContent = `Slug: ${script.slug}`;
  meta.append(by, slug);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const getScriptButton = document.createElement("button");
  getScriptButton.type = "button";
  getScriptButton.dataset.copyLoader = script.slug;
  getScriptButton.textContent = "Get Script";

  const rawLink = document.createElement("a");
  rawLink.href = rawUrlFor(script.slug);
  rawLink.target = "_blank";
  rawLink.rel = "noreferrer";
  rawLink.textContent = "Raw";

  actions.append(getScriptButton, rawLink);
  footer.append(meta, actions);
  body.append(top, footer);
  card.appendChild(body);

  return card;
}

function renderScripts() {
  const visibleScripts = filteredScripts();
  libraryGrid.innerHTML = "";
  libraryEmpty.classList.toggle("hidden", visibleScripts.length > 0);
  scriptCount.textContent = `${scripts.length} ${scripts.length === 1 ? "script" : "scripts"}`;
  if (!visibleScripts.length) {
    libraryEmpty.textContent = scripts.length
      ? "No scripts matched that search."
      : "No scripts have been published yet. Upload a library item from the admin dashboard first.";
  }

  visibleScripts.forEach((script) => {
    libraryGrid.appendChild(createCard(script));
  });
}

async function loadScripts() {
  const response = await fetch("/api/scripts");
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Unable to load scripts.");
  }

  scripts = payload.scripts || [];
  renderScripts();
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error("Health check failed");
    }

    setServiceStatus("online", `ONLINE • ${new Date(payload.time).toLocaleTimeString()}`);
  } catch (error) {
    setServiceStatus("offline", "OFFLINE");
  }
}

librarySearch.addEventListener("input", renderScripts);

libraryGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-loader]");
  if (!button) {
    return;
  }

  try {
    await navigator.clipboard.writeText(loadstringFor(button.dataset.copyLoader));
    showToast("Loader copied to clipboard");
  } catch (error) {
    showToast("Copy failed");
  }
});

loadHealth();
loadScripts().catch((error) => {
  libraryGrid.innerHTML = "";
  libraryEmpty.classList.remove("hidden");
  libraryEmpty.textContent = error.message;
});
