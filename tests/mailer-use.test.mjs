// tests/mailer-use.test.mjs: which form sends from which mailer (src/account/mailerUse.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { takesMail, tableOf, formsOf, resolvedMailer, formsFor, moderates, intentOf, approversOf, recipientSetting, recipientHold } from '../src/account/mailerUse.js';

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
  // the older one-address `recipient` counts among the form's people and is kept on its own, so a Save can clear it
  const [older] = formsOf([form('f1', 'Contact', { recipient: ' Sales@Site.test ', notify_to: ['ops@site.test'] })]);
  assert.deepEqual([older.notifyTo, older.recipient], [['sales@site.test', 'ops@site.test'], 'sales@site.test']);
  assert.equal(formsOf([form('f2', 'Contact', { recipient: 'not an address' })])[0].recipient, '');
  assert.equal(formsOf([form('f3', 'Contact', {})])[0].recipient, '');
});

test('the older recipient is the manifest\'s own setting: a Save empties it only when \'\' empties it on the server', () => {
  // the server reads '' as not sent (auth/buildsStore.js validSettings, the schema loop): the declared default, or 400 when required
  const decl = (extra) => ({ doors: ['submissions'], settings: [{ key: 'recipient', label: 'Send to', type: 'email', required: false, default: '', ...extra }] });
  assert.equal(recipientHold(decl({})), '', 'optional, no default: \'\' empties it');
  assert.equal(recipientHold(decl({ required: true })), 'required', 'the backend\'s own fixture: required, so \'\' is refused');
  assert.equal(recipientHold(decl({ default: 'sales@site.test' })), 'default', 'a default: \'\' brings it back');
  assert.equal(recipientHold(decl({ required: true, default: 'sales@site.test' })), 'default', 'required with a default: \'\' takes the default');
  assert.equal(recipientHold({ doors: ['submissions'] }), '', 'not declared: any save drops it');
  assert.equal(recipientHold(null), '');
  assert.deepEqual(recipientSetting(decl({ required: true })), { key: 'recipient', label: 'Send to', type: 'email', required: true, default: '' });
  assert.equal(recipientSetting({ settings: [{ key: 'other' }] }), null);
  const fixed = { installId: 'f1', name: 'Contact', manifest: decl({ required: true }), settings: { recipient: 'Sales@Site.test' } };
  const [f] = formsOf([fixed]);
  assert.deepEqual([f.recipient, f.recipientHold, f.recipientLabel], ['sales@site.test', 'required', 'Send to']);
  const [none] = formsOf([{ ...fixed, settings: {} }]);
  assert.deepEqual([none.recipient, none.recipientHold, none.recipientLabel], ['', '', ''], 'no older recipient stored: nothing held');
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

test('rows wait for a decision as the server rules it: the manifest says so unless the setting is off, the setting turns it on, a reader door waits by default', () => {
  assert.equal(moderates({ manifest: { moderate: true }, settings: {} }), true);
  assert.equal(moderates({ manifest: { moderate: true }, settings: { moderate: false } }), false);
  assert.equal(moderates({ manifest: { doors: ['submissions'] }, settings: { moderate: 'true' } }), true);
  assert.equal(moderates({ manifest: { doors: ['submissions', 'reader'] }, settings: {} }), true);
  assert.equal(moderates({ manifest: { doors: ['submissions', 'reader'] }, settings: { moderate: 'false' } }), false);
  assert.equal(moderates({ manifest: { doors: ['submissions'] }, settings: {} }), false);
  assert.equal(moderates(null), false);
});

test('the intent word is the owner\'s setting over the manifest\'s, in the plan\'s alphabet; the new settings read empty on an older lane', () => {
  assert.equal(intentOf({ manifest: { intent: 'review' }, settings: {} }), 'review');
  assert.equal(intentOf({ manifest: { intent: 'review' }, settings: { intent: 'Quote-Request' } }), 'quote-request');
  assert.equal(intentOf({ manifest: {}, settings: { intent: 'not a word' } }), '');
  assert.equal(intentOf({}), '');
  const [f] = formsOf([form('f1', 'Reviews', { notify_roles: ['Admin', 'agent'], approvers: ['developer', 'Ops@site.test'], intent: 'review', moderate: true }, ['submissions', 'reader'])]);
  assert.deepEqual([f.notifyRoles, f.approvers, f.approversFrom, f.intent, f.waits], [['admin'], ['developer', 'ops@site.test'], 'setting', 'review', true]);
  const [g] = formsOf([{ ...form('f2', 'Contact'), manifest: { doors: ['submissions'], approvers: ['admin', 'agent'] } }]);
  assert.deepEqual([g.notifyRoles, g.approvers, g.approversFrom, g.intent, g.waits], [[], ['admin'], 'manifest', '', false], 'no setting: the manifest\'s default approvers, roles only');
  const [h] = formsOf([form('f3', 'Partners', { approvers: [] })]);
  assert.deepEqual([h.approvers, h.approversFrom], [[], ''], 'an empty setting and no manifest default: nobody named');
});

test('who decides reads as the backend reads it (auth/approvals.js approversOf): the setting when it names anyone, else the manifest\'s default role words', () => {
  const manifest = { doors: ['submissions'], approvers: ['admin', 'agent', 'nonsense'] };
  // an empty setting falls to the manifest's default, never to "nobody": the owner who unchecks every box gets the module's own default back
  assert.deepEqual(approversOf({ manifest, settings: { approvers: [] } }), { approvers: ['admin'], approversFrom: 'manifest' });
  assert.deepEqual(approversOf({ manifest, settings: {} }), { approvers: ['admin'], approversFrom: 'manifest' });
  assert.deepEqual(approversOf({ manifest, settings: { approvers: ['', null] } }), { approvers: ['admin'], approversFrom: 'manifest' }, 'blank entries count as nothing named');
  // the setting wins whole when it names anyone: roles first, then addresses, lower-cased and once each
  assert.deepEqual(approversOf({ manifest, settings: { approvers: ['Ops@site.test', 'viewer', 'ops@site.test', 'VIEWER'] } }), { approvers: ['viewer', 'ops@site.test'], approversFrom: 'setting' });
  assert.deepEqual(approversOf({ manifest, settings: { approvers: ['dev@site.test'] } }), { approvers: ['dev@site.test'], approversFrom: 'setting' }, 'an address alone is a setting that names someone; the manifest\'s roles do not join it');
  assert.deepEqual(approversOf({ manifest: { doors: ['submissions'] }, settings: { approvers: [] } }), { approvers: [], approversFrom: '' });
  assert.deepEqual(approversOf(null), { approvers: [], approversFrom: '' });
  const [f] = formsOf([{ ...form('f1', 'Reviews', { approvers: [] }), manifest }]);
  assert.deepEqual([f.approvers, f.approversFrom], [['admin'], 'manifest'], 'formsOf carries the same reading');
  // the manifest's default rides beside the setting, so the Mail card can say what an emptied Who decides falls to
  assert.deepEqual(f.approversDefault, ['admin']);
  const [g] = formsOf([{ ...form('f2', 'Reviews', { approvers: ['dev@site.test'] }), manifest }]);
  assert.deepEqual([g.approvers, g.approversFrom, g.approversDefault], [['dev@site.test'], 'setting', ['admin']], 'a setting that names someone still carries the default it would fall to');
  assert.deepEqual(formsOf([form('f3', 'Contact', {})])[0].approversDefault, [], 'no default: none');
});
