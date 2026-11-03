// tests/mail-routing.test.mjs: who a form tells and who decides (src/account/mailRouting.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_WORDS, roleList, emailList, parseApprovers, teamOf, expandRoles, roleCounts, mailerRecord, toldBy, confirmsOf, roleWord, whoWords, decidersOf, decidersWords, namedDecidersWords, formTags, settingsFor, mailerBodyFor, lostWords, recipientHoldWords, approversChanged } from '../src/account/mailRouting.js';

const members = [
  { userId: 'u1', email: 'Owner@Site.test', role: 'owner', status: 'ACTIVE' },
  { userId: 'u2', email: 'ops@site.test', role: 'admin', status: 'ACTIVE' },
  { userId: 'u3', email: 'dev@site.test', role: 'developer', status: 'ACTIVE' },
  { userId: 'u4', email: 'gone@site.test', role: 'admin', status: 'SUSPENDED' },
  { userId: 'u5', email: 'bot@pragoptics.com', role: 'agent', status: 'ACTIVE' },
  { userId: 'u6', email: '', role: 'member', status: 'ACTIVE' }
];
const mailer = { address: 'forms@site.test', displayName: 'Forms', notify: ['ops@site.test'], notifyRoles: ['developer'], confirmVisitor: true };

test('the role words are the five a person may name; agent and junk fall away (D1)', () => {
  assert.deepEqual([...ROLE_WORDS], ['owner', 'admin', 'developer', 'member', 'viewer']);
  assert.deepEqual(roleList(['Admin', 'agent', 'admin', 'x', '', 'viewer']), ['admin', 'viewer']);
  assert.deepEqual(roleList('owner, member'), ['owner', 'member']);
  assert.deepEqual(roleList(null), []);
  assert.deepEqual(emailList(['Ops@Site.test', 'ops@site.test', 'admin', '']), ['ops@site.test']);
  assert.deepEqual(parseApprovers(['admin', 'ops@site.test', 'agent']), { roles: ['admin'], people: ['ops@site.test'] });
});

test('the team a mailer may tell is ACTIVE, with an address, never the agent seat, the owner first', () => {
  assert.deepEqual(teamOf(members).map(m => [m.email, m.role]), [['owner@site.test', 'owner'], ['dev@site.test', 'developer'], ['ops@site.test', 'admin']]);
  assert.deepEqual(teamOf({ members }).length, 3, 'the whole answer works too');
  assert.deepEqual(expandRoles(['admin', 'agent'], members), ['ops@site.test'], 'a role reaches its active holders; agent never expands');
  assert.deepEqual(expandRoles(['owner', 'developer'], members), ['owner@site.test', 'dev@site.test']);
  assert.deepEqual(expandRoles([], members), []);
  assert.deepEqual(roleCounts(members), { owner: 1, admin: 1, developer: 1, member: 0, viewer: 0 });
});

test('a mailer record reads the same whatever the lane knows: roles empty and hasRoles false on an older backend', () => {
  assert.deepEqual(mailerRecord(mailer), { address: 'forms@site.test', displayName: 'Forms', notify: ['ops@site.test'], notifyRoles: ['developer'], confirmVisitor: true, hasRoles: true });
  const old = mailerRecord({ address: 'FORMS@site.test', notify: ['ops@site.test'] });
  assert.deepEqual([old.address, old.notifyRoles, old.confirmVisitor, old.hasRoles], ['forms@site.test', [], true, false]);
  assert.equal(mailerRecord(null), null);
});

test('who is told follows D2: the form\'s own people or roles, else the mailer\'s, else the owner; expanded in D3 order', () => {
  const own = toldBy({ notifyTo: ['sales@site.test'], notifyRoles: ['admin'] }, mailer, members);
  assert.deepEqual(own, { source: 'form', people: ['sales@site.test'], roles: ['admin'], expanded: ['sales@site.test', 'ops@site.test'] });
  const rolesOnly = toldBy({ notifyTo: [], notifyRoles: ['developer'] }, mailer, members);
  assert.equal(rolesOnly.source, 'form'); assert.deepEqual(rolesOnly.expanded, ['dev@site.test']);
  const inherited = toldBy({ notifyTo: [], notifyRoles: [] }, mailer, members);
  assert.deepEqual(inherited, { source: 'mailer', people: ['ops@site.test'], roles: ['developer'], expanded: ['ops@site.test', 'dev@site.test'] });
  const owner = toldBy({}, { address: 'x@site.test', notify: [] }, members);
  assert.deepEqual(owner, { source: 'owner', people: [], roles: [], expanded: [] });
  assert.equal(toldBy({}, null, []).source, 'owner', 'no mailer yet: the owner');
});

