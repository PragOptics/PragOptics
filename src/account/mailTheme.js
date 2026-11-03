// src/account/mailTheme.js
//
// THE LOOK OF A SITE'S MAIL (2026-11-03; the plan _local/BUILD-PLAN-2026-11-03.md D7, D8). Every message a mailer sends
// for a site (the team's copy, the submitter's confirmation, the approval links, the test) is framed by the backend in
// that site's look: its name or logo, its colour on the rule and the buttons, its font, its footer words. The frame is
// drawn ONCE, on the server (auth/siteMailFrame.js); the Mail card shows the real frame in a sandboxed preview and never
// draws a second one. This module is the pure part: the theme's shape, the same checks the server makes so a refusal is
// said before the request leaves, and the words the card says about where a look comes from. No DOM, no fetch.
//
//   GET    v1/environment/publish/{slug}/theme          { theme, source: 'site' | 'environment' | 'default' }
//   PUT    v1/environment/publish/{slug}/theme          the fields below; the owner's look (derived: false)
//   DELETE v1/environment/publish/{slug}/theme          back to the website's look (derived) or the default
//   GET    v1/environment/publish/{slug}/theme/preview  text/html, the framed sample
//
// Precedence (D7): a look the owner set beats one derived from the website at publish, which beats the default.

export const FONTS = Object.freeze(['system', 'serif', 'mono', 'sans']);
export const FONT_WORDS = Object.freeze({ system: 'The reader\'s own', serif: 'Serif', mono: 'Monospace', sans: 'Sans serif' });
export const DEFAULT_THEME = Object.freeze({ brandName: '', logoUrl: '', primaryColor: '#6e3cc6', background: '#ffffff', textColor: '#1d1b26', fontFamily: 'system', footerWords: '', derived: false });
export const MIN_CONTRAST = 4.5;
const FIELDS = ['brandName', 'logoUrl', 'primaryColor', 'background', 'textColor', 'fontFamily', 'footerWords'];
const WORDS = { brandName: 'The name', logoUrl: 'The logo', primaryColor: 'The colour', background: 'The background', textColor: 'The text colour', fontFamily: 'The font', footerWords: 'The footer' };

/** A colour as #rrggbb (lower), from #rgb or #rrggbb; '' for anything else. */
export function hexOf(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return '';
}

/** WCAG contrast between two #rrggbb colours (1 to 21); 0 when either is not a colour. */
export function contrastRatio(a, b) {
  const lum = (hex) => {
    const h = hexOf(hex);
    if (!h) return -1;
    const ch = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const la = lum(a), lb = lum(b);
  if (la < 0 || lb < 0) return 0;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** A site row's theme as the card holds it: the fields with the defaults filled, and whether the website set it. */
export function themeOf(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  return {
    brandName: String(t.brandName || '').slice(0, 80),
    logoUrl: /^https:\/\//i.test(String(t.logoUrl || '')) ? String(t.logoUrl) : '',
    primaryColor: hexOf(t.primaryColor) || DEFAULT_THEME.primaryColor,
    background: hexOf(t.background) || DEFAULT_THEME.background,
    textColor: hexOf(t.textColor) || DEFAULT_THEME.textColor,
    fontFamily: FONTS.includes(String(t.fontFamily || '').toLowerCase()) ? String(t.fontFamily).toLowerCase() : 'system',
    footerWords: String(t.footerWords || '').slice(0, 300),
    derived: t.derived === true,
    updatedAt: t.updatedAt || null, updatedBy: String(t.updatedBy || '')
  };
}

/** Where a site's look comes from, from the theme route's answer or the publish list: 'site' (set by the owner), 'website' (derived at publish), 'environment', 'default'. */
export function sourceOf(answer) {
  const src = String(answer && answer.source || '').toLowerCase();
  const t = answer && answer.theme && typeof answer.theme === 'object' ? answer.theme : (answer && answer.mailTheme && typeof answer.mailTheme === 'object' ? answer.mailTheme : null);
  if (src === 'site' || (!src && t)) return t && t.derived === true ? 'website' : 'site';
  if (src === 'environment') return 'environment';
  return 'default';
}

/**
 * The same checks the server makes (validTheme) so the card refuses before the request: colours as #rrggbb, the font
 * from the list, the logo https or empty, the name under 80 and the footer under 300 plain characters, and the text
 * readable on the background (contrast 4.5 or more). Answers { ok, theme, errors: { field: words } }.
 */
export function validTheme(input) {
  const t = input && typeof input === 'object' ? input : {};
  const errors = {};
  const theme = {};
  theme.brandName = String(t.brandName == null ? '' : t.brandName).trim().replace(/\s+/g, ' ');
  if (theme.brandName.length > 80) errors.brandName = `${WORDS.brandName} is at most 80 characters.`;
  theme.logoUrl = String(t.logoUrl == null ? '' : t.logoUrl).trim();
  if (theme.logoUrl && !/^https:\/\/\S+$/i.test(theme.logoUrl)) errors.logoUrl = `${WORDS.logoUrl} is a web address that starts with https://, or empty.`;
  for (const k of ['primaryColor', 'background', 'textColor']) {
    const h = hexOf(t[k]);
    if (!h) errors[k] = `${WORDS[k]} is a colour such as #6e3cc6.`;
    theme[k] = h || DEFAULT_THEME[k];
  }
  const f = String(t.fontFamily == null ? 'system' : t.fontFamily).trim().toLowerCase();
  if (!FONTS.includes(f)) errors.fontFamily = `${WORDS.fontFamily} is one of ${FONTS.join(', ')}.`;
  theme.fontFamily = FONTS.includes(f) ? f : 'system';
  theme.footerWords = String(t.footerWords == null ? '' : t.footerWords).replace(/<[^>]*>/g, '').trim();
  if (theme.footerWords.length > 300) errors.footerWords = `${WORDS.footerWords} is at most 300 characters.`;
  if (!errors.textColor && !errors.background) {
    const c = contrastRatio(theme.textColor, theme.background);
    if (c < MIN_CONTRAST) errors.textColor = `The text colour and the background are too close to read (${c.toFixed(1)} to 1; 4.5 or more is needed). Pick a darker text or a lighter background.`;
  }
  return { ok: !Object.keys(errors).length, theme, errors };
}

/** The body of a PUT: the seven fields and nothing else (the server sets derived: false and the stamps). */
export function themeBody(theme) {
  const t = themeOf(theme);
  const out = {};
  for (const k of FIELDS) out[k] = t[k];
  return out;
}

/** The words under a site's name on the card, from where its look comes. */
export function themeWords(source) {
  if (source === 'site') return 'The look you set. Every mail this site sends is framed in it.';
  if (source === 'website') return 'Follows the website: its name, colour and logo, read again at every publish.';
  if (source === 'environment') return 'The look set for the environment, shared by every site without one of its own.';
  return 'The default look, named after your organization. Publish the website and the mail takes its colours; or set a look here.';
}

/** The tag beside a site's name: one word for where its look comes from. */
export function themeTag(source) {
  if (source === 'site') return { word: 'set by you', cls: 'is-primary' };
  if (source === 'website') return { word: 'follows the website', cls: 'is-verified' };
  if (source === 'environment') return { word: 'the environment\'s', cls: '' };
  return { word: 'default look', cls: '' };
}
