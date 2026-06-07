// /docs/codex/codex.js
//
// PragOptics Codex — document renderer + navigation.
//
// Rendering is now a full Markdown engine (markdown-it + GFM + raw HTML),
// matched to "VS Code Ctrl+Shift+V" quality:
//   - markdown-it            full CommonMark + GFM tables, html:true (raw HTML/<style>/<svg> pass through)
//   - markdown-it-anchor     heading ids so in-doc TOC/anchor links resolve
//   - highlight.js           fenced code-block syntax highlighting
//
// Each document is rendered inside an ISOLATED <iframe> (like VS Code's webview),
// so a doc that ships its own <style>/<svg>/banners renders faithfully without its
// CSS leaking into the codex chrome. The frame auto-sizes to its content.
//
// Deps are vendored under ./vendor/ and loaded by index.html as UMD globals, so
// the codex has no external CDN dependency.

const markdownit = window.markdownit;
const anchor = window.markdownItAnchor;
const hljs = window.hljs;
const VENDOR = new URL("./vendor/", import.meta.url).href;

/* =========================
   Markdown engine
   ========================= */

// GitHub-style heading slugs so authored links like [X](#how-it-works) land.
function slugify(s) {
  return String(s)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const md = markdownit({
  html: true,        // pass raw HTML / <style> / <svg> through (docs are first-party)
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          "</code></pre>";
      } catch (_) {}
    }
    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + "</code></pre>";
  }
}).use(anchor, { slugify, tabIndex: false, permalink: false });

/* Default dark "markdown preview" stylesheet for documents that bring no theme of
   their own (the legal/info docs). A document's own <style> overrides these inside
   its isolated frame, so richly-styled docs (e.g. the OmniBus brochure) render as
   authored. */
const BASE_CSS = `
:root{--bg:#0a0f16;--ink:#e6edf3;--mut:#9fb0c3;--line:#222c39;--cyan:#1fe0ff;--purple:#bf7dff;--code:#0f1620;}
*{box-sizing:border-box;}
html,body{margin:0;background:var(--bg);}
body{color:var(--ink);font:16px/1.65 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  max-width:920px;margin:0 auto;padding:26px 30px 60px;-webkit-font-smoothing:antialiased;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;}
a{color:var(--cyan);text-decoration:none;} a:hover{text-decoration:underline;}
h1,h2,h3,h4,h5,h6{font-weight:700;line-height:1.25;margin:1.4em 0 .5em;}
h1{font-size:2em;border-bottom:1px solid var(--line);padding-bottom:.3em;}
h2{font-size:1.5em;border-bottom:1px solid var(--line);padding-bottom:.3em;}
h3{font-size:1.25em;} h4{font-size:1.05em;}
p{margin:.7em 0;}
ul,ol{padding-left:1.6em;} li{margin:.25em 0;}
blockquote{margin:1em 0;padding:.4em 1em;border-left:4px solid var(--purple);
  background:rgba(191,125,255,.07);color:var(--mut);border-radius:0 8px 8px 0;}
code{background:var(--code);padding:.15em .4em;border-radius:6px;font-size:.9em;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
pre{background:var(--code);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow:auto;}
pre code{background:none;padding:0;font-size:.86em;}
table{border-collapse:collapse;width:100%;margin:1em 0;display:block;overflow:auto;}
th,td{border:1px solid var(--line);padding:7px 12px;text-align:left;}
th{background:#121a25;font-weight:700;}
tbody tr:nth-child(2n) td{background:rgba(255,255,255,.02);}
img{max-width:100%;height:auto;}
hr{border:0;border-top:1px solid var(--line);margin:1.8em 0;}
`;

/* In-frame script: report height to the parent so the iframe auto-sizes; open
   external links in a new tab; smooth-scroll in-document anchor links. */
