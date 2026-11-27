// Interactive tracking geography. Only public reference shards are fetched;
// customer street addresses are never sent to a geocoding service.
const lookups = new Map();
let leafletReady;
const clean = value => String(value || '').trim();
const slug = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function coordinate(value) {
  if (!Array.isArray(value) || value.length < 2 || value.some(x => !['number', 'string'].includes(typeof x) || String(x).trim() === '')) return null;
  const point = value.slice(0, 2).map(Number);
  return point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180 ? point : null;
}
async function reference(path, fetchImpl) {
  if (!lookups.has(path)) {
    const promise = fetchImpl(new URL(`./geography/${path}.json`, import.meta.url), { credentials: 'omit', cache: 'force-cache' })
      .then(response => response.ok ? response.json() : null).catch(() => null);
    lookups.set(path, promise);
    promise.then(data => { if (!data) lookups.delete(path); });
  }
  return lookups.get(path);
}
export async function resolveTrackingLocation(location, fetchImpl = fetch) {
  if (!location) return null;
  const direct = coordinate([location.latitude, location.longitude]);
  if (direct) return { point: direct, precision: 'Carrier-reported location' };
  if (!/^(US|USA|UNITED STATES)$/i.test(clean(location.country))) return null;
  const zip = clean(location.zip).match(/^\d{5}(?:-\d{4})?$/)?.[0].slice(0, 5);
  if (zip) {
    const table = await reference(`us-zips/${zip.slice(0, 2)}`, fetchImpl), point = coordinate(table?.[zip]);
    if (point) return { point, precision: 'Postal-area location' };
  }
  const state = clean(location.state).toLowerCase();
  if (/^[a-z]{2}$/.test(state) && location.city) {
    const table = await reference(`us-cities/${state}`, fetchImpl), point = coordinate(table?.[slug(location.city)]);
    if (point) return { point, precision: 'City location' };
  }
  return null;
}
export function trackingLocationWords(location) {
  return location ? [location.city, location.state, location.zip, location.country].map(clean).filter(Boolean).join(', ') : '';
}
function leaflet() {
  if (!leafletReady) leafletReady = new Promise((resolve, reject) => {
    if (globalThis.L?.map) { resolve(globalThis.L); return; }
    if (!document.getElementById('shipmentLeafletCss')) {
      const css = document.createElement('link'); css.id = 'shipmentLeafletCss'; css.rel = 'stylesheet';
      css.href = new URL('../vendor/leaflet/leaflet.css', import.meta.url).href; document.head.appendChild(css);
    }
    const script = document.createElement('script'); script.src = new URL('../vendor/leaflet/leaflet.js', import.meta.url).href;
    script.onload = () => globalThis.L?.map ? resolve(globalThis.L) : reject(new Error('The map library did not load.'));
    script.onerror = () => { script.remove(); reject(new Error('The map could not load.')); };
    document.head.appendChild(script);
  }).catch(error => { leafletReady = null; throw error; });
  return leafletReady;
}
export async function mountTrackingMap(host, data, { isCurrent = () => true, note = () => {} } = {}) {
  let map, resize, disposed = false;
  const alive = () => !disposed && isCurrent() && host.isConnected;
  const candidates = [
    ...(data.origin ? [{ kind: 'origin', label: 'From', location: data.origin }] : []),
    ...(data.history || []).map((event, index) => ({ kind: 'event', label: event.detail || event.status || 'Tracking event', location: event.location, eventIndex: index })),
    ...(data.destination ? [{ kind: 'destination', label: 'To', location: data.destination }] : [])
  ];
  const located = await Promise.all(candidates.map(async item => ({ ...item, resolved: await resolveTrackingLocation(item.location) })));
  if (!alive()) return { dispose() {}, selectEvent() {} };
  const points = located.filter(item => item.resolved);
  if (!points.length) {
    host.classList.add('shipment-map-empty'); host.textContent = 'A map will appear when a tracking location can be placed. Every reported event remains in the timeline.';
    note('No mappable locations supplied yet.');
    return { dispose() {}, selectEvent() {} };
  }
  const L = await leaflet();
  if (!alive()) return { dispose() {}, selectEvent() {} };
  host.replaceChildren(); host.classList.remove('shipment-map-empty');
  map = L.map(host, { scrollWheelZoom: false, minZoom: 2, maxZoom: 15 });
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 15, keepBuffer: 1,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
  }).addTo(map);
  tiles.on('tileerror', () => { if (alive()) note('Map background unavailable. Reported locations and the timeline remain available.'); });
  map.fitBounds(points.map(p => p.resolved.point), { padding: [35, 35], maxZoom: 10 });
  const color = getComputedStyle(host).getPropertyValue('--brand-600').trim() || '#7463dd';
  const origin = points.find(p => p.kind === 'origin'), destination = points.find(p => p.kind === 'destination');
  if (origin && destination) L.polyline([origin.resolved.point, destination.resolved.point], { color, weight: 2, opacity: .4, dashArray: '5 8' }).addTo(map);
  const scans = points.filter(p => p.kind === 'event');
  if (scans.length > 1) L.polyline(scans.map(p => p.resolved.point), { color, weight: 3, opacity: .9 }).addTo(map);
  const markers = new Map();
  for (const item of points) {
    const marker = L.circleMarker(item.resolved.point, { radius: item.kind === 'event' ? 6 : 9, color, fillColor: color, fillOpacity: item.kind === 'destination' ? .15 : .9, weight: 2 }).addTo(map);
    const popup = document.createElement('div'); popup.className = 'shipment-map-popup';
    const heading = document.createElement('strong'); heading.textContent = item.label;
    const place = document.createElement('p'); place.textContent = trackingLocationWords(item.location);
    const precision = document.createElement('small'); precision.textContent = item.resolved.precision;
    popup.append(heading, place, precision); marker.bindPopup(popup);
    const element = marker.getElement();
    if (element) { element.setAttribute('role', 'button'); element.setAttribute('tabindex', '0'); element.setAttribute('aria-label', `${item.label}: ${place.textContent}`); element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); marker.openPopup(); } }); }
    if (item.eventIndex != null) markers.set(item.eventIndex, marker);
  }
  if (typeof ResizeObserver !== 'undefined') { resize = new ResizeObserver(() => { if (alive()) map.invalidateSize(); }); resize.observe(host); }
  const missing = located.filter(item => item.location && !item.resolved).length;
  note(`Dotted: origin to destination. Solid: reported scan locations. Area estimates; lines are schematic, not the actual travel path.${missing ? ` ${missing} location${missing === 1 ? ' is' : 's are'} not plotted.` : ''}`);
  return {
    dispose() { disposed = true; resize?.disconnect(); map?.remove(); },
    selectEvent(index) {
      const marker = markers.get(Number(index));
      if (marker && alive()) { map.panTo(marker.getLatLng()); marker.openPopup(); }
      else note('This event has no mappable location. Its full details are in the timeline.');
    }
  };
}
