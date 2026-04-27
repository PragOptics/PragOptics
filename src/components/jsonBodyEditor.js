// src/components/jsonBodyEditor.js

import { repairJson } from "./jsonRepair.js";

export function initJsonBodyEditor({
  textarea,
  statusHost,
  onValidityChange
}) {
  if (!textarea || !statusHost) return;

  const esc = (s) =>
    String(s || "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );

  const editorRoot = textarea.closest(".po-json-editor");
  // Default render mode: pretty (wrapping + vertical scroll)
    if (editorRoot && !editorRoot.dataset.jsonMode) {
    editorRoot.dataset.jsonMode = "pretty";
    }

  const FEATURE_CHIPS = false; // default OFF; flip true when you want them

  function getHighlightHost() {
    return editorRoot ? editorRoot.querySelector("#po-api-body-highlight") : null;
  }

    function getSuggestHost() {
    // same container as textarea
    const panel = textarea.closest("#po-api-body-container") || textarea.parentElement;
    return panel ? panel.querySelector("#po-json-suggest") : null;
    }



    // Lightweight context scan (deterministic)
    function computeContext(text, caretPos) {
  let inString = false;
  let escd = false;

  // stack frames: { type: '{'|'[', expect: 'keyOrEnd'|'colon'|'value'|'commaOrEnd'|'valueOrEnd' }
  const frames = [];

  const N = Math.max(0, Math.min(caretPos, text.length));

  function top() { return frames[frames.length - 1]; }

  for (let i = 0; i < N; i++) {
    const ch = text[i];

    // --- string scanning ---
    if (inString) {
      if (escd) { escd = false; continue; }
      if (ch === "\\") { escd = true; continue; }
      if (ch === '"') {
        inString = false;

        // when a string ends, decide if it was a KEY or a VALUE based on frame.expect
        const f = top();
        if (f && f.type === "{") {
          if (f.expect === "keyOrEnd") f.expect = "colon";
          else if (f.expect === "value") f.expect = "commaOrEnd";
        } else if (f && f.type === "[") {
          if (f.expect === "valueOrEnd" || f.expect === "value") f.expect = "commaOrEnd";
        }
      }
      continue;
    }

    if (ch === '"') { inString = true; continue; }

    // --- structural opens/closes ---
    if (ch === "{") { frames.push({ type: "{", expect: "keyOrEnd" }); continue; }
    if (ch === "[") { frames.push({ type: "[", expect: "valueOrEnd" }); continue; }

    if (ch === "}" || ch === "]") {
      frames.pop();
      const f = top();
      if (f) f.expect = "commaOrEnd";
      continue;
    }

    // --- separators ---
    if (ch === ":") {
      const f = top();
      if (f && f.type === "{") f.expect = "value";
      continue;
    }

    if (ch === ",") {
      const f = top();
      if (f && f.type === "{") f.expect = "keyOrEnd";
      else if (f && f.type === "[") f.expect = "valueOrEnd";
      continue;
    }

    // --- primitive value starts (number/true/false/null) ---
    if (!/\s/.test(ch)) {
      const f = top();
      if (f) {
        if (f.type === "{") {
          if (f.expect === "value") f.expect = "commaOrEnd";
        } else if (f.type === "[") {
          if (f.expect === "value" || f.expect === "valueOrEnd") f.expect = "commaOrEnd";
        }
      }
    }
  }

  const f = top();
  if (inString) return { state: "IN_STRING", top: f?.type || null, frames };

  if (!f) return { state: "EXPECT_VALUE", top: null, frames };

  if (f.type === "{") {
    if (f.expect === "keyOrEnd") return { state: "EXPECT_KEY", top: "{", frames };
    if (f.expect === "colon") return { state: "EXPECT_COLON", top: "{", frames };
    if (f.expect === "value") return { state: "EXPECT_VALUE", top: "{", frames };
    return { state: "EXPECT_COMMA_OR_CLOSE", top: "{", frames };
  }

  if (f.type === "[") {
    if (f.expect === "valueOrEnd") return { state: "EXPECT_VALUE_OR_CLOSE", top: "[", frames };
    return { state: "EXPECT_COMMA_OR_CLOSE", top: "[", frames };
  }

  return { state: "EXPECT_VALUE", top: null, frames };
}

    function buildSuggestions(ctx) {
    const closeTok = (ctx.top === "{") ? "}" : (ctx.top === "[") ? "]" : "";

    // Each suggestion: {label, insert, tone, caretOffset}
    // caretOffset = where caret should land after insertion relative to insertion start
    switch (ctx.state) {
        case "EXPECT_KEY":
        return [
            { label: '""', insert: '""', tone: "key", caretOffset: 1 },
            { label: '"" : ""', insert: '"" : ""', tone: "shape", caretOffset: 1 },
            { label: closeTok || "}", insert: closeTok || "}", tone: "shape", caretOffset: 1 }
        ];

        case "EXPECT_COLON":
        return [
            { label: ":", insert: ":", tone: "shape", caretOffset: 1 }
        ];

        case "EXPECT_VALUE":
        case "EXPECT_VALUE_OR_CLOSE":
        return [
            { label: '""', insert: '""', tone: "val", caretOffset: 1 },
            { label: "{}", insert: "{}", tone: "shape", caretOffset: 1 },
            { label: "[]", insert: "[]", tone: "shape", caretOffset: 1 },
            { label: "true", insert: "true", tone: "val", caretOffset: 4 },
            { label: "false", insert: "false", tone: "val", caretOffset: 5 },
            { label: "null", insert: "null", tone: "val", caretOffset: 4 },
            { label: "0", insert: "0", tone: "val", caretOffset: 1 },
            ...(ctx.state === "EXPECT_VALUE_OR_CLOSE" ? [{ label: closeTok || "]", insert: closeTok || "]", tone: "shape", caretOffset: 1 }] : [])
        ];

        case "EXPECT_COMMA_OR_CLOSE":
            return [
                { label: closeTok || "}", insert: closeTok || "}", tone: "shape", caretOffset: 1 },
                { label: ",", insert: ", ", tone: "shape", caretOffset: 2 }
            ];

        default:
        return [];
    }
    }

    function insertAtCursor(insertText, caretOffset) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const v = textarea.value;

    textarea.value = v.slice(0, start) + insertText + v.slice(end);
    const next = start + (caretOffset ?? insertText.length);
    textarea.selectionStart = textarea.selectionEnd = next;
    }

  function deriveHint(msg, text, pos) {
  msg = String(msg || "");
  text = String(text || "");

  // Unterminated string: always needs closing quote
  if (/Unterminated string/i.test(msg)) return 'Missing closing double-quote (").';

  // Property name expected while user typed an identifier after "{"
  if (/Expected property name/i.test(msg)) {
    const ch = text[pos] || "";
    if (/[a-zA-Z0-9_$]/.test(ch)) return 'Property names must be in double-quotes: {"name": ...}';
    return "Expected a property name or closing brace }.";
  }

  // Expected ':' after property name
  if (/Expected ':' after property name/i.test(msg)) return "Missing ':' after the property name.";

  // EOF: derive a better hint from last non-whitespace char
  if (msg.includes("Unexpected end of JSON input")) {
    const trimmed = text.replace(/\s+$/, "");
    const last = trimmed[trimmed.length - 1] || "";
    if (last === "{") return "Missing a property name or }.";
    if (last === "[") return "Missing a value or ].";
    if (last === ":") return "Missing a value after ':'.";
    if (last === ",") return "Missing the next property/value after ','.";
    if (last === '"') return 'String opened but not completed (missing closing ").';
    return "JSON input ended early — something is incomplete.";
  }

  return "";
}


  function extractPos(msg, text) {
    const m = /position\s+(\d+)/i.exec(msg || "");
    if (m) return Number(m[1]);

    // No position provided (common for EOF)
    if ((msg || "").includes("Unexpected end of JSON input")) {
        return (text || "").length; // EOF marker
    }
    return null;
    }


  function renderHighlight(text, errorPos = null, opts = {}) {
    const highlightHost = getHighlightHost();
    if (!highlightHost) return;

    let out = "";
    let i = 0;
    // Depth-aware structure coloring
    const stack = []; // will hold '{' and '['
    const DEPTH_MOD = 6; // number of rotating colors (match your CSS depth classes)

    function depthClass(depth) {
    return `d${Math.abs(depth) % DEPTH_MOD}`;
    }

    // Returns the class string for punctuation tokens
    function puncClass(ch) {
    if (ch === "{") return `tok-brace open ${depthClass(stack.length)}`;
    if (ch === "}") return `tok-brace close ${depthClass(Math.max(0, stack.length - 1))}`;
    if (ch === "[") return `tok-bracket open ${depthClass(stack.length)}`;
    if (ch === "]") return `tok-bracket close ${depthClass(Math.max(0, stack.length - 1))}`;
    if (ch === ":") return "tok-colon";
    if (ch === ",") return "tok-comma";
    return "tok-punc";
    }


    const wrapErr = (s, startIdx) => {
      if (errorPos == null) return esc(s);

      const rel = errorPos - startIdx;
      if (rel < 0 || rel >= s.length) return esc(s);
      
    if (opts.insertBefore === true && rel === 0) {
        return (
        `<span class="tok-err"></span>` +
        esc(s)
        );
    }

      return (
        esc(s.slice(0, rel)) +
        `<span class="tok-err">${esc(s[rel])}</span>` +
        esc(s.slice(rel + 1))
      );
    };

    while (i < text.length) {
      const ch = text[i];

      // strings
      if (ch === '"') {
        let j = i + 1, escd = false;
        while (j < text.length) {
          const c = text[j];
          if (escd) { escd = false; j++; continue; }
          if (c === "\\") { escd = true; j++; continue; }
          if (c === '"') { j++; break; }
          j++;
        }
        const raw = text.slice(i, j);
        function isPropertyName(text, endIdx) {
        let k = endIdx;
        while (k < text.length && /\s/.test(text[k])) k++;
        return text[k] === ":";
        }
        if (isPropertyName(text, j)) {
        out += `<span class="tok-prop">${wrapErr(raw, i)}</span>`;
        } else {
        out += `<span class="tok-val-str">${wrapErr(raw, i)}</span>`;
        }
        i = j;
        continue;
      }

      // numbers
      if (ch === "-" || (ch >= "0" && ch <= "9")) {
        let j = i + 1;
        while (j < text.length && /[0-9eE+\-\.]/.test(text[j])) j++;
        const raw = text.slice(i, j);
        out += `<span class="tok-val-num">${wrapErr(raw, i)}</span>`;
        i = j;
        continue;
      }

      // keywords / identifiers
      if (/[a-zA-Z]/.test(ch)) {
        let j = i + 1;
        while (j < text.length && /[a-zA-Z]/.test(text[j])) j++;
        const raw = text.slice(i, j);

        if (raw === "true" || raw === "false") {
          out += `<span class="tok-val-bool">${wrapErr(raw, i)}</span>`;
        } else if (raw === "null") {
          out += `<span class="tok-val-null">${wrapErr(raw, i)}</span>`;
        } else {
          // unquoted identifiers stay uncolored (they should look “wrong”)
          out += wrapErr(raw, i);
        }
        i = j;
        continue;
      }

      // punctuation
      // punctuation (depth-aware for braces/brackets)
        if ("{}[]:,".includes(ch)) {
        const cls = puncClass(ch);

        // opening tokens push AFTER rendering (so opener uses current depth)
        if (ch === "{" || ch === "[") {
            out += `<span class="${cls}">${wrapErr(ch, i)}</span>`;
            stack.push(ch);
            i++;
            continue;
        }

        // closing tokens pop BEFORE updating depth (but render with pre-pop depth via cls)
        if (ch === "}" || ch === "]") {
            out += `<span class="${cls}">${wrapErr(ch, i)}</span>`;
            const top = stack[stack.length - 1];
            if ((ch === "}" && top === "{") || (ch === "]" && top === "[")) stack.pop();
            i++;
            continue;
        }

        // separators
        out += `<span class="${cls}">${wrapErr(ch, i)}</span>`;
        i++;
        continue;
        }
      // whitespace / everything else
      out += wrapErr(ch, i);
      i++;
    }

        // EOF marker: when errorPos points past the last char
    if (errorPos === text.length) {
    out += `<span class="tok-err"></span>`;
    }

        // Ghost suggestion at caret (render-only)
    if (opts.ghost && typeof opts.caretPos === "number") {
    const cp = Math.max(0, Math.min(opts.caretPos, text.length));
    // inject at end if cp == text.length (simple, safe)
    if (cp === text.length) {
        out += `<span class="tok-ghost">${esc(opts.ghost)}</span>`;
    }
    }

    highlightHost.innerHTML = out;
  }

  function syncScroll() {
    const highlightHost = getHighlightHost();
    if (!highlightHost) return;
    highlightHost.scrollTop = textarea.scrollTop;
    highlightHost.scrollLeft = textarea.scrollLeft;
  }

  function setStatus(valid, message) {
    textarea.classList.toggle("json-valid", valid);
    textarea.classList.toggle("json-invalid", !valid);

    statusHost.innerHTML = `
      <span class="json-status ${valid ? "ok" : "err"}">
        ${valid ? "✓" : "✕"} ${esc(message)}
      </span>
    `;

    onValidityChange?.(valid);
  }

  function validate(value) {
    const ctx = computeContext(value, caretPos);
    const sugg = buildSuggestions(ctx);
    ghostAccept = (sugg && sugg.length) ? { insert: sugg[0].insert, caretOffset: sugg[0].caretOffset } : null;
    const ghost = (!sugg.length || ctx.state === "IN_STRING") ? "" : (sugg[0]?.label || "");
    if (!value.trim()) {
      renderHighlight("", null, { ghost: "", caretPos });
      setStatus(true, "Empty body (no payload)");
      return;
    }


    try {
      const parsed = JSON.parse(value);

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        renderHighlight(value, null, { ghost, caretPos });
        setStatus(false, "JSON body must be an object ( { ... } )");
        return;
      }

      // If the whole text is valid JSON and we're at EOF, ghost is unnecessary/noisy.
    const ghostForValid = (caretPos === value.length) ? "" : ghost;

    renderHighlight(value, null, { ghost: ghostForValid, caretPos });
    statusHost.title = "";
    setStatus(true, "Valid JSON");
    if (caretPos === value.length) ghostAccept = null;
    } catch (err) {
    const msg = err?.message || "Invalid JSON";
    const pos = extractPos(msg, value);

    // If the parser says “Expected property name…” and we’re pointing at an identifier,
    // it’s more helpful to show the insertion point BEFORE that identifier.
    const insertBefore =
    /Expected property name/i.test(msg) &&
    typeof pos === "number" &&
    /[a-zA-Z0-9_$]/.test((value[pos] || ""));

    const hint = deriveHint(msg, value, pos);

    renderHighlight(value, pos, { insertBefore, ghost, caretPos });

    // Prefer the friendly hint, keep the raw parser message as hover text
    statusHost.title = msg;
    setStatus(false, hint || msg);

    }
  }

  function queueValidate() {
    requestAnimationFrame(() => {
      updateCaret();
      validate(textarea.value);
      const suggestHost = getSuggestHost();
        if (FEATURE_CHIPS && suggestHost) {
        const ctx = computeContext(textarea.value, caretPos);
        const sugg = buildSuggestions(ctx);
        lastSuggestions = sugg;

        if (!sugg.length || ctx.state === "IN_STRING") {
            suggestHost.classList.add("hidden");
            suggestHost.innerHTML = "";
        } else {
            suggestHost.classList.remove("hidden");
            suggestHost.innerHTML = sugg.map((s, idx) =>
            `<span class="po-json-chip" data-idx="${idx}" data-tone="${s.tone}">${s.label}</span>`
            ).join("")
          }
        } else if (suggestHost) {
            suggestHost.classList.add("hidden");
            suggestHost.innerHTML = "";
        }
      syncScroll();
    });
  }

  let caretPos = 0;
  let lastSuggestions = [];
  let ghostAccept = null; // { insert, caretOffset } or null

