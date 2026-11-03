// tests/mail-theme.test.mjs: the look of a site's mail, the pure part (src/account/mailTheme.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { FONTS, DEFAULT_THEME, MAX_LOGO, hexOf, contrastRatio, themeOf, sourceOf, validTheme, themeBody, themeChanges, themeAfterSave, siteGoneWords, themeWords, themeTag } from '../src/account/mailTheme.js';

test('a colour is #rrggbb, from #rgb too; anything else is nothing', () => {
  assert.equal(hexOf('#6E3CC6'), '#6e3cc6'); assert.equal(hexOf('#fff'), '#ffffff');
  assert.equal(hexOf('red'), ''); assert.equal(hexOf('#12345'), ''); assert.equal(hexOf(null), '');
});

test('contrast is WCAG\'s: black on white 21, white on white 1, the default text on the default background readable', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#ffffff', '#fff'), 1);
  assert.ok(contrastRatio(DEFAULT_THEME.textColor, DEFAULT_THEME.background) > 4.5);
  assert.equal(contrastRatio('x', '#ffffff'), 0);
});

test('a site row\'s theme fills the defaults and keeps only what is valid', () => {
  const t = themeOf({ brandName: 'Bridges', logoUrl: 'http://x/logo.png', primaryColor: '#abc', fontFamily: 'Serif', derived: true, updatedBy: 'u1' });
  assert.deepEqual([t.brandName, t.logoUrl, t.primaryColor, t.background, t.textColor, t.fontFamily, t.footerWords, t.derived, t.updatedBy], ['Bridges', '', '#aabbcc', '#ffffff', '#1d1b26', 'serif', '', true, 'u1']);
  const d = themeOf(null);
  assert.deepEqual([d.primaryColor, d.fontFamily, d.derived], [DEFAULT_THEME.primaryColor, 'system', false]);
  assert.deepEqual([...FONTS], ['system', 'serif', 'mono', 'sans']);
});

test('where a look comes from: the owner\'s, the website\'s, the environment\'s, the default; from the route or the publish list', () => {
  assert.equal(sourceOf({ source: 'site', theme: { derived: false } }), 'site');
  assert.equal(sourceOf({ source: 'site', theme: { derived: true } }), 'website');
  assert.equal(sourceOf({ source: 'environment', theme: {} }), 'environment');
  assert.equal(sourceOf({ source: 'default', theme: {} }), 'default');
  assert.equal(sourceOf({ slug: 'root', mailTheme: { derived: true } }), 'website', 'the publish list carries mailTheme and no source');
  assert.equal(sourceOf({ slug: 'root', mailTheme: { derived: false } }), 'site');
  assert.equal(sourceOf({ slug: 'root' }), 'default');
  assert.equal(sourceOf(null), 'default');
});

test('the same checks the server makes: colours, font, https logo, lengths, contrast named by field', () => {
  const good = validTheme({ brandName: '  Bridges  Industrial ', logoUrl: 'https://x/logo.png', primaryColor: '#6E3CC6', background: '#fff', textColor: '#1d1b26', fontFamily: 'sans', footerWords: 'Sent by <b>Bridges</b>' });
  assert.equal(good.ok, true);
  assert.deepEqual(good.theme, { brandName: 'Bridges Industrial', logoUrl: 'https://x/logo.png', primaryColor: '#6e3cc6', background: '#ffffff', textColor: '#1d1b26', fontFamily: 'sans', footerWords: 'Sent by Bridges' });
  const bad = validTheme({ brandName: 'x'.repeat(81), logoUrl: 'http://x/logo.png', primaryColor: 'purple', background: '#ffffff', textColor: '#1d1b26', fontFamily: 'comic', footerWords: 'y'.repeat(301) });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['brandName', 'fontFamily', 'footerWords', 'logoUrl', 'primaryColor']);
  const dim = validTheme({ primaryColor: '#6e3cc6', background: '#ffffff', textColor: '#eeeeee', fontFamily: 'system' });
  assert.equal(dim.ok, false);
  assert.match(dim.errors.textColor, /too close to read/);
  assert.match(dim.errors.textColor, /4\.5 or more/);
  assert.equal(validTheme(null).ok, false, 'nothing is not a theme: the colours are missing');
});

