// tests/row-mail.test.mjs: a submission row's mail outcome in words (src/account/rowMail.js). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mailOf, mailShort, mailLines, heldWords } from '../src/account/rowMail.js';

test('a row the door mailed from the environment\'s mailer: both parts sent, with their addresses and moments', () => {
  const r = { id: 'sub-1', mail: { from: 'forms@bridgesindust.com', team: { to: ['support@bridgesindust.com', 'owner@bridgesindust.com'], at: '2026-11-02T19:10:00Z' }, visitor: { to: 'ana@example.com', at: '2026-11-02T19:10:01Z' } } };
  const m = mailOf(r);
  assert.equal(m.known, true); assert.equal(m.from, 'forms@bridgesindust.com');
  assert.equal(m.team.state, 'sent'); assert.deepEqual(m.team.to, ['support@bridgesindust.com', 'owner@bridgesindust.com']);
  assert.equal(m.visitor.state, 'sent'); assert.deepEqual(m.visitor.to, ['ana@example.com']);
  assert.equal(mailShort(r), 'team sent · submitter sent');
  assert.deepEqual(mailLines(r), [
    { label: 'From', text: 'forms@bridgesindust.com', at: '' },
    { label: 'Team', text: 'Sent to support@bridgesindust.com, owner@bridgesindust.com', at: '2026-11-02T19:10:00Z' },
    { label: 'Submitter', text: 'Sent to ana@example.com', at: '2026-11-02T19:10:01Z' }
  ]);
});

test('held and not-sent parts say why, in the door\'s own reasons', () => {
  const r = { mail: { from: 'forms@bridgesindust.com', team: { held: 'environment-day' }, visitor: { none: 'no-email' } } };
  assert.equal(mailShort(r), "held: the environment's mails for the day were used up");
  assert.deepEqual(mailLines(r).slice(1), [
    { label: 'Team', text: "Held: the environment's mails for the day were used up", at: '' },
    { label: 'Submitter', text: 'Not sent: the message carried no email address', at: '' }
  ]);
  const r2 = { mail: { from: 'x@y.z', team: { to: ['a@b.c'], at: '2026-11-02T00:00:00Z' }, visitor: { none: 'off' } } };
  assert.equal(mailShort(r2), 'team sent');
  assert.equal(mailLines(r2)[2].text, 'Not sent: confirmations are off for this form');
  assert.equal(heldWords('something-new'), 'held (something-new)', 'a reason the words do not know yet is still shown');
});

test('the older row: mailHeld alone means nothing was mailed and why; no mark at all means the row says nothing', () => {
  const held = { id: 'sub-2', mailHeld: 'no-mailer' };
  assert.equal(mailOf(held).known, true); assert.equal(mailOf(held).team.state, 'held');
  assert.equal(mailShort(held), 'held: no mailer in the environment yet');
  assert.deepEqual(mailLines(held), [{ label: 'Team', text: 'Held: no mailer in the environment yet', at: '' }, { label: 'Submitter', text: 'Held: no mailer in the environment yet', at: '' }]);
  const bare = { id: 'sub-3', fields: { name: 'Ana' } };
  assert.equal(mailOf(bare).known, false); assert.equal(mailShort(bare), ''); assert.deepEqual(mailLines(bare), []);
  assert.equal(mailOf(null).known, false);
});
