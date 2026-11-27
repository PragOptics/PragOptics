import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { trackingBody, trackingEvents, trackingWords } from '../src/account/shippingTracking.js';
import { resolveTrackingLocation } from '../src/account/shippingMap.js';

test('the tracking view exposes status, route, every scan, ETA and checked time separately from purchase state', () => {
  const history = [{ status: 'PRE_TRANSIT', detail: 'Label created', at: '2026-11-26T12:00:00Z', location: null }, { status: 'TRANSIT', detail: 'Arrived at facility', at: '2026-11-27T12:00:00Z', location: { city: 'Houston', state: 'TX', country: 'US' } }];
  const data = { carrier: 'usps', trackingNumber: 'synthetic-tracking', service: 'Ground Advantage', status: 'TRANSIT', detail: 'Arrived at facility', current: history[1], history, origin: { city: 'League City', state: 'TX', zip: '77573', country: 'US' }, destination: { city: 'San Francisco', state: 'CA', zip: '94103', country: 'US' }, eta: '2026-11-30T12:00:00Z', checkedAt: '2026-11-27T12:02:00Z' };
  assert.equal(trackingEvents(data).length, 2, 'the current event is not duplicated');
  const html = trackingBody(data);
  for (const text of ['In transit', 'Tracking history', 'Expected delivery', 'Checked', 'League City', 'San Francisco', 'Arrived at facility', 'synthetic-tracking', 'Last reported location']) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf('Arrived at facility', html.indexOf('shipment-events')) < html.lastIndexOf('Label created'));
});

test('compact history groups reports by date and opens only the newest complete detail by default', () => {
  const history = [
    {status: 'PRE_TRANSIT', at: '2026-11-24T15:00:00Z', detail: 'Label created'},
    {status: 'TRANSIT', at: '2026-11-26T15:00:00Z', detail: 'Accepted', location: {city: 'Houston', state: 'TX', country: 'US'}},
    {status: 'FAILURE', at: '2026-11-26T16:00:00Z', detail: 'Delivery needs attention', substatus: {text: 'Contact carrier', actionRequired: true}}
  ];
  const html = trackingBody({status: 'FAILURE', history, current: history[2]});
  assert.equal((html.match(/<details /g) || []).length, 3);
  assert.equal((html.match(/" open>/g) || []).length, 1);
  assert.equal((html.match(/class="shipment-day"/g) || []).length, 2);
  for (const text of ['Expand all', 'Collapse all', 'Action needed', 'Contact carrier', 'The latest update did not include a location.']) assert.ok(html.includes(text), text);
  assert.match(html, /shipment-last-time[^]*2026-11-26T15:00:00Z/);
});
test('an older API response remains usable and does not invent locations or carrier scans', () => {
  const data = { status: 'PRE_TRANSIT', detail: 'USPS awaits item', trackingNumber: 'n' };
  assert.equal(trackingEvents(data).length, 1); assert.match(trackingBody(data), /Not supplied by carrier yet/);
  assert.equal(trackingEvents({ status: '', detail: 'The label exists.', history: [], current: null }).length, 0, 'shipment endpoint fallback must never manufacture a carrier scan');
  assert.equal(trackingWords('DELIVERED'), 'Delivered'); assert.equal(trackingWords('RETURNED'), 'Returned to sender');
});
test('carrier-controlled text is escaped in every tracking HTML surface', () => {
  const unsafe = '<img src=x onerror=alert(1)>';
  const html = trackingBody({ carrier: unsafe, trackingNumber: unsafe, status: 'FAILURE', detail: unsafe, origin: { city: unsafe }, history: [{ status: 'FAILURE', detail: unsafe, location: { city: unsafe }, substatus: { text: unsafe, actionRequired: true } }] });
  assert.doesNotMatch(html, /<img|onerror=alert\(1\)>/); assert.match(html, /&lt;img/);
});
test('tracking location lookup uses local public regional assets, never a street-address query', async () => {
  const requested = [], fakeFetch = async url => {
    requested.push(url);
    return { ok: true, json: async () => JSON.parse(await readFile(url, 'utf8')) };
  };
  const from = await resolveTrackingLocation({ city: 'League City', state: 'TX', zip: '77573', country: 'US', street1: 'PRIVATE STREET' }, fakeFetch);
  const to = await resolveTrackingLocation({ city: 'San Francisco', state: 'CA', zip: '94103', country: 'US' }, fakeFetch);
  assert.ok(from.point[0] > 29 && from.point[0] < 30); assert.ok(to.point[1] < -122);
  assert.equal(requested.length, 2);
  for (const url of requested) { assert.equal(url.search, ''); assert.doesNotMatch(url.href, /PRIVATE|77573|94103/); }
});
test('city-only events are placed from public data; missing and unknown locations stay unplaced', async () => {
  const fakeFetch = async url => ({ ok: true, json: async () => JSON.parse(await readFile(url, 'utf8')) });
  const city = await resolveTrackingLocation({ city: 'Houston', state: 'TX', country: 'US' }, fakeFetch);
  assert.equal(city.precision, 'City location');
  assert.equal(await resolveTrackingLocation({ city: 'Not a real place', state: 'TX', country: 'US' }, fakeFetch), null);
  assert.equal(await resolveTrackingLocation(null, fakeFetch), null);
  assert.equal(await resolveTrackingLocation({ country: 'XX', zip: '94103' }, fakeFetch), null);
  assert.deepEqual((await resolveTrackingLocation({ latitude: 0, longitude: 0 }, fakeFetch)).point, [0, 0]);
  assert.equal(await resolveTrackingLocation({ latitude: ' ', longitude: 0 }, fakeFetch), null);
  assert.equal(await resolveTrackingLocation({ latitude: false, longitude: false }, fakeFetch), null);
});
