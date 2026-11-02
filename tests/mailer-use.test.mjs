// tests/mailer-use.test.mjs: which form sends from which mailer (src/account/mailerUse.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { takesMail, tableOf, formsOf, resolvedMailer, formsFor } from '../src/account/mailerUse.js';

const form = (installId, name, settings = {}, doors = ['submissions'], table) => ({ installId, name, buildName: name, enabled: true, manifest: { doors, ...(table ? { table } : {}) }, settings });
const mailers = [{ address: 'forms@bridgesindust.com' }, { address: 'reviews@bridgesindust.com' }];

test('an install takes mail only when its doors include submissions (the studio\'s rule)', () => {
  assert.equal(takesMail({ doors: ['submissions'] }), true);
  assert.equal(takesMail({ doors: ['items'] }), false);
  assert.equal(takesMail(null), false);
  assert.equal(takesMail({}), false);
});

test('the table is the manifest\'s, else the setting\'s, else submissions (the public door\'s rule)', () => {
  assert.equal(tableOf(form('a', 'Contact', {}, ['submissions'], 'contacts')), 'contacts');
  assert.equal(tableOf(form('a', 'Contact', { table: 'inbox' })), 'inbox');
  assert.equal(tableOf(form('a', 'Contact')), 'submissions');
  assert.equal(tableOf(null), 'submissions');
});

test('formsOf keeps the mailing installs with their name, table, pick and switch; it takes the list or the whole answer', () => {
  const modules = [form('f1', 'Contact', { mailer: 'Forms@Bridgesindust.com' }, ['submissions'], 'contacts'), form('f2', 'Reviews', {}, ['submissions', 'items'], 'reviews'), { installId: 'x', name: 'Photos', manifest: { doors: ['items'] }, settings: {} }, { ...form('f3', 'Partners', {}, ['submissions'], 'partners'), enabled: false }];
  const out = formsOf({ modules });
  assert.deepEqual(out.map(f => [f.installId, f.name, f.table, f.mailer, f.enabled]), [['f1', 'Contact', 'contacts', 'forms@bridgesindust.com', true], ['f2', 'Reviews', 'reviews', '', true], ['f3', 'Partners', 'partners', '', false]]);
  assert.deepEqual(formsOf(modules).length, 3);
  assert.deepEqual(formsOf(null), []);
  // the form's own people and switch (2026-11-02): read as set, so the card can say when a form differs from its mailer
  const own = formsOf([form('f1', 'Contact', { notify_to: ['Ops@site.test', ''], confirm_visitor: 'false' }), form('f2', 'Reviews', { confirm_visitor: true }), form('f3', 'Partners', {})]);
  assert.deepEqual(own.map(f => [f.notifyTo, f.confirmVisitor]), [[['ops@site.test'], false], [[], true], [[], null]]);
});

test('a form\'s mailer resolves as the server does: its own pick when held, else the default', () => {
  assert.equal(resolvedMailer({ mailer: 'reviews@bridgesindust.com' }, mailers, 'forms@bridgesindust.com'), 'reviews@bridgesindust.com');
  assert.equal(resolvedMailer({ mailer: '' }, mailers, 'forms@bridgesindust.com'), 'forms@bridgesindust.com');
  assert.equal(resolvedMailer({ mailer: 'gone@bridgesindust.com' }, mailers, 'forms@bridgesindust.com'), 'forms@bridgesindust.com', 'a mailbox that left falls to the default');
  assert.equal(resolvedMailer({ mailer: '' }, [], ''), '', 'no mailer: nothing sends');
});

test('formsFor splits a mailer\'s forms into the ones that name it and the ones that fall to it by default', () => {
  const forms = formsOf([form('f1', 'Contact', { mailer: 'forms@bridgesindust.com' }), form('f2', 'Break-ins', {}), form('f3', 'Reviews', { mailer: 'reviews@bridgesindust.com' }), form('f4', 'Partners', { mailer: 'gone@bridgesindust.com' })]);
  const a = formsFor('forms@bridgesindust.com', forms, mailers, 'forms@bridgesindust.com');
  assert.deepEqual(a.explicit.map(f => f.name), ['Contact']);
  assert.deepEqual(a.byDefault.map(f => f.name), ['Break-ins', 'Partners']);
  const b = formsFor('reviews@bridgesindust.com', forms, mailers, 'forms@bridgesindust.com');
  assert.deepEqual(b.explicit.map(f => f.name), ['Reviews']);
  assert.deepEqual(b.byDefault, []);
  assert.deepEqual(formsFor('FORMS@bridgesindust.com', forms, mailers, 'forms@bridgesindust.com').explicit.length, 1, 'case does not matter');
});