test('the logo as the server takes it: https, at most 500 characters, no space, quote, angle bracket or backslash', () => {
  const ok = (logoUrl) => !validTheme({ ...DEFAULT_THEME, logoUrl }).errors.logoUrl;
  assert.equal(MAX_LOGO, 500);
  assert.equal(ok(''), true, 'empty is the name alone');
  assert.equal(ok('https://bridgesindust.com/logo.png'), true);
  assert.equal(ok(`https://x.co/${'a'.repeat(MAX_LOGO - 'https://x.co/'.length)}`), true, 'exactly 500 passes');
  assert.equal(ok(`https://x.co/${'a'.repeat(MAX_LOGO)}`), false, 'over 500 is refused before the request');
  for (const bad of ['http://x.co/l.png', 'https://x.co/a b.png', 'https://x.co/"l.png', "https://x.co/l'.png", 'https://x.co/<l>.png', 'https://x.co/l\\.png', 'javascript:alert(1)']) assert.equal(ok(bad), false, bad);
  assert.match(validTheme({ ...DEFAULT_THEME, logoUrl: 'https://x.co/"' }).errors.logoUrl, /at most 500 characters/);
});

test('the Save sends only what the owner changed: the filled-in name and footer stay unsent, a cleared one goes as empty', () => {
  // the GET answers the look made whole: the organization's name and the default footer in the blanks
  const loaded = themeOf({ brandName: 'Bridges Industrial', logoUrl: '', primaryColor: '#6e3cc6', background: '#ffffff', textColor: '#1d1b26', fontFamily: 'system', footerWords: 'Sent by Bridges Industrial', derived: true });
  const colour = validTheme({ ...loaded, primaryColor: '#0a7d3b' });
  assert.deepEqual(themeChanges(loaded, colour.theme), { primaryColor: '#0a7d3b' }, 'only the colour, never the filled-in words');
  assert.deepEqual(themeChanges(loaded, validTheme({ ...loaded }).theme), {}, 'nothing changed: an empty body still makes the look the owner\'s');
  assert.deepEqual(themeChanges(loaded, validTheme({ ...loaded, brandName: '', footerWords: 'Thanks from Bridges' }).theme), { brandName: '', footerWords: 'Thanks from Bridges' });
  assert.deepEqual(themeChanges(loaded, validTheme({ ...loaded, primaryColor: '#6E3CC6', brandName: '  Bridges   Industrial ' }).theme), {}, 'the same values written another way are not a change');
  assert.deepEqual(Object.keys(themeChanges(themeOf(null), validTheme({ ...DEFAULT_THEME, fontFamily: 'serif', logoUrl: 'https://x.co/l.png' }).theme)).sort(), ['fontFamily', 'logoUrl']);
});

test('after a Save the card keeps the filled-in words it did not send, and keeps a field the owner cleared cleared', () => {
  const prev = themeOf({ brandName: 'Bridges Industrial', footerWords: 'Sent by Bridges Industrial', primaryColor: '#6e3cc6' });
  // the server answers the look as stored: blank name and footer, the new colour, derived false
  const stored = { brandName: '', logoUrl: '', primaryColor: '#0a7d3b', background: '#ffffff', textColor: '#1d1b26', fontFamily: 'system', footerWords: '', derived: false };
  const got = themeAfterSave(prev, { primaryColor: '#0a7d3b' }, stored);
  assert.deepEqual([got.brandName, got.footerWords, got.primaryColor, got.derived], ['Bridges Industrial', 'Sent by Bridges Industrial', '#0a7d3b', false]);
  assert.deepEqual(themeChanges(got, validTheme({ ...got }).theme), {}, 'the next Save compares against the same words and sends nothing of them');
  const cleared = themeAfterSave(prev, { brandName: '' }, { ...stored, primaryColor: '#6e3cc6' });
  assert.equal(cleared.brandName, '', 'a name the owner cleared stays cleared');
  assert.equal(cleared.footerWords, '', 'the old footer named the old name; the mail reads the organization\'s, which the card does not know, so the field is left blank for its placeholder');
  const own = themeAfterSave(prev, {}, { ...stored, brandName: 'Bridges', footerWords: 'From the shop' });
  assert.deepEqual([own.brandName, own.footerWords], ['Bridges', 'From the shop'], 'stored words win');
  assert.equal(themeAfterSave(null, null, null).primaryColor, DEFAULT_THEME.primaryColor);
});

