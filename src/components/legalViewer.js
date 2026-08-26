// /src/components/legalViewer.js

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

  // code fences (must come before inline code)
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

  // links [text](url) — external ones open in a new tab
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const href = esc(url.trim());
    const external = /^https?:\/\//i.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${attrs}>${esc(text)}</a>`;
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

export function initLegalViewer(options = {}) {
  const paths = {
    terms: options.termsPath || "/docs/PragOptics-Subscriber-Agreement.md",
    privacy: options.privacyPath || "/docs/PragOptics-Privacy.md",
    license: options.licensePath || "/docs/omni-LICENSE.md"
  };

  const titles = {
    terms: "Terms",
    privacy: "Privacy",
    license: "Omni Design Licence"
  };

  const $mask = document.getElementById("legalMask");
  const $panel = document.getElementById("legalPanel");
  const $title = document.getElementById("legalTitle");
  const $loading = document.getElementById("legalLoading");
  const $content = document.getElementById("legalContent");
  const $raw = document.getElementById("legalOpenRaw");

  // If any are missing, the viewer can't operate
  if (!$mask || !$panel || !$title || !$loading || !$content || !$raw) return;

  function open() {
    $mask.classList.add("is-open");
    $panel.classList.add("is-open");
    $mask.setAttribute("aria-hidden", "false");
    $panel.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function close() {
    $mask.classList.remove("is-open");
    $panel.classList.remove("is-open");
    $mask.setAttribute("aria-hidden", "true");
    $panel.setAttribute("aria-hidden", "true");
    // This viewer can open on top of the product modal or the cart drawer.
    // Only give scrolling back if nothing is still open underneath.
    const stillOpen = document.querySelector("#productPanel.is-open, #cartPanel.is-open");
    document.body.style.overflow = stillOpen ? "hidden" : "";
  }

  async function showDoc(kind) {
    const url = paths[kind];
    if (!url) return;

    $title.textContent = titles[kind] || "Document";
    $raw.href = url;

    $loading.style.display = "block";
    $content.innerHTML = "";

    open();

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load ${kind}`);
      const md = await res.text();
      $content.innerHTML = mdToHtml(md);
    } catch (e) {
      $content.innerHTML = "<p>Unable to load document. Please try again.</p>";
    } finally {
      $loading.style.display = "none";
    }
  }

  // Click handling
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-legal]");
    if (a) {
      e.preventDefault();
      showDoc(a.dataset.legal);
      return;
    }

    const act = e.target.closest("[data-legal-action]");
    if (act) {
      e.preventDefault();
      if (act.dataset.legalAction === "close") close();
      return;
    }

    if (e.target === $mask) close();
  });

  // ESC to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $panel.classList.contains("is-open")) close();
  });
}