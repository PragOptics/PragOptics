// /docs/.codex/codex.js

/* =========================
   Utils: escape + markdown
   ========================= */

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[c]));
}

function mdToHtml(md) {
  md = md.replace(/\r\n?/g, "\n");

  // horizontal rules
  md = md.replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, "<hr>");

  // code fences
  md = md.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${esc(code)}</code></pre>`
  );

  // inline code
  md = md.replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`);

  // headings
  md = md
    .replace(/^######\s?(.*)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s?(.*)$/gm, "<h5>$1</h5>")
    .replace(/^####\s?(.*)$/gm, "<h4>$1</h4>")
    .replace(/^###\s?(.*)$/gm, "<h3>$1</h3>")
    .replace(/^##\s?(.*)$/gm, "<h2>$1</h2>")
    .replace(/^#\s?(.*)$/gm, "<h1>$1</h1>");

  // bold / italic
  md = md
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // images ![alt](url)  (e.g., shields.io badges)
  // images ![alt](url)
md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
  const safeAlt = esc(alt || "");
  const safeUrl = esc(url);
  // If it's a shields.io badge → use md-badge
  const isBadge = safeUrl.includes("shields.io");
  return `<img ${isBadge ? 'class="md-badge"' : ''} alt="${safeAlt}" src="${safeUrl}" loading="lazy">`;
});

  // links [text](url)
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safeUrl = esc(url);
    const safeText = esc(text);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeText}</a>`;
  });

  // GFM pipe tables
  md = md.replace(
    /(^\|.+\|\s*\n\|(?:\s*:?-+:?\s*\|)+\s*\n(?:\|.*\|\s*\n)+)/gm,
    (block) => {
      const lines = block.trim().split("\n");
      const header = lines[0].slice(1, -1).split("|").map(c => c.trim());
      const body = lines.slice(2).map(row =>
        row.slice(1, -1).split("|").map(c => c.trim())
      );

      const thead = `<thead><tr>${header.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
      return `<table>${thead}${tbody}</table>`;
    }
  );

  // Preserve any raw HTML tables already present in the .md
  const TABLE_PLACEHOLDER = "§§TABLE_BLOCK§§";
  const tables = [];
  md = md.replace(/<table[\s\S]*?<\/table>/g, (match) => {
    tables.push(match);
    return TABLE_PLACEHOLDER;
  });

  // unordered lists (simple)
  md = md.replace(/^(?:-\s.+(?:\n|$))+?/gm, (block) => {
    const items = block.trim().split("\n").map(line => {
      const txt = line.replace(/^-+\s?/, "");
      return `<li>${txt}</li>`;
    }).join("");
    return `<ul>${items}</ul>`;
  });

  // paragraph wrap (avoid wrapping existing blocks)
  md = md.replace(
    /^(?!<h\d|<ul|<pre|<p|<table|<hr|<\/|\s*$)(.+)$/gm,
    "<p>$1</p>"
  );

  // restore preserved tables
  md = md.replace(new RegExp(TABLE_PLACEHOLDER, "g"), () => tables.shift());

  return md;
}

/* =========================
   DOM refs
   ========================= */

const $tree = document.getElementById("codexTree");
const $title = document.getElementById("codexTitle");
const $path = document.getElementById("codexPath");
const $raw = document.getElementById("codexOpenRaw");
const $content = document.getElementById("codexContent");
const $loading = document.getElementById("codexLoading");
const $nav = document.querySelector(".codex-nav");
const $navToggle = document.getElementById("codexNavToggle");

if ($navToggle && $nav) {
  $navToggle.addEventListener("click", () => $nav.classList.toggle("is-open"));
}

/* =========================
   State helpers
   ========================= */

function setLoading(on) {
  if (!$loading) return;
  $loading.style.display = on ? "block" : "none";
}

function hashDocPath() {
  // expects #doc=<encodedPath>
  const m = location.hash.match(/doc=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function setHashDocPath(p) {
  const next = `#doc=${encodeURIComponent(p)}`;
  if (location.hash !== next) history.replaceState(null, "", next);
}

function basename(p) {
  try {
    const clean = String(p).split("?")[0].split("#")[0];
    const parts = clean.split("/");
    return parts[parts.length - 1] || clean;
  } catch {
    return String(p);
  }
}

/* =========================
   Manifest + tree building
   ========================= */

async function loadManifest() {
  const res = await fetch("https://pragoptics.com/docs/codex.manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load https://pragoptics.com/docs/codex.manifest.json");
  return res.json();
}


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
      const filePath = rootPath + item.path;
      const fileNode = createNode({ icon: "🗎", text: item.name });
      fileNode.dataset.filePath = filePath;

      fileNode.addEventListener("click", async (e) => {
        // Prevent bubbling into a parent folder toggle
        e.stopPropagation();
        await openDoc(item.name, filePath);

        // mobile: collapse nav after selection
        if ($nav && $nav.classList.contains("is-open")) $nav.classList.remove("is-open");
      });

      rootEl.appendChild(fileNode);
    }
  });
}

/* =========================
   Doc loading
   ========================= */

async function openDoc(name, filePath) {
  clearActive();
  markActiveByPath(filePath);

  if ($title) $title.textContent = name || "Document";
  if ($path) $path.textContent = filePath;
  if ($raw) $raw.href = filePath;

  setHashDocPath(filePath);

  setLoading(true);
  if ($content) $content.innerHTML = "";

  try {
    const res = await fetch(filePath, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch doc");
    const md = await res.text();
    if ($content) $content.innerHTML = mdToHtml(md);
  } catch {
    if ($content) $content.innerHTML = "<p>Unable to load document.</p>";
  } finally {
    setLoading(false);
  }
}

function findFirstFile(manifest) {
  const root = manifest.root || "https://pragoptics.com/docs/";

  function walk(items) {
    for (const it of items || []) {
      if (it.type === "file") return { name: it.name, path: root + it.path };
      if (it.type === "folder") {
        const found = walk(it.items);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(manifest.items);
}

/* =========================
   Boot
   ========================= */

(async function boot() {
  if (!$tree || !$content) return;

  const manifest = await loadManifest();
  const rootPath = manifest.root || "https://pragoptics.com/docs/";

  buildTree(manifest.items || [], $tree, rootPath);

  // 1) open from hash if provided
  const initial = hashDocPath();
  if (initial) {
    await openDoc(basename(initial), initial);
    return;
  }

  // 2) otherwise open first file in manifest
  const first = findFirstFile(manifest);
  if (first) {
    await openDoc(first.name, first.path);
    return;
  }

  // 3) no files
  if ($title) $title.textContent = manifest.title || "Documentation";
  if ($path) $path.textContent = "No documents configured";
  if ($content) $content.innerHTML = "<p>No documents found in codex.manifest.json</p>";
})();
