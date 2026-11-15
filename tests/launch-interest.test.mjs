// "Notify me at launch" on the platform (src/shop/launchInterest.js, src/api/intakeDoor.js, src/account/interestDesk.js): the
// fields a sign-up sends, the email check, the words of a refusal, the door's addresses, the desk's grouping and words, and
// the door's challenge solved the way the platform checks it (sha256 of nonce.counter with `difficulty` leading zero bits).
// Headless: no DOM, no network.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

globalThis.localStorage = undefined;
const L = await import("../src/shop/launchInterest.js");
const D = await import("../src/api/intakeDoor.js");
const K = await import("../src/account/interestDesk.js");

test("the fields: the product by name and id, the email, the name, the page; blanks left out; lengths capped", () => {
  assert.deepEqual(L.interestFields({ product: { id: "omnibus", name: "OmniBus" }, email: " dana@riverbend.example ", name: "Dana Ruiz", page: "#software" }),
    { product: "OmniBus", product_id: "omnibus", email: "dana@riverbend.example", name: "Dana Ruiz", page: "#software" });
  assert.deepEqual(L.interestFields({ product: "omnibus", email: "a@b.co" }), { product_id: "omnibus", email: "a@b.co" });
  assert.equal(L.interestFields({ product: { id: "x", name: "y" }, email: "a@b.co", name: "n".repeat(200) }).name.length, 120);
});

test("the email check and the words of a refusal", () => {
  assert.equal(L.looksLikeEmail("dana@riverbend.example"), true);
  assert.equal(L.looksLikeEmail("dana@"), false);
  assert.equal(L.failureWords({ platform: true, message: "Too many sign-ups from this address. Try again later." }), "Too many sign-ups from this address. Try again later.");
  assert.match(L.failureWords(new Error("boom")), /did not go through/);
});

test("the door is the platform's own: v1/shop/interest and its challenge, on the lane's API", () => {
  assert.match(L.LAUNCH_INTEREST.url, /\/api\/v1\/shop\/interest$/);
  assert.match(L.LAUNCH_INTEREST.challenge, /\/api\/v1\/shop\/interest\/challenge$/);
});

test("the desk groups by product, biggest first, and says a count in words", () => {
  const items = [{ product: "OmniBus", ref: "LI-1" }, { product: "Loop Tools", ref: "LI-2" }, { product: "OmniBus", ref: "LI-3" }, { productId: "x", ref: "LI-4" }];
  const g = K.groupByProduct(items);
  assert.deepEqual(g.map(x => [x.product, x.rows.length]), [["OmniBus", 2], ["Loop Tools", 1], ["x", 1]]);
  assert.equal(K.countWords(1), "1 sign-up"); assert.equal(K.countWords(2), "2 sign-ups");
});

test("the door's challenge: sha256 as node computes it, and a counter with the asked leading zero bits", () => {
  const hex = (H) => H.map((w) => w.toString(16).padStart(8, "0")).join("");
  for (const s of ["", "abc", "nonce.12345", "x".repeat(200)]) assert.equal(hex(D.sha256(s)), crypto.createHash("sha256").update(s).digest("hex"));
  const nonce = "n-" + Date.now();
  const counter = D.solve(nonce, 12);
  assert.ok(counter !== "", "a counter was found");
  const digest = crypto.createHash("sha256").update(nonce + "." + counter).digest();
  let zeros = 0; for (const b of digest) { if (b === 0) { zeros += 8; continue; } zeros += Math.clz32(b) - 24; break; }
  assert.ok(zeros >= 12, `${zeros} leading zero bits`);
});
