// The Write to us dialog wears the Report a site dialog's classes and nothing the stylesheets do not know (2026-11-15).
import test from 'node:test';
import assert from 'node:assert/strict';
import { formHtml, doneHtml, fallbackHtml, contactFields, looksLikeEmail } from '../src/components/contactForm.js';

const KNOWN = ['acct-modal-mask', 'acct-modal', 'acct-report', 'acct-report-head', 'acct-modal-h', 'acct-modal-note', 'acct-label', 'acct-input', 'acct-textarea', 'acct-error', 'acct-modal-actions', 'btn', 'btn-ghost', 'cta', 'muted', 'acct-report-ref', 'acct-product-code', 'acct-inline-link'];
const classesOf = (html) => [...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean);

test('the form, the sent state and the fallback use only classes the stylesheets know', () => {
  for (const html of [formHtml({ about: 'Order 12' }), doneHtml('CM-TEST01', 'a@b.co'), fallbackHtml('Lost second factor')]) {
    for (const c of classesOf(html)) assert.ok(KNOWN.includes(c), `unknown class ${c}`);
    assert.ok(html.includes('acct-modal-mask'), 'the mask');
    assert.ok(html.includes('acct-modal-actions'), 'the actions row');
    assert.ok(!/acct-modal-head|acct-modal-x|acct-modal-title|acct-card-note|acct-field/.test(html), 'none of the first cut\'s names');
  }
});

test('the form carries the three fields, the hidden field and the about line; the sent state the reference and the address', () => {
  const f = formHtml({ email: 'x@y.co', about: 'Order 7' });
  for (const id of ['cfName', 'cfEmail', 'cfMessage', 'cfWebsite', 'cfError']) assert.ok(f.includes(`id="${id}"`), id);
  assert.ok(f.includes('About: <strong>Order 7</strong>'));
  assert.ok(f.includes('value="x@y.co"'));
  const d = doneHtml('CM-ABC123', 'who@where.io');
  assert.ok(d.includes('CM-ABC123') && d.includes('who@where.io'));
});

test('the fields trim and cap, and the email check is loose', () => {
  const f = contactFields({ name: '  Ada ', email: ' a@b.co ', message: ' hi there ', page: '#x' });
  assert.deepEqual(f, { email: 'a@b.co', message: 'hi there', name: 'Ada', page: '#x' });
  assert.equal(contactFields({ email: 'a@b.co', message: 'm'.repeat(5000) }).message.length, 4000);
  assert.ok(looksLikeEmail('a@b.co') && !looksLikeEmail('nope'));
});