test('the submitter\'s confirmation: the form\'s own switch when set, else the mailer\'s, else yes', () => {
  assert.deepEqual(confirmsOf({ confirmVisitor: false }, mailer), { value: false, source: 'form' });
  assert.deepEqual(confirmsOf({ confirmVisitor: null }, { confirmVisitor: false }), { value: false, source: 'mailer' });
  assert.deepEqual(confirmsOf({ confirmVisitor: null }, mailer), { value: true, source: 'mailer' });
  assert.deepEqual(confirmsOf({}, null), { value: true, source: 'default' });
});

test('the words: a role as every holder of it, the owner as the owner, nobody as the owner', () => {
  assert.equal(roleWord('owner'), 'the owner'); assert.equal(roleWord('Admin'), 'every admin');
  assert.equal(whoWords({ people: ['ops@site.test'], roles: ['admin', 'developer'] }), 'ops@site.test, every admin and every developer');
  assert.equal(whoWords({ people: [], roles: ['owner'] }), 'the owner');
  assert.equal(whoWords({}), 'the owner');
  assert.equal(whoWords(mailerRecord(mailer)), 'ops@site.test and every developer', 'a mailer record reads the same way');
  assert.equal(whoWords({ notify: ['a@x.co'], notifyRoles: [] }), 'a@x.co');
});

test('who decides (D5): the form\'s own approvers with the owner always among them, else the roles that hold approve_content', () => {
  const scopes = { admin: ['approve_content', 'assign_mailboxes'], developer: ['request_purchases'], member: [] };
  const named = decidersOf({ approvers: ['developer', 'ops@site.test'] }, members, scopes, 'Owner@Site.test');
  assert.deepEqual(named, { named: true, roles: ['developer'], people: ['ops@site.test'], emails: ['owner@site.test', 'dev@site.test', 'ops@site.test'] });
  assert.equal(decidersWords(named), 'the owner, every developer and ops@site.test');
  const fallback = decidersOf({ approvers: [] }, members, scopes, 'owner@site.test');
  assert.deepEqual(fallback, { named: false, roles: ['admin'], people: [], emails: ['owner@site.test', 'ops@site.test'] });
  assert.equal(decidersWords(fallback), 'the owner and every admin');
  const none = decidersOf({}, [], null, '');
  assert.deepEqual(none, { named: false, roles: [], people: [], emails: [] });
  assert.equal(decidersWords(none), 'the owner');
  assert.equal(decidersWords({ roles: ['owner', 'admin'] }), 'the owner and every admin', 'the owner is said once');
});

test('who decides from the server\'s own list: the owner first as "the owner", then the people its approvers reach today', () => {
  assert.equal(namedDecidersWords(['owner@site.test', 'ops@site.test', 'dev@site.test'], 'Owner@Site.test'), 'the owner, ops@site.test and dev@site.test');
  assert.equal(namedDecidersWords(['ops@site.test', 'owner@site.test'], 'owner@site.test'), 'the owner and ops@site.test', 'the owner leads wherever the server put it');
  assert.equal(namedDecidersWords(['owner@site.test'], 'owner@site.test'), 'the owner');
  assert.equal(namedDecidersWords([], 'owner@site.test'), 'the owner', 'an empty list: the owner, who always decides');
  assert.equal(namedDecidersWords(['Ops@site.test', 'ops@site.test', 'admin'], 'owner@site.test'), 'the owner and ops@site.test', 'addresses only, once each');
  assert.equal(namedDecidersWords(['a@x.co', 'b@x.co'], ''), 'a@x.co and b@x.co', 'without the owner\'s address the addresses are said as they are');
  assert.equal(namedDecidersWords(null, ''), 'the owner');
});

