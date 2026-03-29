const form = document.getElementById("key-form");
const result = document.getElementById("result");

function humanExpiry(value) {
  return value === "never" ? "Never" : new Date(value).toLocaleString();
}

function renderResult(payload, error = false) {
  result.classList.remove("hidden");
  result.classList.toggle("error", error);

  if (error) {
    result.innerHTML = `
      <p class="result-label">Something needs attention</p>
      <strong>${payload}</strong>
    `;
    return;
  }

  const statusLabel = payload.created ? "Fresh key generated" : "Existing active key found";
  result.innerHTML = `
    <p class="result-label">${statusLabel}</p>
    <div class="key-value">${payload.key}</div>
    <p>Type: <strong>${payload.type}</strong></p>
    <p>Status: <strong>${payload.status}</strong></p>
    <p>Expires: <strong>${humanExpiry(payload.expiresAt)}</strong></p>
  `;
}

const query = new URLSearchParams(window.location.search);
const robloxUserField = document.getElementById("robloxUser");
const prefilledRobloxUser = query.get("robloxUser");
if (prefilledRobloxUser && robloxUserField) {
  robloxUserField.value = prefilledRobloxUser;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch("/api/keys/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Unable to generate key.");
    }

    renderResult(data);
  } catch (error) {
    renderResult(error.message, true);
  }
});