const suggestHost = getSuggestHost();

if (suggestHost) {
  suggestHost.onclick = (ev) => {
    const chip = ev.target.closest(".po-json-chip");
    if (!chip) return;

    const idx = Number(chip.dataset.idx);
    const sel = lastSuggestions[idx];
    if (!sel) return;

    insertAtCursor(sel.insert, sel.caretOffset);
    updateCaret();
    queueValidate();
  };
}

  function updateCaret() {
    caretPos = textarea.selectionStart ?? 0;
    }
    textarea.addEventListener("click", () => { updateCaret(); queueValidate(); });
    textarea.addEventListener("keyup", () => { updateCaret(); queueValidate(); });

  textarea.addEventListener("input", queueValidate);
  textarea.addEventListener("change", queueValidate);
  textarea.addEventListener("scroll", syncScroll);
  textarea.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;

  // If we have a ghost suggestion and we're at EOF with no selection, Tab accepts it.
// Otherwise Tab keeps doing indentation.
const start = textarea.selectionStart;
const end = textarea.selectionEnd;

if (!e.shiftKey && start === end && ghostAccept && start === textarea.value.length) {
  e.preventDefault();
  insertAtCursor(ghostAccept.insert, ghostAccept.caretOffset);
  updateCaret();
  queueValidate();
  return;
}

  e.preventDefault();

  const value = textarea.value;

  // indent string (2 spaces)
  const indent = "  ";

  // Shift+Tab: outdent selected lines
  if (e.shiftKey) {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
    const block = value.slice(lineStart, sliceEnd);

    const outdented = block.replace(/^ {1,2}/gm, "");
    textarea.value = value.slice(0, lineStart) + outdented + value.slice(sliceEnd);

    // restore selection roughly
    const delta = block.length - outdented.length;
    textarea.selectionStart = Math.max(lineStart, start - (delta > 0 ? 2 : 0));
    textarea.selectionEnd = Math.max(lineStart, end - delta);

    queueValidate();
    return;
  }

  // Tab: indent selection or insert indent at caret
  if (start !== end) {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
    const block = value.slice(lineStart, sliceEnd);

    const indented = block.replace(/^/gm, indent);
    textarea.value = value.slice(0, lineStart) + indented + value.slice(sliceEnd);

    textarea.selectionStart = start + indent.length;
    textarea.selectionEnd = end + (indent.length * (indented.split("\n").length));

    queueValidate();
    return;
  }

  // single caret insert
  textarea.value = value.slice(0, start) + indent + value.slice(end);
  textarea.selectionStart = textarea.selectionEnd = start + indent.length;

  queueValidate();
});