test('a form\'s tags say where it sends from, whether it confirms, whether rows wait, its intent, off', () => {
  const t = formTags({ mailer: '', waits: true, intent: 'review', enabled: false }, { from: 'forms@site.test', confirms: false, dflt: 'forms@site.test' });
  assert.deepEqual(t.map(x => x.word), ['from forms@site.test (the default)', 'no confirmation', 'waits for a decision', 'review', 'off']);
  assert.deepEqual(t.map(x => x.cls), ['', '', 'is-pending', 'is-primary', '']);
  const own = formTags({ mailer: 'forms@site.test', enabled: true }, { from: 'forms@site.test', confirms: true, dflt: 'forms@site.test' });
  assert.deepEqual(own.map(x => x.word), ['from forms@site.test', 'confirms']);
  assert.deepEqual(formTags({}, { from: '', confirms: true })[0], { word: 'no mailer', cls: 'is-bad' });
  // a pick the environment no longer holds sends from the default by fallback (mailerUse.js resolvedMailer): the tag says so
  assert.equal(formTags({ mailer: 'old@site.test' }, { from: 'forms@site.test', confirms: true, dflt: 'forms@site.test' })[0].word, 'from forms@site.test (the default)');
  assert.equal(formTags({ mailer: 'Forms@Site.test' }, { from: 'forms@site.test', confirms: true, dflt: 'forms@site.test' })[0].word, 'from forms@site.test', 'the form\'s own pick, whatever its case, is not "the default"');
  assert.equal(formTags({ mailer: 'reviews@site.test' }, { from: 'reviews@site.test', confirms: true, dflt: 'forms@site.test' })[0].word, 'from reviews@site.test');
  // the mailers unread (a viewer): the tag names the form's own pick or "its mailer", never "no mailer"
  assert.deepEqual(formTags({ mailer: '' }, { from: '', confirms: true, unknown: true })[0], { word: 'from its mailer', cls: '' });
  assert.deepEqual(formTags({ mailer: 'reviews@site.test' }, { from: '', confirms: true, unknown: true })[0], { word: 'from reviews@site.test', cls: '' });
});

test('one Save, one settings body: the mailer, the people, the roles, the switch, the approvers in one list', () => {
  assert.deepEqual(settingsFor({ mailer: 'Forms@Site.test', people: ['Ops@site.test', 'ops@site.test'], roles: ['admin', 'agent'], confirm: 'true', approverRoles: ['developer'], approverPeople: ['ops@site.test'] }),
    { mailer: 'forms@site.test', notify_to: ['ops@site.test'], notify_roles: ['admin'], confirm_visitor: 'true', approvers: ['developer', 'ops@site.test'] });
  assert.deepEqual(settingsFor({}), { mailer: '', notify_to: [], notify_roles: [], confirm_visitor: '', approvers: [] });
  assert.equal(settingsFor({ confirm: 'maybe' }).confirm_visitor, '', 'anything but true or false follows the mailer');
  assert.deepEqual(mailerBodyFor({ people: ['ops@site.test'], roles: ['member'], confirm: false }), { notify: ['ops@site.test'], notifyRoles: ['member'], confirmVisitor: false });
});

test('the team unread (people: null): notify_to and notify stay out of the body so the server keeps the people stored; the approver addresses stored go back beside the roles picked', () => {
  const s = settingsFor({ mailer: 'forms@site.test', people: null, roles: ['admin'], confirm: 'false', approverRoles: ['developer'], approverPeople: ['ops@site.test'] });
  assert.deepEqual(s, { mailer: 'forms@site.test', notify_roles: ['admin'], confirm_visitor: 'false', approvers: ['developer', 'ops@site.test'] });
  assert.ok(!('notify_to' in s), 'no notify_to key at all: an empty list would wipe the stored people');
  assert.deepEqual(settingsFor({ people: [] }).notify_to, [], 'an empty pick with the team shown does clear the list');
  const m = mailerBodyFor({ people: null, roles: ['member'], confirm: true });
  assert.ok(!('recipient' in s), 'the team unread: the older recipient is never touched');
  assert.deepEqual(m, { notifyRoles: ['member'], confirmVisitor: true });
  assert.ok(!('notify' in m));
});

