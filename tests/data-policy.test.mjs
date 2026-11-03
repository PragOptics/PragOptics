// tests/data-policy.test.mjs: who sees a table and who changes its rows, in words (src/account/dataPolicy.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { READ_LEVELS, WRITE_LEVELS, DEFAULT_POLICY, policyOf, formOf, tableCanRead, tableCanWrite, readSentence, writeSentence, seenBy, changedBy, levelOptions, filledBy, formFedSentence, lockWords, tableLine, refusalWords, policySaveWords, writeLevelOf, writeRaised, raisedWords, readNeeds, closedTableWords, sharedLanesWords } from '../src/account/dataPolicy.js';

const today = { table: 'reviews', count: 6, updatedAt: '2026-11-03T00:00:00Z' };   // the listing before the backend answers a policy
const reviews = { table: 'reviews', count: 6, policy: { read: 'viewer', write: 'member', formFed: true, studioWrite: false }, owner: { installId: 'i1', label: 'Reviews' }, canRead: true, canWrite: true };
const closed = { table: 'leads', policy: { read: 'admin', write: 'admin', formFed: false, studioWrite: true }, owner: null, canRead: false, canWrite: false };

test('a listing without a policy (today\'s backend) says nothing and keeps today\'s gates', () => {
  assert.equal(policyOf(today), null);
  assert.equal(policyOf(null), null);
  assert.equal(tableLine(today), '');
  assert.equal(tableCanRead(today), true);
  assert.equal(tableCanWrite(today, true), true, 'no canWrite on the listing: the role-level fallback holds');
  assert.equal(tableCanWrite(today, false), false);
  assert.equal(formOf(today), '');
});

test('the policy from the listing: defaults filled, levels checked, studioWrite the opposite of formFed when unsaid', () => {
  assert.deepEqual(policyOf({ policy: {} }), { ...DEFAULT_POLICY });
  assert.deepEqual(policyOf({ policy: { formFed: true } }), { read: 'viewer', write: 'member', formFed: true, studioWrite: false });
  assert.deepEqual(policyOf({ policy: { read: 'nonsense', write: 'viewer' } }), { ...DEFAULT_POLICY }, 'a level that does not exist falls to the default; write is never viewer');
  assert.deepEqual(policyOf({ policy: { read: 'OWNER', write: 'Admin', formFed: true, studioWrite: true } }), { read: 'owner', write: 'admin', formFed: true, studioWrite: true });
  assert.deepEqual(READ_LEVELS, ['viewer', 'member', 'developer', 'admin', 'owner']);
  assert.deepEqual(WRITE_LEVELS, ['member', 'developer', 'admin', 'owner']);
  assert.equal(formOf(reviews), 'Reviews');
  assert.equal(tableCanRead(closed), false);
  assert.equal(tableCanWrite(closed, true), false, 'the listing\'s canWrite wins over the role-level fallback');
  assert.equal(tableCanWrite(reviews, false), true);
});

test('who sees it and who changes rows, in words', () => {
  assert.equal(readSentence('viewer'), 'Everyone on the team can see this table.');
  assert.equal(readSentence('member'), 'Members, developers, admins, an agent you let in, and the owner can see this table.');
  assert.equal(readSentence('developer'), 'Developers, admins, an agent you let in, and the owner can see this table.');
  assert.equal(readSentence('admin'), 'Admins, an agent you let in, and the owner can see this table.', 'the agent ranks with admin on the server, so the words say so');
  assert.equal(readSentence('owner'), 'Only the owner can see this table.');
  assert.equal(writeSentence('member'), 'Members, developers, admins, an agent you let in, and the owner can change its rows.');
  // the agent ranks with admin on the server (tenantPolicy RANK agent: 4), so it passes every level from member to admin: each says so
  for (const l of ['member', 'developer', 'admin']) for (const w of [readSentence(l), writeSentence(l), seenBy(l), changedBy(l), levelOptions('write').find(o => o.value === l).label]) assert.match(w, /an agent you let in/, w);
  assert.ok(!/agent/.test(readSentence('owner')) && !/agent/.test(seenBy('owner')), 'the owner level keeps the agent out, and says nothing of it');
  assert.equal(writeSentence('owner'), 'Only the owner can change its rows.');
  assert.equal(writeSentence('viewer'), writeSentence('member'), 'viewer is not a write level');
  assert.equal(seenBy('viewer'), 'Seen by everyone on the team');
  assert.equal(seenBy('member'), 'Seen by members and above, and an agent you let in');
  assert.equal(seenBy('owner'), 'Seen by the owner only');
  assert.equal(changedBy('admin'), 'Rows changed by admins, an agent you let in, and the owner');
  assert.deepEqual(levelOptions('read').map(o => o.value), READ_LEVELS);
  assert.deepEqual(levelOptions('write').map(o => o.label), ['Members and above, and an agent you let in', 'Developers and above, and an agent you let in', 'Admins, an agent you let in, and the owner', 'The owner only']);
  assert.ok(levelOptions('read').every(o => o.disabled === false) && levelOptions('write').every(o => o.disabled === false), 'nothing greyed out without a floor');
});

