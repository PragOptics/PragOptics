// src/account/domainFamilies.js
//
// ONE CONTAINER PER DOMAIN FAMILY (Cameron 2026-11-02: "i see two cards, with two domains, that are the same domain
// name or family ... anything around it, a subdomain, or anything should be under one container, that nests the
// specifics under"). The Domains card used to draw one card per connected name, so bridgesindust.com and
// www.bridgesindust.com read as two domains. To a person they are one domain, and www is expected to just work.
//
// A family is the shortest connected name every other name in it ends with: www.bridgesindust.com and
// shop.bridgesindust.com nest under bridgesindust.com. A name whose parent is not connected is its own family
// (shop.example.com alone stays shop.example.com). No public-suffix list is consulted: the rows themselves say
// what the family is, which is also what the person connected.
//
// Pure: rows in, families out. environment.js draws them.

const S = v => String(v == null ? '' : v).trim().toLowerCase().replace(/\.$/, '');

/** True when `host` is `parent` or a name under it (a.b.c under b.c, never b.c under a.b.c, never xb.c under b.c). */
export function isUnder(host, parent) {
  const h = S(host), p = S(parent);
  return !!h && !!p && (h === p || h.endsWith('.' + p));
}

/** The connected name that is `host`'s family head: the shortest connected name it sits under (itself when none). */
export function familyHeadOf(host, hosts) {
  const h = S(host);
  let head = h;
  for (const other of hosts || []) {
    const o = S(other);
    if (o !== h && isUnder(h, o) && o.length < head.length) head = o;
  }
  return head;
}

/**
 * Group domain rows into families: [{ host, primary, names, rows }], in the order the heads first appear.
 *   host     the family's name (the apex when it is connected)
 *   primary  the row named `host` when it is connected, else the first row of the family
 *   names    the other rows, shortest name first
 *   rows     every row of the family, primary first
 */
export function familiesOf(rows) {
  const list = (rows || []).filter(r => r && r.host);
  const hosts = list.map(r => r.host);
  const byHead = new Map();
  for (const r of list) {
    const head = familyHeadOf(r.host, hosts);
    if (!byHead.has(head)) byHead.set(head, []);
    byHead.get(head).push(r);
  }
  const out = [];
  for (const [host, members] of byHead) {
    const primary = members.find(r => S(r.host) === host) || members[0];
    const names = members.filter(r => r !== primary).sort((a, b) => S(a.host).length - S(b.host).length || S(a.host).localeCompare(S(b.host)));
    out.push({ host, primary, names, rows: [primary, ...names] });
  }
  return out;
}

/** The names of a family that serve a website right now (the row's own serve, and a companion www a row carries). */
export function liveHostsOf(family) {
  const out = [];
  for (const r of family.rows || []) {
    const s = r && r.serve;
    if (s && s.status === 'SERVING') {
      out.push(S(r.host));
      if (s.www && s.www.status === 'SERVING' && s.www.host) out.push(S(s.www.host));
    }
  }
  return [...new Set(out)];
}

/** The family's state in one word each: verified (all), partly verified (some), or the first row's state; live when any name serves. */
export function familyState(family) {
  const rows = family.rows || [];
  const verified = rows.filter(r => String(r.status || '').toUpperCase() === 'VERIFIED').length;
  return {
    verified: verified === rows.length && rows.length > 0,
    partly: verified > 0 && verified < rows.length,
    failed: rows.some(r => String(r.status || '').toUpperCase() === 'FAILED'),
    live: liveHostsOf(family).length > 0
  };
}

/** "a and b", "a, b and c". */
export function listWords(items) {
  const a = (items || []).filter(Boolean);
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}