test('the form\'s older recipient: unticked, it is cleared with recipient \'\'; ticked, or the team unread, it is left alone', () => {
  const off = settingsFor({ people: ['ops@site.test'], recipient: 'Sales@Site.test' });
  assert.equal(off.recipient, '', 'unticked: cleared, or the merge would keep mailing it');
  assert.deepEqual(off.notify_to, ['ops@site.test']);
  const on = settingsFor({ people: ['sales@site.test', 'ops@site.test'], recipient: 'sales@site.test' });
  assert.ok(!('recipient' in on), 'still ticked: left as it is');
  assert.ok(!('recipient' in settingsFor({ people: null, recipient: 'sales@site.test' })), 'no people shown: nothing about them is sent');
  assert.ok(!('recipient' in settingsFor({ people: [], recipient: '' })), 'no older recipient: no key');
  assert.equal(settingsFor({ people: [], recipient: 'sales@site.test' }).recipient, '', 'every box unticked clears it too');
});

test('a recipient the manifest needs or defaults is never sent as \'\' (the server would refuse the save or bring the default back), and the card says where it is changed', () => {
  for (const hold of ['required', 'default']) {
    const s = settingsFor({ people: ['ops@site.test'], roles: ['admin'], recipient: 'sales@site.test', recipientHold: hold });
    assert.ok(!('recipient' in s), `${hold}: no recipient key, so the other changes save`);
    assert.deepEqual(s.notify_to, ['ops@site.test']);
    assert.ok(!('recipient' in settingsFor({ people: [], roles: ['admin'], recipient: 'sales@site.test', recipientHold: hold })), `${hold}: roles only, still no recipient key`);
  }
  assert.equal(settingsFor({ people: ['ops@site.test'], recipient: 'sales@site.test', recipientHold: '' }).recipient, '', 'nothing holds it: cleared as before');
  assert.equal(recipientHoldWords('Sales@Site.test', 'required', 'Send to'), 'sales@site.test is this form\'s own "Send to", which the form needs, so it is not changed here. Change it in the studio: select the form on its page, then Settings.');
  assert.equal(recipientHoldWords('sales@site.test', 'default', ''), 'sales@site.test is this form\'s own "recipient", which goes back to the form\'s own default when emptied, so it is not changed here. Change it in the studio: select the form on its page, then Settings.');
  assert.equal(recipientHoldWords('sales@site.test', ''), '', 'nothing holds it: nothing said');
  assert.equal(recipientHoldWords('', 'required'), '');
  assert.ok(!/—|PragOptics/.test(recipientHoldWords('a@b.test', 'required', 'Send to')));
});

test('a Save changes who decides when the approvers sent differ from the ones the setting held (then the card reads who decides again)', () => {
  const own = { approvers: ['admin', 'ops@site.test'], approversFrom: 'setting' };
  assert.equal(approversChanged(own, { approvers: ['ops@site.test', 'admin'] }), false, 'the same, in another order');
  assert.equal(approversChanged(own, { approvers: ['admin'] }), true, 'a person unticked');
  assert.equal(approversChanged(own, { approvers: ['admin', 'ops@site.test', 'developer'] }), true, 'a role ticked');
  const dflt = { approvers: ['admin'], approversFrom: 'manifest' };
  assert.equal(approversChanged(dflt, { approvers: [] }), false, 'following the module\'s default, nothing picked: unchanged');
  assert.equal(approversChanged(dflt, { approvers: ['admin'] }), true, 'the default\'s roles picked become the form\'s own setting');
  assert.equal(approversChanged({ approvers: [], approversFrom: '' }, settingsFor({ approverRoles: ['member'] })), true);
  assert.equal(approversChanged(null, null), false);
});

test('a lane whose backend dropped the roles says so once; nothing lost says nothing', () => {
  const sent = settingsFor({ roles: ['admin'], approverRoles: ['admin'] });
  assert.equal(lostWords(sent, { mailer: '', notify_to: [], confirm_visitor: '' }), 'This lane does not keep roles yet.');
  assert.equal(lostWords(sent, { notify_roles: ['admin'], approvers: ['admin'] }), '');
  assert.equal(lostWords(settingsFor({}), {}), '', 'nothing sent with a value: nothing to lose');
  assert.equal(lostWords({ notifyRoles: ['admin'] }, { notify: [] }, ['notifyRoles']), 'This lane does not keep roles yet.');
});
