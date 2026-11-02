// A table's rows as a table (src/account/dataColumns.js).
import assert from "node:assert/strict";
import { innerOf, whenOf, statusOf, labelOf, cellText, rowShape, headlineOf } from "../src/account/dataColumns.js";

// submission rows the way the public doors store them
const sub = (id, fields, extra = {}) => ({ key: id, updatedAt: "2026-11-02T16:00:00Z", size: 400, value: { id, installId: "6e1d99e5c54888d6", module: "contact-form", name: "Submit a Break-In", lane: "live", via: "form", at: "2026-11-02T15:23:39.088Z", fields, ...extra } });
const rows = [
  sub("sub-1", { name: "PragOptics Test", company: "PragOptics Test", email: "test@example.com", sector: "Manufacturing & Discrete", measuring: "Flow", product: "Water", issue: "It drifts.", text_ok: "yes", subject: "Break-In" }),
  sub("sub-2", { name: "Jane", email: "jane@example.com", sector: "Refining", measuring: "Level", product: "Crude", issue: "Noise." })
];
const shape = rowShape(rows);
assert.equal(shape.plain, false);
assert.deepEqual(shape.columns.map(c => c.key), ["name", "email", "subject", "company", "sector"], "preferred fields first, then the rest; the platform's own keys stay out");
assert.equal(shape.when, true);
assert.equal(shape.status, false);
assert.equal(innerOf(rows[0]).name, "PragOptics Test");
assert.equal(whenOf(rows[0]), "2026-11-02T15:23:39.088Z");
assert.equal(headlineOf(rows[1], shape), "Jane");

// a moderated table: Status shows; a pending row reads pending
const reviews = [
  sub("sub-r1", { name: "TNT", rating: "5", comment: "Great." }, { status: "approved" }),
  sub("sub-r2", { name: "PragOptics Test", rating: "5", comment: "Test." }, { status: "pending" })
];
const rs = rowShape(reviews);
assert.deepEqual(rs.columns.map(c => c.key), ["name", "rating", "comment"]);
assert.equal(rs.status, true);
assert.equal(statusOf(reviews[1]), "pending");

// a plain key/value table (no object): plain, no columns, When from updatedAt
const plain = [{ key: "k1", value: "hello", updatedAt: "2026-10-01T00:00:00Z" }, { key: "k2", value: 42, updatedAt: "2026-10-02T00:00:00Z" }];
const ps = rowShape(plain);
assert.equal(ps.plain, true);
assert.deepEqual(ps.columns, []);
assert.equal(ps.when, true);
assert.equal(headlineOf(plain[1], ps), "42");

// an object table without fields (a product): its own keys are the columns, at most five
const products = [{ key: "p1", value: { title: "Widget", price: 9.5, sku: "W-1", tags: ["a", "b"], stock: 3, vendor: "Acme", weight: 1 } }];
const prs = rowShape(products);
assert.equal(prs.columns.length, 5);
assert.equal(prs.columns[0].key, "title");
assert.equal(prs.when, false);
assert.equal(headlineOf(products[0], prs), "Widget");

assert.equal(labelOf("image_alt"), "Image alt");
assert.equal(labelOf("productId"), "Product id");
assert.equal(cellText(true), "yes");
assert.equal(cellText(["a", "b"]), "2 items");
assert.equal(cellText({ a: 1 }), "1 field");
assert.equal(cellText(null), "");
assert.deepEqual(rowShape([]), { plain: true, columns: [], when: false, status: false });
console.log("data-columns: ok");
