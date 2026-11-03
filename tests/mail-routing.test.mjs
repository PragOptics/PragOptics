// tests/mail-routing.test.mjs: who a form tells and who decides (src/account/mailRouting.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_WORDS, roleList, emailList, parseApprovers, teamOf, expandRoles, roleCounts, mailerRecord, toldBy, confirmsOf, roleWord, whoWords, decidersOf, decidersWords, formTags, settingsFor, mailerBodyFor, lostWords } from '../src/account/mailRouting.js';

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

test('a form\'s tags say where it sends from, whether it confirms, whether rows wait, its intent, off', () => {
  const t = formTags({ mailer: '', waits: true, intent: 'review', enabled: false }, { from: 'forms@site.test', confirms: false, dflt: 'forms@site.test' });
  assert.deepEqual(t.map(x => x.word), ['from forms@site.test (the default)', 'no confirmation', 'waits for a decision', 'review', 'off']);
  assert.deepEqual(t.map(x => x.cls), ['', '', 'is-pending', 'is-primary', '']);
  const own = formTags({ mailer: 'forms@site.test', enabled: true }, { from: 'forms@site.test', confirms: true, dflt: 'forms@site.test' });
  assert.deepEqual(own.map(x => x.word), ['from forms@site.test', 'confirms']);
  assert.deepEqual(formTags({}, { from: '', confirms: true })[0], { word: 'no mailer', cls: 'is-bad' });
});

test('one Save, one settings body: the mailer, the people, the roles, the switch, the approvers in one list', () => {
  assert.deepEqual(settingsFor({ mailer: 'Forms@Site.test', people: ['Ops@site.test', 'ops@site.test'], roles: ['admin', 'agent'], confirm: 'true', approverRoles: ['developer'], approverPeople: ['ops@site.test'] }),
    { mailer: 'forms@site.test', notify_to: ['ops@site.test'], notify_roles: ['admin'], confirm_visitor: 'true', approvers: ['developer', 'ops@site.test'] });
  assert.deepEqual(settingsFor({}), { mailer: '', notify_to: [], notify_roles: [], confirm_visitor: '', approvers: [] });
  assert.equal(settingsFor({ confirm: 'maybe' }).confirm_visitor, '', 'anything but true or false follows the mailer');
  assert.deepEqual(mailerBodyFor({ people: ['ops@site.test'], roles: ['member'], confirm: false }), { notify: ['ops@site.test'], notifyRoles: ['member'], confirmVisitor: false });
});

test('a lane whose backend dropped the roles says so once; nothing lost says nothing', () => {
  const sent = settingsFor({ roles: ['admin'], approverRoles: ['admin'] });
  assert.equal(lostWords(sent, { mailer: '', notify_to: [], confirm_visitor: '' }), 'This lane does not keep roles yet.');
  assert.equal(lostWords(sent, { notify_roles: ['admin'], approvers: ['admin'] }), '');
  assert.equal(lostWords(settingsFor({}), {}), '', 'nothing sent with a value: nothing to lose');
  assert.equal(lostWords({ notifyRoles: ['admin'] }, { notify: [] }, ['notifyRoles']), 'This lane does not keep roles yet.');
});