// ---------- JSON helper buttons ----------
const formatBtn = document.getElementById("po-api-format");
const minifyBtn = document.getElementById("po-api-minify");
const repairBtn = document.getElementById("po-api-repair");
// Format JSON (pretty print)
formatBtn?.addEventListener("click", () => {
  try {
    const obj = JSON.parse(textarea.value || "{}");
    textarea.value = JSON.stringify(obj, null, 2);
    if (editorRoot) editorRoot.dataset.jsonMode = "pretty";
    queueValidate();
  } catch {
    // Invalid JSON: status already explains
  }
});

// Minify JSON (compact)
minifyBtn?.addEventListener("click", () => {
  try {
    const obj = JSON.parse(textarea.value || "{}");
    textarea.value = JSON.stringify(obj);
    if (editorRoot) editorRoot.dataset.jsonMode = "minified";
    queueValidate();
  } catch {
    // Invalid JSON: status already explains
  }
});

repairBtn?.addEventListener("click", () => {
  const result = repairJson(textarea.value);

  if (!result.ok) {
  // Try to provide a case-specific hint using the same rules as validation.
  let reason = result.reason;

  try {
    // Force the parser to tell us what's wrong (deterministic).
    JSON.parse(textarea.value);
  } catch (err) {
    const msg = err?.message || "";
    const pos = extractPos(msg, textarea.value);
    const hint = deriveHint(msg, textarea.value, pos);

    // If deriveHint can explain it, use it.
    if (hint) reason = hint;

    // Keep the raw parser message as hover detail.
    statusHost.title = msg || result.reason;
  }

  // Add a truthful “supported repairs” suffix (no guessing).
  const supported = "Repair supports: trailing commas, unquoted keys, missing closing braces/brackets.";
  statusHost.innerHTML = `<span class="json-status err">✕ ${esc(reason)} ${esc(supported)}</span>`;
  return;
}

  // If it was valid already, keep it stable (no noise)
  if (result.reason === "Already valid" || result.reason === "Empty") {
    statusHost.title = "";
    statusHost.innerHTML = `<span class="json-status ok">✓ ${esc(result.reason)}</span>`;
    return;
  }

  textarea.value = result.text;

  // Repairs should leave you in readable mode
  if (editorRoot) editorRoot.dataset.jsonMode = "pretty";

  // Put caret at end (deterministic, avoids selection weirdness)
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

  statusHost.title = "";
  statusHost.innerHTML = `<span class="json-status ok">✓ ${esc("Repaired JSON: " + result.reason)}</span>`;

  queueValidate();
});

  queueValidate();
}
