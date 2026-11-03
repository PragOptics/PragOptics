// src/account/dataColumns.js
//
// A TABLE'S ROWS AS A TABLE (Cameron 2026-11-02: "our data doesnt show up as tables, its all blobs that have to be
// expanded ... opening a table should open the rows so i can click in each to view the submissions. we are talking
// agnostic data table structure"). The Data card used to list each row as a key and a one-line peek of its value
// ("{ id, installId, module, name, ... }"), which hid what a submission says until each row was expanded by hand.
//
// This reads the rows and decides the columns from the rows themselves: the fields a submission carries
// (value.fields when the row is a module submission, else the value's own keys), the first few by a preferred order
// and then by how many rows carry them; plus When (value.at, else the row's updatedAt) and Status when any row has
// one. Nothing is specific to one form: a new table reads the same way.
//
// Pure: rows in, a shape out. environment.js renders it.

const PREFERRED = ['name', 'full_name', 'email', 'title', 'subject', 'company', 'business', 'rating', 'topic', 'type', 'sector', 'phone', 'message', 'comment', 'issue', 'offering'];
// mail and mailHeld (2026-11-02) are the row's mail outcome, read by rowMail.js into its own column and lines
// decidedAt / decidedBy (2026-11-02) are the decision's own marks, shown on the row's status line, never as columns
// exported (2026-11-03) so the Visuals view (dataVisuals.js) counts by the same keys the Table shows and never by these
export const HIDDEN = new Set(['id', 'installId', 'module', 'lane', 'via', 'origin', 'at', 'status', 'fields', 'text_ok', 'hp', 'mail', 'mailHeld', 'decidedAt', 'decidedBy', 'moderatedAt']);
const MAX_COLUMNS = 5;

/** The object whose keys are the row's columns: a submission's fields, else the stored value itself. */
export function innerOf(row) {
  const v = row && row.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (v.fields && typeof v.fields === 'object' && !Array.isArray(v.fields)) return v.fields;
  return v;
}

/** The row's moment: a submission's `at`, else when the row was last written. */
export function whenOf(row) {
  const v = row && row.value;
  return (v && typeof v === 'object' && typeof v.at === 'string' && v.at) || (row && row.updatedAt) || '';
}

/** The row's status word when the value carries one (pending, approved, rejected), else ''. */
export function statusOf(row) {
  const v = row && row.value;
  return v && typeof v === 'object' && typeof v.status === 'string' ? v.status : '';
}

/** A field's name as a label: productId -> Product id, image_alt -> Image alt. */
export function labelOf(k) {
  const s = String(k).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One cell's text: a string as itself, a number or boolean in words, an object or array by its size. */
export function cellText(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.length ? `${v.length} ${v.length === 1 ? 'item' : 'items'}` : '';
  const keys = Object.keys(v);
  return keys.length ? `${keys.length} ${keys.length === 1 ? 'field' : 'fields'}` : '';
}

/**
 * The columns for these rows: [{ key, label }] (at most MAX_COLUMNS), whether a When and a Status column apply,
 * and whether the rows are plain values (no object to read columns from).
 */
export function rowShape(rows) {
  const list = rows || [];
  const count = new Map();
  let objects = 0;
  for (const r of list) {
    const inner = innerOf(r);
    if (!inner) continue;
    objects++;
    for (const k of Object.keys(inner)) {
      if (HIDDEN.has(k)) continue;
      const v = inner[k];
      if (v == null || v === '') continue;
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const keys = [...count.keys()].sort((a, b) => {
    const pa = PREFERRED.indexOf(a), pb = PREFERRED.indexOf(b);
    const ra = pa < 0 ? PREFERRED.length : pa, rb = pb < 0 ? PREFERRED.length : pb;
    if (ra !== rb) return ra - rb;
    const ca = count.get(a), cb = count.get(b);
    if (ca !== cb) return cb - ca;
    return a.localeCompare(b);
  });
  return {
    plain: objects === 0,
    columns: keys.slice(0, MAX_COLUMNS).map(key => ({ key, label: labelOf(key) })),
    when: list.some(r => !!whenOf(r)),
    status: list.some(r => !!statusOf(r)),
    // a Mail column when any row says what became of its mail (rowMail.js: record.mail, or the older mailHeld)
    mail: list.some(r => { const v = r && r.value; return !!(v && typeof v === 'object' && (v.mail || v.mailHeld)); })
  };
}

/** The row's headline for its detail view: its first preferred field, else its key. */
export function headlineOf(row, shape) {
  const inner = innerOf(row);
  if (inner) {
    for (const c of (shape && shape.columns) || []) { const t = cellText(inner[c.key]); if (t) return t; }
  }
  if (row && row.value != null && typeof row.value !== 'object') return String(row.value);
  return String((row && row.key) || '');
}