test('a Save that changes the name builds the filled-in footer again from the new name, as the server does for the mail', () => {
  // the default look: the GET filled the name and the footer; the owner renames the site and sends { brandName } only
  const prev = themeOf({ brandName: 'Bridges Industrial', footerWords: 'Sent by Bridges Industrial from bridgesindust.com' });
  const stored = { brandName: 'Bridges', footerWords: '', derived: false };
  const got = themeAfterSave(prev, { brandName: 'Bridges' }, stored);
  assert.deepEqual([got.brandName, got.footerWords], ['Bridges', 'Sent by Bridges from bridgesindust.com'], 'the new name and the same host, never the old name');
  assert.deepEqual(themeChanges(got, validTheme({ ...got }).theme), {}, 'the next Save still leaves the footer unsent');
  assert.equal(themeAfterSave(themeOf({ brandName: 'Bridges Industrial', footerWords: 'Sent by Bridges Industrial' }), { brandName: 'Bridges' }, stored).footerWords, 'Sent by Bridges', 'no host: the name alone');
  assert.equal(themeAfterSave(themeOf({ brandName: '', footerWords: 'Sent from bridgesindust.com' }), { brandName: 'Bridges' }, stored).footerWords, 'Sent by Bridges from bridgesindust.com', 'no name before: the host it named');
  assert.equal(themeAfterSave(themeOf({ brandName: 'Bridges Industrial', footerWords: 'Thanks from us' }), { brandName: 'Bridges' }, stored).footerWords, '', 'words that are not the default ones: blank, the placeholder speaks');
  // the owner's own footer words stored, or the footer sent in the same Save: the answer's words stand
  assert.equal(themeAfterSave(prev, { brandName: 'Bridges' }, { ...stored, footerWords: 'From the shop' }).footerWords, 'From the shop');
  assert.equal(themeAfterSave(prev, { brandName: 'Bridges', footerWords: '' }, stored).footerWords, '', 'a footer the owner cleared in the same Save stays cleared');
});

test('a site the theme routes no longer know says so and where to look', () => {
  assert.equal(siteGoneWords('bridgesindust.com'), 'bridgesindust.com is no longer published. Reload the tab to see your sites as they are now.');
  assert.match(siteGoneWords(''), /^This site is no longer published\./);
  assert.ok(!/PragOptics|—/.test(siteGoneWords('x')));
});

test('the PUT body is the seven fields and nothing else', () => {
  const b = themeBody({ brandName: 'B', logoUrl: 'https://x/l.png', primaryColor: '#123456', background: '#ffffff', textColor: '#000000', fontFamily: 'mono', footerWords: 'F', derived: true, updatedAt: 'x', junk: 1 });
  assert.deepEqual(Object.keys(b), ['brandName', 'logoUrl', 'primaryColor', 'background', 'textColor', 'fontFamily', 'footerWords']);
  assert.equal(b.fontFamily, 'mono');
});

test('the words and the tag for each source', () => {
  assert.match(themeWords('site'), /^The look you set/); assert.match(themeWords('website'), /^Follows the website/);
  assert.match(themeWords('environment'), /environment/); assert.match(themeWords('default'), /^The default look/);
  assert.deepEqual(themeTag('site'), { word: 'set by you', cls: 'is-primary' });
  assert.deepEqual(themeTag('website'), { word: 'follows the website', cls: 'is-verified' });
  assert.equal(themeTag('nope').word, 'default look');
  for (const s of ['site', 'website', 'environment', 'default']) assert.ok(!/PragOptics/.test(themeWords(s)), 'nothing of PragOptics in the words');
});
