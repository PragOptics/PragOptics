// Presentation of carrier reports only. No estimated stops or travel timestamps.
export function trackingEvents(data) {
  const events = [...(Array.isArray(data.history) ? data.history : [])];
  const current = data.current || (!Array.isArray(data.history) && (data.status || data.detail) ? { status: data.status, detail: data.detail, at: '', location: null } : null);
  const key = event => JSON.stringify([event.status, event.detail, event.at, event.location]);
  const existing = current ? events.find(event => key(event) === key(current)) : null;
  if (current && !existing) events.push(current);
  const latest = existing || current;
  return events.sort((a, b) => {
    if (a === b) return 0;
    // The provider's current report is latest even when it has no timestamp.
    if (a === latest && !a.at) return 1;
    if (b === latest && !b.at) return -1;
    return String(a.at || '').localeCompare(String(b.at || ''));
  });
}
export function lastReportedLocation(data, events = trackingEvents(data)) {
  const usable = place => place && (place.city || place.state || place.zip || (place.latitude != null && place.longitude != null));
  for (let index = events.length - 1; index >= 0; index--) {
    if (usable(events[index].location)) return { event: events[index], index };
  }
  return null;
}
export function trackingDayGroups(events) {
  const groups = new Map();
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index], at = event.at ? new Date(event.at) : null;
    const valid = at && Number.isFinite(at.getTime());
    const key = valid ? at.toDateString() : 'undated';
    if (!groups.has(key)) groups.set(key, { label: valid ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(at) : 'Time not supplied', events: [] });
    groups.get(key).events.push({ event, index });
  }
  return [...groups.values()];
}
export function trackingRoutePlan(located, status = '') {
  const events = located.filter(item => item.kind === 'event');
  const origin = located.find(item => item.kind === 'origin' && item.resolved);
  const destination = located.find(item => item.kind === 'destination' && item.resolved);
  const lastMapped = events.filter(item => item.resolved).at(-1) || null;
  const segments = []; let run = [];
  for (const item of events) {
    if (item.resolved) run.push(item.resolved.point);
    else { if (run.length > 1) segments.push(run); run = []; }
  }
  if (run.length > 1) segments.push(run);
  const start = lastMapped || origin;
  const complete = ['DELIVERED', 'RETURNED'].includes(String(status).toUpperCase());
  const remaining = !complete && start && destination && (start.resolved.point[0] !== destination.resolved.point[0] || start.resolved.point[1] !== destination.resolved.point[1]) ? [start.resolved.point, destination.resolved.point] : null;
  return { segments, remaining, lastMapped };
}
