// tests/data-policy.test.mjs: who sees a table and who changes its rows, in words (src/account/dataPolicy.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { READ_LEVELS, WRITE_LEVELS, DEFAULT_POLICY, policyOf, formOf, tableCanRead, tableCanWrite, readSentence, writeSentence, seenBy, changedBy, levelOptions, filledBy, formFedSentence, lockWords, tableLine, refusalWords, policySaveWords } from '../src/account/dataPolicy.js';

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
  assert.equal(readSentence('member'), 'Members, developers, admins and the owner can see this table.');
  assert.equal(readSentence('developer'), 'Developers, admins and the owner can see this table.');
  assert.equal(readSentence('admin'), 'Admins and the owner can see this table.');
  assert.equal(readSentence('owner'), 'Only the owner can see this table.');
  assert.equal(writeSentence('member'), 'Members, developers, admins and the owner can change its rows.');
  assert.equal(writeSentence('owner'), 'Only the owner can change its rows.');
  assert.equal(writeSentence('viewer'), writeSentence('member'), 'viewer is not a write level');
  assert.equal(seenBy('viewer'), 'Seen by everyone on the team');
  assert.equal(seenBy('member'), 'Seen by members and above');
  assert.equal(seenBy('owner'), 'Seen by the owner only');
  assert.equal(changedBy('admin'), 'Rows changed by admins and the owner');
  assert.deepEqual(levelOptions('read').map(o => o.value), READ_LEVELS);
  assert.deepEqual(levelOptions('write').map(o => o.label), ['Members and above', 'Developers and above', 'Admins and the owner', 'The owner only']);
});

test('the list line and the lock', () => {
  assert.equal(tableLine(reviews), 'Seen by everyone on the team · filled by Reviews on your website · not rewritten by hand');
  assert.equal(tableLine({ ...reviews, policy: { ...reviews.policy, studioWrite: true } }), 'Seen by everyone on the team · filled by Reviews on your website');
  assert.equal(tableLine(closed), 'Seen by admins and the owner, not by your role');
  assert.equal(tableLine({ table: 'notes', policy: { read: 'member' } }), 'Seen by members and above');
  assert.equal(filledBy('Reviews'), 'Filled by Reviews on your website');
  assert.equal(filledBy(''), 'Filled by a form on your website');
  assert.equal(formFedSentence('Reviews'), 'This table is filled by Reviews on your website. Rows here are what your site shows and what your team is told about. Rewriting them by hand changes that.');
  assert.equal(lockWords(policyOf(reviews)), 'Rows are decided from Approvals, not rewritten.');
  assert.equal(lockWords({ formFed: true, studioWrite: true }), 'Rows may be rewritten by hand or by the studio.');
  assert.equal(lockWords(policyOf(closed)), '');
  assert.equal(lockWords(null), '');
});

test('the refusals: read, write and the form-fed lock each say who may and where the owner changes it', () => {
  assert.equal(refusalWords('TABLE_READ_DENIED', { table: 'leads', needs: 'admin' }), 'Admins and the owner can see this table. Your role is not among them. The owner sets who sees it from this table on the Data card.');
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

test('the owner\'s save refused: a lane without the route yet, not the owner, paused, else the fallback', () => {
  assert.equal(policySaveWords(404, undefined, 'x'), 'This lane cannot set who sees a table yet.');
  assert.equal(policySaveWords(403, 'OWNER_ONLY', 'x'), 'Only the owner sets who sees a table.');
  assert.equal(policySaveWords(409, 'SUSPENDED', 'x'), 'This environment is paused. Nothing in it can be changed.');
  assert.equal(policySaveWords(500, 'OTHER', 'The server said no.'), 'The server said no.');
  assert.equal(policySaveWords(undefined, undefined, ''), 'Could not save who sees this table.');
});

test('no em dashes in any of the words', () => {
  const all = [
    ...READ_LEVELS.flatMap(l => [readSentence(l), seenBy(l)]), ...WRITE_LEVELS.flatMap(l => [writeSentence(l), changedBy(l)]),
    ...levelOptions('read').map(o => o.label), filledBy('Reviews'), formFedSentence('Reviews'), lockWords({ formFed: true, studioWrite: true }), lockWords({ formFed: true, studioWrite: false }),
    tableLine(reviews), tableLine(closed), refusalWords('TABLE_READ_DENIED', { needs: 'admin' }), refusalWords('TABLE_WRITE_DENIED', {}), refusalWords('TABLE_FORM_FED', {}),
    policySaveWords(404), policySaveWords(403, 'OWNER_ONLY'), policySaveWords(409, 'SUSPENDED'), policySaveWords()
  ];
  for (const w of all) assert.ok(!/—/.test(w), w);
});
