// src/builds/code.js
//
// THE CODE, READABLE (2026-09-22, Cameron: code viewing with real syntax colors, an actual read on
// the build's logic so people can see what they are getting, and clean visual summaries). Two
// things, no libraries:
//
//   highlight(text, lang)  -> HTML: the file's text as spans a stylesheet colors. A scanner per
//                             language (js, css, json, html; anything else as plain text), one pass,
//                             longest token first: comments, strings, numbers, keywords, names, tags,
//                             attributes, punctuation. Every character is escaped; nothing is executed.
//   readProject(project)   -> what a studio project is made of: its pages, the fields a visitor fills
//                             (kind and required), the buttons and what each does, the assistant,
//                             the lists and displays, the API calls it makes, the settings it exposes.
//   logicHtml(read)        -> that read as sentences and a compact grid, for the card.
//
// The build's files come from the platform's public raw route (v1/builds/{id}/raw?path=), a text
// file of a published build; the card fetches one at a time when its tab is opened.

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const JS_KEYWORDS = new Set(('async await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield true false null undefined').split(' '));
const CSS_AT = /^@[a-z-]+/;

/** The scanners: an ordered list of [className, regex] tried at the cursor; the first match wins. */
const SCANNERS = {
  js: [
    ['c', /^\/\*[\s\S]*?\*\//], ['c', /^\/\/[^\n]*/],
    ['s', /^`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/], ['s', /^"(?:\\.|[^"\\\n])*"/], ['s', /^'(?:\\.|[^'\\\n])*'/],
    ['r', /^\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[gimsuy]*(?=[\s,;.)\]}]|$)/],
    ['n', /^(?:0x[0-9a-fA-F]+|\d+\.?\d*(?:e[+-]?\d+)?)/],
    ['w', /^[A-Za-z_$][\w$]*/],
    ['p', /^[{}()[\];,.<>=+\-*/%!&|^~?:]+/],
    ['t', /^\s+/], ['t', /^[\s\S]/]
  ],
  css: [
    ['c', /^\/\*[\s\S]*?\*\//],
    ['s', /^"(?:\\.|[^"\\\n])*"/], ['s', /^'(?:\\.|[^'\\\n])*'/],
    ['k', /^@[a-z-]+/],
    ['n', /^#[0-9a-fA-F]{3,8}\b/], ['n', /^-?\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms|deg|fr|ch)?\b/],
    ['a', /^--[\w-]+/],
    ['v', /^[a-zA-Z-]+(?=\s*:)/],
    ['f', /^[a-zA-Z-]+(?=\()/],
    ['w', /^[.#]?[A-Za-z_-][\w-]*/],
    ['p', /^[{}();:,>+~*/=[\]!]+/],
    ['t', /^\s+/], ['t', /^[\s\S]/]
  ],
  json: [
    ['a', /^"(?:\\.|[^"\\])*"(?=\s*:)/], ['s', /^"(?:\\.|[^"\\])*"/],
    ['n', /^-?\d+\.?\d*(?:e[+-]?\d+)?/], ['k', /^(?:true|false|null)\b/],
    ['p', /^[{}[\]:,]/], ['t', /^\s+/], ['t', /^[\s\S]/]
  ],
  html: [
    ['c', /^<!--[\s\S]*?-->/],
    ['g', /^<\/?[A-Za-z][\w:-]*/], ['g', /^\/?>/],
    ['a', /^[A-Za-z_:][\w:.-]*(?=\s*=)/], ['s', /^"[^"]*"/], ['s', /^'[^']*'/],
    ['t', /^[^<"'\s][^<"']*/], ['t', /^\s+/], ['t', /^[\s\S]/]
  ]
};

/** The language from a file's name. */
export function langOf(path) {
  const p = String(path || '').toLowerCase();
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'js';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.json')) return 'json';
  if (p.endsWith('.html') || p.endsWith('.htm') || p.endsWith('.svg') || p.endsWith('.xml')) return 'html';
  return 'text';
}

/** One language's spans for one text. Words that are keywords color as keywords; a word before "(" as a call. */
export function highlight(text, lang = 'js') {
  const src = String(text == null ? '' : text);
  const scanners = SCANNERS[lang];
  if (!scanners) return esc(src);
  let out = '', i = 0;
  const n = src.length;
  let guard = 0;
  while (i < n && guard++ < 2_000_000) {
    const rest = src.slice(i, i + 20000);
    let cls = 't', m = null;
    for (const [c, re] of scanners) { const r = re.exec(rest); if (r && r[0].length) { cls = c; m = r[0]; break; } }
    if (!m) { m = src[i]; cls = 't'; }
    if (lang === 'js' && cls === 'w') {
      if (JS_KEYWORDS.has(m)) cls = 'k';
      else if (/^\s*\(/.test(src.slice(i + m.length, i + m.length + 3))) cls = 'f';
      else if (/^[A-Z][A-Za-z0-9_]*$/.test(m)) cls = 'y';
    }
    if (lang === 'css' && cls === 'k' && !CSS_AT.test(m)) cls = 'w';
    out += cls === 't' ? esc(m) : `<span class="tk-${cls}">${esc(m)}</span>`;
    i += m.length;
  }
  return out + esc(src.slice(i));
}

/** The highlighted text as numbered lines. */
export function codeHtml(text, lang) {
  const lines = highlight(text, lang).split('\n');
  return `<div class="bd-code-lines">${lines.map((l, k) => `<span class="bd-ln">${k + 1}</span><span class="bd-lc">${l || ' '}</span>`).join('')}</div>`;
}

/* ---------------- the read of a project ---------------- */

const KIND_WORDS = { text: 'text', email: 'an email address', tel: 'a phone number', number: 'a number', url: 'a web address', textarea: 'a long text', select: 'a choice', checkbox: 'a checkbox' };
const ACTION_WORDS = { submit: 'sends the form to the environment', callApi: 'calls an API request', add: 'adds what was typed to a list', clear: 'clears a list', set: 'sets a value' };

/** What a studio project (project.json) is made of. Tolerant of any shape: an unknown node is counted, never thrown on. */
export function readProject(project) {
  const d = project && typeof project === 'object' ? project : {};
  const pages = Array.isArray(d.pages) ? d.pages : [];
  const read = { pages: [], fields: [], buttons: [], assistants: [], lists: 0, displays: 0, sections: 0, media: 0, textBlocks: 0, other: 0, requests: [], settings: [], stateKeys: new Set(), theme: null };
  const walk = (node, page) => {
    if (!node || typeof node !== 'object') return;
    const type = String(node.type || '');
    const p = node.props || {};
    if (type === 'input') read.fields.push({ key: String(p.stateKey || ''), label: String(p.label || p.placeholder || p.stateKey || 'a field'), kind: String(p.kind || 'text'), required: p.required === true, when: String(p.when || ''), options: String(p.options || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).length });
    else if (type === 'button') read.buttons.push({ label: String(p.label || 'Button'), action: String(p.action?.type || (p.href ? 'link' : '')), href: String(p.href || '') });
    else if (type === 'assistant') read.assistants.push({ title: String(p.title || 'Assistant'), floating: p.floating === true, welcome: String(p.welcome || '') });
    else if (type === 'list') read.lists += 1;
    else if (type === 'display') read.displays += 1;
    else if (type === 'section' || type === 'group' || type === 'columns' || type === 'hero') read.sections += 1;
    else if (type === 'image' || type === 'video' || type === 'gallery') read.media += 1;
    else if (type === 'heading' || type === 'paragraph' || type === 'text' || type === 'quote') read.textBlocks += 1;
    else if (type) read.other += 1;
    if (p.stateKey) read.stateKeys.add(String(p.stateKey));
    (node.children || []).forEach(c => walk(c, page));
  };
  for (const pg of pages) {
    const kind = String(pg.kind || 'website');
    const before = read.fields.length + read.buttons.length;
    (pg.children || []).forEach(c => walk(c, pg));
    read.pages.push({ title: String(pg.title || pg.slug || 'Page'), kind, blocks: countNodes(pg.children || []), interactive: read.fields.length + read.buttons.length - before });
  }
  for (const r of (Array.isArray(d.requests) ? d.requests : [])) read.requests.push({ name: String(r.name || 'request'), method: String(r.method || (r.kind === 'webhook' ? 'HOOK' : 'GET')).toUpperCase(), kind: String(r.kind || 'api'), host: hostOf(r.url) });
  const m = d.module && typeof d.module === 'object' ? d.module : {};
  for (const s of (Array.isArray(m.settings) ? m.settings : [])) read.settings.push({ key: String(s.key || ''), label: String(s.label || s.key || ''), type: String(s.type || 'text') });
  const th = d.theme || d.design || null;
  if (th && typeof th === 'object') read.theme = { font: String(th.font || th.fontBody || th.fonts?.body || ''), accent: String(th.accent || th.colors?.accent || '') };
  read.stateKeys = [...read.stateKeys];
  return read;
}
function countNodes(list) { let n = 0; const walk = (x) => { if (!x || typeof x !== 'object') return; n += 1; (x.children || []).forEach(walk); }; list.forEach(walk); return n; }
function hostOf(u) { try { return new URL(String(u || '')).host; } catch { return ''; } }

/** The read as the card shows it: sentences first, then the parts as a grid. */
export function logicHtml(read, { manifest = null } = {}) {
  const r = read || readProject(null);
  const m = manifest || {};
  const doors = Array.isArray(m.doors) ? m.doors : [];
  const sent = r.buttons.filter(b => b.action === 'submit').length;
  const parts = [];
  if (r.fields.length) {
    const req = r.fields.filter(f => f.required).length;
    parts.push(`A form with <b>${r.fields.length} field${r.fields.length === 1 ? '' : 's'}</b>${req ? `, ${req} of them required` : ''}${sent ? `, and a button that sends it through the platform's submissions door` : ''}.`);
  }
  if (r.assistants.length) parts.push(`<b>An assistant</b>${r.assistants[0].floating ? ' as a floating launcher' : ' in the page'} that answers visitors from the installer's own knowledge${doors.includes('submissions') || r.fields.length ? ' and can send the form for them' : ''}.`);
  const api = r.requests.filter(x => x.kind !== 'webhook').length, hooks = r.requests.length - api;
  if (r.requests.length) parts.push(`It makes <b>${api ? `${api} API call${api === 1 ? '' : 's'}` : ''}${api && hooks ? ' and ' : ''}${hooks ? `${hooks} webhook${hooks === 1 ? '' : 's'}` : ''}</b> (${[...new Set(r.requests.map(x => x.host).filter(Boolean))].map(esc).join(', ') || 'to the platform'}).`);
  if (r.lists || r.displays) parts.push(`It keeps state in the visitor's browser: ${[r.lists ? `${r.lists} list${r.lists === 1 ? '' : 's'}` : '', r.displays ? `${r.displays} live value${r.displays === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}.`);
  if (!parts.length) parts.push(r.pages.length ? `${r.pages.length} page${r.pages.length === 1 ? '' : 's'} of content, no forms or calls.` : 'The build carries no project file to read; the element is what it ships.');
  const fieldRows = r.fields.map(f => `<li><b>${esc(f.label)}</b>${f.required ? '<span class="bd-req" title="Required">*</span>' : ''}<span>${esc(KIND_WORDS[f.kind] || f.kind)}${f.options ? `, ${f.options} option${f.options === 1 ? '' : 's'}` : ''}${f.when ? `, shown when <code>${esc(f.when)}</code> is on` : ''}</span></li>`).join('');
  const buttonRows = r.buttons.map(b => `<li><b>${esc(b.label)}</b><span>${esc(ACTION_WORDS[b.action] || (b.action === 'link' ? `opens ${b.href}` : 'does nothing on its own'))}</span></li>`).join('');
  const reqRows = r.requests.map(x => `<li><b>${esc(x.method)} ${esc(x.name)}</b><span>${x.kind === 'webhook' ? 'fire and forget' : 'the answer comes back'}${x.host ? `, ${esc(x.host)}` : ''}</span></li>`).join('');
  const tiles = [
    ['Pages', String(r.pages.length)], ['Blocks', String(r.pages.reduce((s, p) => s + p.blocks, 0))], ['Fields', String(r.fields.length)], ['Buttons', String(r.buttons.length)],
    ['Assistants', String(r.assistants.length)], ['API calls', String(r.requests.length)], ['Settings', String(r.settings.length)], ['State keys', String(r.stateKeys.length)]
  ].filter(([, v]) => v !== '0');
  return `
    <p class="bd-logic-p">${parts.join(' ')}</p>
    <div class="bd-tiles">${tiles.map(([k, v]) => `<div class="bd-tile"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>
    ${fieldRows ? `<h4 class="bd-h4">The fields</h4><ul class="bd-parts">${fieldRows}</ul>` : ''}
    ${buttonRows ? `<h4 class="bd-h4">The buttons</h4><ul class="bd-parts">${buttonRows}</ul>` : ''}
    ${reqRows ? `<h4 class="bd-h4">The calls</h4><ul class="bd-parts">${reqRows}</ul>` : ''}`;
}

/** The manifest alone, when a build carries no project file: the same shape of sentence from what it declares. */
export function manifestRead(manifest) {
  const m = manifest || {};
  const fields = [];
  for (const a of (Array.isArray(m.actions) ? m.actions : [])) for (const p of (Array.isArray(a.params) ? a.params : [])) fields.push({ key: p.key, label: p.label || p.key, kind: p.type || 'text', required: p.required === true, when: '', options: 0 });
  return { pages: [], fields, buttons: [], assistants: (Array.isArray(m.doors) && m.doors.includes('assistant')) ? [{ title: 'Assistant', floating: false }] : [], lists: 0, displays: 0, sections: 0, media: 0, textBlocks: 0, other: 0, requests: [], settings: Array.isArray(m.settings) ? m.settings : [], stateKeys: [], theme: null };
}