test('the write level as the server enforces it: raised to the read level when that is higher; the owner\'s pick greys out what would be raised', () => {
  assert.equal(writeLevelOf({ read: 'viewer', write: 'member' }), 'member');
  assert.equal(writeLevelOf({ read: 'admin', write: 'member' }), 'admin', 'members cannot change rows they cannot see');
  assert.equal(writeLevelOf({ read: 'developer', write: 'owner' }), 'owner', 'a write level above the read level stays');
  assert.equal(writeLevelOf({ read: 'owner', write: 'admin' }), 'owner');
  assert.equal(writeLevelOf({ read: 'member', write: 'member' }), 'member');
  assert.equal(writeLevelOf(null), 'member', 'the defaults: everyone sees it, members and above change it');
  assert.equal(writeRaised({ read: 'admin', write: 'member' }), true);
  assert.equal(writeRaised({ read: 'viewer', write: 'member' }), false);
  assert.equal(writeRaised({ read: 'admin', write: 'admin' }), false);
  assert.equal(writeRaised(null), false);
  assert.equal(writeSentence(writeLevelOf({ read: 'admin', write: 'member' })), 'Admins, an agent you let in, and the owner can change its rows.');
  assert.equal(raisedWords(), 'Only people who can see the table can change its rows.');
  const w = levelOptions('write', { below: 'admin' });
  assert.deepEqual(w.map(o => [o.value, o.disabled]), [['member', true], ['developer', true], ['admin', false], ['owner', false]]);
  assert.deepEqual(levelOptions('write', { below: 'viewer' }).map(o => o.disabled), [false, false, false, false]);
  assert.ok(levelOptions('read', { below: 'owner' }).every(o => !o.disabled), 'the floor greys out write levels only');
});

test('the list line and the lock', () => {
  assert.equal(tableLine(reviews), 'Seen by everyone on the team · filled by Reviews on your website · not rewritten by hand');
  assert.equal(tableLine({ ...reviews, policy: { ...reviews.policy, studioWrite: true } }), 'Seen by everyone on the team · filled by Reviews on your website');
  assert.equal(tableLine(closed), 'Seen by admins, an agent you let in, and the owner, not by your role');
  assert.equal(tableLine({ table: 'notes', policy: { read: 'member' } }), 'Seen by members and above, and an agent you let in');
  assert.equal(filledBy('Reviews'), 'Filled by Reviews on your website');
  assert.equal(filledBy(''), 'Filled by a form on your website');
  assert.equal(formFedSentence('Reviews'), 'This table is filled by Reviews on your website. Rows here are what your site shows and what your team is told about. Rewriting them by hand changes that.');
  assert.equal(lockWords(policyOf(reviews)), 'Rows are decided from Approvals, not rewritten.');
  assert.equal(lockWords({ formFed: true, studioWrite: true }), 'Rows may be rewritten by hand or by the studio.');
  assert.equal(lockWords(policyOf(closed)), '');
  assert.equal(lockWords(null), '');
});

test('a table this role cannot read comes back name-only: its line says who sees it from `needs`, or that it is not shown to this role', () => {
  const nameOnly = { table: 'leads', canRead: false, canWrite: false, needs: 'admin' };
  assert.equal(policyOf(nameOnly), null);
  assert.equal(tableLine(nameOnly), 'Seen by admins, an agent you let in, and the owner, not by your role');
  assert.equal(tableLine({ table: 'leads', canRead: false, canWrite: false, needs: 'owner' }), 'Seen by the owner only, not by your role');
  assert.equal(tableLine({ table: 'leads', canRead: false, canWrite: false }), 'Not shown to your role.', 'a lane that names no level');
  assert.equal(tableLine({ table: 'leads', canRead: false, needs: 'nonsense' }), 'Not shown to your role.');
  assert.equal(readNeeds(nameOnly), 'admin');
  assert.equal(readNeeds(closed), 'admin', 'a full entry: its policy\'s read level');
  assert.equal(readNeeds({ table: 'x', canRead: false }), '');
  assert.equal(readNeeds(null), '');
  // the link's note says what the server's refusal says: who sees it, and where the owner changes that
  assert.equal(closedTableWords(nameOnly), 'leads: Admins, an agent you let in, and the owner can see this table. Your role is not among them. The owner sets who sees it from this table on the Data card.');
  assert.equal(closedTableWords({ table: 'leads', canRead: false }), 'leads: Not shown to your role. The owner sets who sees it from this table on the Data card.');
  assert.ok(closedTableWords(nameOnly).endsWith(refusalWords('TABLE_READ_DENIED', { needs: 'admin' })), 'the same words as the refusal when the table is opened directly');
  assert.equal(tableCanRead(nameOnly), false);
  assert.equal(tableCanWrite(nameOnly, true), false);
});

