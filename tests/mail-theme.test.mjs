// tests/mail-theme.test.mjs: the look of a site's mail, the pure part (src/account/mailTheme.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { FONTS, DEFAULT_THEME, hexOf, contrastRatio, themeOf, sourceOf, validTheme, themeBody, themeWords, themeTag } from '../src/account/mailTheme.js';

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
