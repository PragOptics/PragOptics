import test from 'node:test';
import assert from 'node:assert/strict';
import { trackingRoutePlan, trackingEvents, lastReportedLocation } from '../src/account/shippingJourney.js';
const place = (kind, point, eventIndex) => ({kind, eventIndex, resolved: point ? {point} : null});
const origin = place('origin', [29, -95]), destination = place('destination', [38, -122]);
test('before any scans the only route is a dotted origin-to-destination connection', () => {
  const plan = trackingRoutePlan([origin, destination], 'PRE_TRANSIT');
  assert.deepEqual(plan.segments, []); assert.deepEqual(plan.remaining, [[29, -95], [38, -122]]); assert.equal(plan.lastMapped, null);
});
test('reported detours are solid and only the connection after the last known stop is dotted', () => {
  const stops = [place('event', [29, -95], 0), place('event', [33, -97], 1), place('event', [35, -90], 2)];
  const plan = trackingRoutePlan([origin, ...stops, destination], 'TRANSIT');
  assert.deepEqual(plan.segments, [[[29, -95], [33, -97], [35, -90]]]);
  assert.deepEqual(plan.remaining, [[35, -90], [38, -122]]); assert.equal(plan.lastMapped.eventIndex, 2);
});
test('missing event locations break solid legs rather than implying a known leg across the gap', () => {
  const plan = trackingRoutePlan([origin, place('event', [29, -95], 0), place('event', null, 1), place('event', [35, -90], 2), destination], 'TRANSIT');
  assert.deepEqual(plan.segments, []); assert.deepEqual(plan.remaining, [[35, -90], [38, -122]]);
});
test('delivery and completed returns have no remaining destination leg', () => {
  for (const status of ['DELIVERED', 'RETURNED']) assert.equal(trackingRoutePlan([origin, place('event', [35, -90], 0), destination], status).remaining, null);
});
test('last reported location keeps its actual report time when a newer event has none', () => {
  const history = [{status: 'TRANSIT', at: '2026-11-26T15:00:00Z', location: {city: 'Houston'}}, {status: 'TRANSIT', at: '2026-11-26T16:00:00Z', location: null}];
  assert.equal(lastReportedLocation({history}).event.at, '2026-11-26T15:00:00Z');
  assert.equal(lastReportedLocation({history: []}), null);
});
test('a timestamp-free current report remains current without inventing a timestamp or duplicate', () => {
  const older = {status: 'TRANSIT', at: '2026-11-26T15:00:00Z', location: {city: 'Houston'}};
  const current = {status: 'TRANSIT', at: '', location: {city: 'Dallas'}};
  const data = {history: [older, {...current}], current};
  const events = trackingEvents(data);
  assert.equal(events.length, 2); assert.equal(lastReportedLocation(data, events).event.location.city, 'Dallas');
  assert.equal(events.at(-1).at, '');
});
