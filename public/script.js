const form = document.getElementById("searchForm");
const urlInput = document.getElementById("url");
const findBtn = document.getElementById("findBtn");
const errorBox = document.getElementById("error");
const result = document.getElementById("result");
const tracksBox = document.getElementById("tracks");
const languageSearch = document.getElementById("languageSearch");
const downloadPanel = document.getElementById("downloadPanel");
const selectedLanguage = document.getElementById("selectedLanguage");
const downloadBtn = document.getElementById("downloadBtn");
const format = document.getElementById("format");

let currentUrl = "";
let allTracks = [];
let selectedTrack = null;

function showError(message) {
  errorBox.textContent = message || "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function renderTracks() {
  const q = languageSearch.value.trim().toLowerCase();

  const filtered = allTracks.filter(t =>
    t.lang.toLowerCase().includes(q) ||
    String(t.name).toLowerCase().includes(q)
  );

  tracksBox.innerHTML = "";

  if (!filtered.length) {
    tracksBox.innerHTML = '<p class="muted">Тохирох хадмал олдсонгүй.</p>';
    return;
  }

  filtered.forEach(track => {
    const button = document.createElement("button");
    button.className = "track" + (selectedTrack?.lang === track.lang ? " selected" : "");
    button.innerHTML = `
      <span>${escapeHtml(track.name)}</span>
      <span class="badge">${track.type === "auto" ? "Auto" : "Original"}</span>
      <span class="code">${escapeHtml(track.lang)}</span>
    `;

    button.onclick = () => {
      selectedTrack = track;
      selectedLanguage.textContent = `${track.name} (${track.lang})`;
      downloadPanel.classList.remove("hidden");
      renderTracks();
    };

    tracksBox.appendChild(button);
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();

  showError("");
  result.classList.add("hidden");
  downloadPanel.classList.add("hidden");
  selectedTrack = null;

  findBtn.disabled = true;
  findBtn.textContent = "Уншиж байна...";

  try {
    const response = await fetch("/api/subtitles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Алдаа гарлаа.");

    currentUrl = url;
    allTracks = data.tracks || [];

    document.getElementById("title").textContent = data.title;
    document.getElementById("thumb").src = data.thumbnail || "";
    document.getElementById("duration").textContent =
      data.duration ? `${Math.floor(data.duration / 60)} мин` : "";

    result.classList.remove("hidden");
    renderTracks();

    if (!allTracks.length) {
      showError("Энэ видеонд татаж болох хадмал олдсонгүй.");
    }
  } catch (err) {
    showError(err.message);
  } finally {
    findBtn.disabled = false;
    findBtn.textContent = "Хайх";
  }
});

languageSearch.addEventListener("input", renderTracks);

downloadBtn.addEventListener("click", async () => {
  if (!selectedTrack) return;

  downloadBtn.disabled = true;
  downloadBtn.textContent = "Бэлтгэж байна...";

  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: currentUrl,
        lang: selectedTrack.lang,
        format: format.value
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Татаж чадсангүй.");
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const filename = match ? decodeURIComponent(match[1]) : `subtitle.${format.value}`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    showError(err.message);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = "Татах";
  }
});
