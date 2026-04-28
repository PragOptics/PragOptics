// /games/codex-games/games.js

/* ========================= DOM refs (Codex IDs retained) ========================= */
const $tree    = document.getElementById("codexTree");
const $title   = document.getElementById("codexTitle");
const $path    = document.getElementById("codexPath");
const $content = document.getElementById("codexContent");
const $loading = document.getElementById("codexLoading");
const $nav     = document.querySelector(".codex-nav");
const $navToggle = document.getElementById("codexNavToggle");

/* ========================= Nav toggle (same behavior as Codex) ========================= */
if ($navToggle && $nav) {
  $navToggle.addEventListener("click", () => $nav.classList.toggle("is-open"));
}

/* ========================= Helpers ========================= */
function setLoading(on) {
  if (!$loading) return;
  $loading.style.display = on ? "block" : "none";
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}

function hashGamePath() {
  // expects #game=
  const m = location.hash.match(/game=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function setHashGamePath(p) {
  const next = `#game=${encodeURIComponent(p)}`;
  if (location.hash !== next) history.replaceState(null, "", next);
}

/* root+path join that tolerates missing/extra slashes */
function joinRoot(root, path) {
  const r = String(root || "");
  const p = String(path || "");
  if (!r) return p;
  return r.replace(/\/+$/, "/") + p.replace(/^\/+/, "");
}

/* ========================= Manifest load (ABSOLUTE URL) ========================= */
async function loadManifest() {
  // Absolute fetch: matches Codex's approach (no relative paths)
  const res = await fetch("https://pragoptics.com/games/games.manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load https://pragoptics.com/games/games.manifest.json");
  return res.json();
}

/* ========================= Tree helpers (Codex dataset conventions) ========================= */
function clearActive() {
  document.querySelectorAll(".codex-node.is-active").forEach(n => n.classList.remove("is-active"));
}

function markActiveByPath(p) {
  const sel = `.codex-node[data-file-path="${CSS.escape(p)}"]`;
  const el = document.querySelector(sel);
  if (el) el.classList.add("is-active");
}

function createNode({ icon, text, isActive = false }) {
  const node = document.createElement("div");
  node.className = "codex-node" + (isActive ? " is-active" : "");
  node.setAttribute("role", "treeitem");

  const ico = document.createElement("span");
  ico.className = "icon";
  ico.textContent = icon;

  const label = document.createElement("span");
  label.textContent = text;

  node.appendChild(ico);
  node.appendChild(label);
  return node;
}

function buildTree(items, rootEl, rootPath) {
  if (!rootEl) return;

  (items || []).forEach(item => {
    if (item.type === "folder") {
      const folderNode = createNode({ icon: "➕", text: item.name });
      folderNode.setAttribute("aria-expanded", "true");

      const children = document.createElement("div");
      children.className = "codex-children";
      children.setAttribute("role", "group");

      folderNode.addEventListener("click", () => {
        const expanded = folderNode.getAttribute("aria-expanded") === "true";
        folderNode.setAttribute("aria-expanded", String(!expanded));
        folderNode.querySelector(".icon").textContent = expanded ? "➕" : "➖";
        children.style.display = expanded ? "none" : "block";
      });

      rootEl.appendChild(folderNode);
      rootEl.appendChild(children);
      buildTree(item.items || [], children, rootPath);
      return;
    }

    if (item.type === "file") {
      const gameUrl = joinRoot(rootPath, item.path);

      const gameNode = createNode({ icon: "🎮", text: item.name });
      gameNode.dataset.filePath = gameUrl; // Codex-style data attribute

      gameNode.addEventListener("click", async (e) => {
        e.stopPropagation();
        await openGame(item, gameUrl);

        // mobile: collapse nav after selection (Codex behavior)
        if ($nav && $nav.classList.contains("is-open")) $nav.classList.remove("is-open");
      });

      rootEl.appendChild(gameNode);
    }
  });
}

/* ========================= UI (launch panel) ========================= */
function renderEmpty() {
  return `
    <div class="games-empty">
      <div class="games-empty-title">SYSTEM READY</div>
      <div class="games-empty-sub">Choose a game from the left.</div>
    </div>
  `;
}

function renderGamePanel(item, gameUrl) {
  const name = esc(item?.name || "Game");
  const desc = esc(item?.description || "");
  const fmt  = esc(item?.format || "html");
  const url  = esc(gameUrl);

  return `
    <div class="games-card">
      <h2 class="games-h1">${name}</h2>
      <div class="games-meta">${desc}</div>

      <div class="games-kv">
        <div class="k">Type</div><div>${fmt}</div>
        <div class="k">URL</div><div class="games-url">${url}</div>
      </div>

      <div class="games-actions">
        <button class="games-btn primary" id="gamesLaunchBtn" type="button">
            ▶ Launch game
        </button>
     </div>


      <div class="games-note">
        Games launch in a new window
      </div>
    </div>
  `;
}

/* ========================= Open game (new window/tab) ========================= */
async function openGame(item, gameUrl) {
  clearActive();
  markActiveByPath(gameUrl);

  if ($title) $title.textContent = item?.name || "Game";
  if ($path)  $path.textContent  = gameUrl;

  setHashGamePath(gameUrl);

  if ($content) {
    $content.innerHTML = renderGamePanel(item, gameUrl);

    const btn = document.getElementById("gamesLaunchBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        window.open(gameUrl, "_blank", "noopener,noreferrer");
      });
    }
  }
}

/* ========================= Finders ========================= */
function findByResolvedPath(manifest, resolvedPath) {
  const root = manifest.root || "https://pragoptics.com/games/";
  function walk(items) {
    for (const it of (items || [])) {
      if (it.type === "file") {
        const url = joinRoot(root, it.path);
        if (url === resolvedPath) return { item: it, url };
      }
      if (it.type === "folder") {
        const found = walk(it.items);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(manifest.items);
}

/* ========================= Boot ========================= */
(async function boot() {
  if (!$tree || !$content) return;

  setLoading(true);

  let manifest;
  try {
    manifest = await loadManifest();
  } catch (e) {
    setLoading(false);
    if ($title) $title.textContent = "Games";
    if ($path)  $path.textContent  = "Unable to load games.manifest.json";
    if ($raw)   $raw.href          = "#";
    if ($content) $content.innerHTML = `
      <div class="games-card">
        <h2 class="games-h1">Manifest load failed</h2>
        <div class="games-meta">https://pragoptics.com/games/games.manifest.json</div>
      </div>`;
    return;
  } finally {
    setLoading(false);
  }

  const rootPath = manifest.root || "https://pragoptics.com/games/";
  buildTree(manifest.items || [], $tree, rootPath);

  const initial = hashGamePath();
  if (initial) {
    const found = findByResolvedPath(manifest, initial);
    if (found) {
      await openGame(found.item, found.url);
      return;
    }
  }

  // default idle state (do NOT auto-launch games)
  if ($title) $title.textContent = manifest.title || "Games";
  if ($path)  $path.textContent  = "Select a game";
  if ($raw)   $raw.href          = "#";
  $content.innerHTML = renderEmpty();
})();