test('the refusals: read, write and the form-fed lock each say who may and where the owner changes it', () => {
  assert.equal(refusalWords('TABLE_READ_DENIED', { table: 'leads', needs: 'admin' }), 'Admins, an agent you let in, and the owner can see this table. Your role is not among them. The owner sets who sees it from this table on the Data card.');
  assert.equal(refusalWords('TABLE_READ_DENIED', {}), 'Your role cannot see this table. The owner sets who sees it from this table on the Data card.');
  assert.equal(refusalWords('TABLE_WRITE_DENIED', { needs: 'owner' }), 'Only the owner can change its rows. Your role is not among them. The owner sets who changes rows from this table on the Data card.');
  assert.equal(refusalWords('TABLE_WRITE_DENIED', null), 'Your role cannot change rows in this table. The owner sets who changes rows from this table on the Data card.');
  const fed = refusalWords('TABLE_FORM_FED', { table: 'reviews', form: 'Reviews' });
  assert.equal(fed, 'This table is filled by Reviews on your website. Rows here are what your site shows and what your team is told about, so a row is decided from Approvals, not rewritten. The owner can allow rewriting with the switch above the rows.');
  assert.ok(refusalWords('TABLE_FORM_FED', {}, 'Work With Us').startsWith('This table is filled by Work With Us on your website.'), 'the listing\'s form name when the server names none');
  assert.ok(refusalWords('TABLE_FORM_FED', {}).startsWith('This table is filled by a form on your website.'));
  assert.equal(refusalWords('SCOPE_REQUIRED', { scope: 'approve_content' }), '', 'any other code keeps its own sentence');
  assert.equal(refusalWords('', {}), '');
});

test('the owner\'s save refused: the table gone, a lane without the route yet, not the owner, paused, else the fallback', () => {
  assert.equal(policySaveWords(404, 'NO_TABLE', 'No table by that name yet.'), 'That table is not here any more. Reload the tab to see your tables as they are now.', 'a 404 that names the table gone is not a lane without the route');
  assert.equal(policySaveWords(404, undefined, 'x'), 'This lane cannot set who sees a table yet.');
  assert.equal(policySaveWords(403, 'OWNER_ONLY', 'x'), 'Only the owner sets who sees a table.');
  assert.equal(policySaveWords(409, 'SUSPENDED', 'x'), 'This environment is paused. Nothing in it can be changed.');
  assert.equal(policySaveWords(500, 'OTHER', 'The server said no.'), 'The server said no.');
  assert.equal(policySaveWords(undefined, undefined, ''), 'Could not save who sees this table.');
  assert.equal(sharedLanesWords(), 'These choices hold for this table on live and on the sandbox together.');
});

test('no em dashes in any of the words', () => {
  const all = [
    ...READ_LEVELS.flatMap(l => [readSentence(l), seenBy(l)]), ...WRITE_LEVELS.flatMap(l => [writeSentence(l), changedBy(l)]),
    ...levelOptions('read').map(o => o.label), filledBy('Reviews'), formFedSentence('Reviews'), lockWords({ formFed: true, studioWrite: true }), lockWords({ formFed: true, studioWrite: false }),
    tableLine(reviews), tableLine(closed), refusalWords('TABLE_READ_DENIED', { needs: 'admin' }), refusalWords('TABLE_WRITE_DENIED', {}), refusalWords('TABLE_FORM_FED', {}),
    policySaveWords(404), policySaveWords(403, 'OWNER_ONLY'), policySaveWords(409, 'SUSPENDED'), policySaveWords(),
    policySaveWords(404, 'NO_TABLE'), raisedWords(), sharedLanesWords(), closedTableWords({ table: 'leads', needs: 'admin', canRead: false }), tableLine({ table: 'leads', canRead: false })
  ];
  for (const w of all) assert.ok(!/—/.test(w), w);
});
