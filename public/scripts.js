const libraryGrid = document.getElementById("library-grid");
const librarySearch = document.getElementById("library-search");
const libraryEmpty = document.getElementById("library-empty");
const servicePill = document.getElementById("service-pill");
const scriptCount = document.getElementById("script-count");
const visibleCount = document.getElementById("visible-count");
const activeFilterLabel = document.getElementById("library-active-filter");
const heroTotalCount = document.getElementById("hero-total-count");
const heroWorkingCount = document.getElementById("hero-working-count");
const heroWatchCount = document.getElementById("hero-watch-count");
const filterButtons = [...document.querySelectorAll("[data-status-filter]")];
const toast = document.getElementById("toast");

let scripts = [];
let activeStatusFilter = "all";

const FILTER_LABELS = {
  all: "All statuses",
  stable: "Working",
  beta: "Beta",
  maintenance: "Maintenance",
  dormant: "Dormant",
};

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

  return scripts.filter((script) => {
    const matchesQuery = !query || [
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
      .includes(query);

    const tone = toneFromStatus(script.status_label);
    const matchesFilter = activeStatusFilter === "all" || tone === activeStatusFilter;
    return matchesQuery && matchesFilter;
  });
}

function countByTone(tone) {
  return scripts.filter((script) => toneFromStatus(script.status_label) === tone).length;
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

function renderMetrics(visibleScripts) {
  scriptCount.textContent = `${scripts.length} ${scripts.length === 1 ? "script" : "scripts"}`;
  visibleCount.textContent = `${visibleScripts.length} visible`;
  activeFilterLabel.textContent = FILTER_LABELS[activeStatusFilter] || "All statuses";
  heroTotalCount.textContent = String(scripts.length);
  heroWorkingCount.textContent = String(countByTone("stable"));
  heroWatchCount.textContent = String(countByTone("beta") + countByTone("maintenance"));
}

function renderFilterState() {
  filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.statusFilter === activeStatusFilter);
  });
}

function renderScripts() {
  const visibleScripts = filteredScripts();
  libraryGrid.innerHTML = "";
  renderMetrics(visibleScripts);
  renderFilterState();

  libraryEmpty.classList.toggle("hidden", visibleScripts.length > 0);
  if (!visibleScripts.length) {
    libraryEmpty.textContent = scripts.length
      ? "No scripts matched that search or status filter."
      : "No scripts have been published yet. Upload a library item from the admin dashboard first.";
  }

  visibleScripts.forEach((script, index) => {
    const card = createCard(script);
    libraryGrid.appendChild(card);
    window.LuminiaSite?.observeReveal(card, index * 70);
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

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeStatusFilter = button.dataset.statusFilter || "all";
    renderScripts();
  });
});

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