const FRAME_JS = `<script>
(function(){
  function report(){ var h=Math.max(document.documentElement.scrollHeight, document.body.scrollHeight); parent.postMessage({__codexHeight:h},"*"); }
  document.querySelectorAll('a[href^="http"],a[href^="mailto"],a[href^="tel"]').forEach(function(a){ a.target="_blank"; a.rel="noopener noreferrer"; });
  document.addEventListener("click", function(e){
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if(!a) return;
    var id = decodeURIComponent(a.getAttribute("href").slice(1));
    var t = id && document.getElementById(id);
    if(t){ e.preventDefault(); t.scrollIntoView({behavior:"smooth",block:"start"}); }
  });
  window.addEventListener("load", report);
  window.addEventListener("resize", report);
  document.querySelectorAll("img").forEach(function(im){ im.addEventListener("load", report); im.addEventListener("error", report); });
  setTimeout(report,60); setTimeout(report,400); setTimeout(report,1400);
})();
</script>`;

function docDirOf(p) {
  try { return p.slice(0, p.lastIndexOf("/") + 1); } catch (_) { return ""; }
}

function frameSrcdoc(bodyHtml, baseHref) {
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    (baseHref ? '<base href="' + baseHref + '">' : "") +
    '<link rel="stylesheet" href="' + VENDOR + 'github-dark.min.css">' +
    "<style>" + BASE_CSS + "</style></head>" +
    '<body class="markdown-body">' + bodyHtml + FRAME_JS + "</body></html>";
}

let _frame = null;
window.addEventListener("message", (ev) => {
  const d = ev && ev.data;
  if (d && d.__codexHeight && _frame) _frame.style.height = (d.__codexHeight + 8) + "px";
});

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

// Resolve the manifest + doc paths relative to wherever this docs page is served,
// so the codex works on prod (/docs/) and on a local preview alike.
const DOCS_ROOT = new URL(".", document.baseURI).href;

async function loadManifest() {
  const url = new URL("codex.manifest.json", DOCS_ROOT).href;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load " + url);
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
      const folderNode = createNode({ icon: "➖", text: item.name });
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
        e.stopPropagation();
        await openDoc(item.name, filePath);
        if ($nav && $nav.classList.contains("is-open")) $nav.classList.remove("is-open");
      });

      rootEl.appendChild(fileNode);
    }
  });
}

/* =========================
   Doc loading (markdown-it → isolated iframe)
   ========================= */

async function openDoc(name, filePath) {
  clearActive();
  markActiveByPath(filePath);

  if ($title) $title.textContent = name || "Document";
  if ($path) $path.textContent = filePath;
  if ($raw) $raw.href = filePath;

  setHashDocPath(filePath);
  setLoading(true);
  if ($content) { $content.innerHTML = ""; $content.style.padding = "0"; }

  try {
    const res = await fetch(filePath, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch doc");
    const text = await res.text();
    const html = md.render(text);

    const frame = document.createElement("iframe");
    frame.className = "codex-frame";
    frame.setAttribute("title", name || "Document");
    _frame = frame;
    if ($content) $content.appendChild(frame);
    frame.srcdoc = frameSrcdoc(html, docDirOf(filePath));
  } catch {
    if ($content) $content.innerHTML = '<p style="padding:18px 22px;color:var(--muted)">Unable to load document.</p>';
  } finally {
    setLoading(false);
  }
}

function findFirstFile(manifest, root) {
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
  const rootPath = DOCS_ROOT;

  buildTree(manifest.items || [], $tree, rootPath);

  const initial = hashDocPath();
  if (initial) {
    await openDoc(basename(initial), initial);
    return;
  }

  const first = findFirstFile(manifest, rootPath);
  if (first) {
    await openDoc(first.name, first.path);
    return;
  }

  if ($title) $title.textContent = manifest.title || "Documentation";
  if ($path) $path.textContent = "No documents configured";
  if ($content) $content.innerHTML = "<p>No documents found in codex.manifest.json</p>";
})();
