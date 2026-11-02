// One container per domain family (src/account/domainFamilies.js).
import assert from "node:assert/strict";
import { isUnder, familyHeadOf, familiesOf, liveHostsOf, familyState, listWords } from "../src/account/domainFamilies.js";

assert.equal(isUnder("www.bridgesindust.com", "bridgesindust.com"), true);
assert.equal(isUnder("bridgesindust.com", "bridgesindust.com"), true);
assert.equal(isUnder("bridgesindust.com", "www.bridgesindust.com"), false, "a parent is not under its child");
assert.equal(isUnder("xbridgesindust.com", "bridgesindust.com"), false, "a longer label is not a subdomain");
assert.equal(isUnder("WWW.Bridgesindust.com.", "bridgesindust.com"), true, "case and a trailing dot do not matter");

const hosts = ["bridgesindust.com", "www.bridgesindust.com", "shop.example.com", "a.b.example.org", "b.example.org"];
assert.equal(familyHeadOf("www.bridgesindust.com", hosts), "bridgesindust.com");
assert.equal(familyHeadOf("bridgesindust.com", hosts), "bridgesindust.com");
assert.equal(familyHeadOf("shop.example.com", hosts), "shop.example.com", "no connected parent: its own family");
assert.equal(familyHeadOf("a.b.example.org", hosts), "b.example.org", "the shortest connected parent wins");

// the Bridges rows as the platform lists them today: two rows, both verified, both serving
const bridges = [
  { host: "www.bridgesindust.com", status: "VERIFIED", serve: { status: "SERVING", site: "root", url: "https://www.bridgesindust.com" } },
  { host: "bridgesindust.com", status: "VERIFIED", serve: { status: "SERVING", site: "root", url: "https://bridgesindust.com" } },
  { host: "shop.example.com", status: "PENDING" }
];
const fams = familiesOf(bridges);
assert.equal(fams.length, 2);
assert.equal(fams[0].host, "bridgesindust.com", "the family is named for its apex even when www was listed first");
assert.equal(fams[0].primary.host, "bridgesindust.com");
assert.deepEqual(fams[0].names.map(r => r.host), ["www.bridgesindust.com"]);
assert.deepEqual(fams[0].rows.map(r => r.host), ["bridgesindust.com", "www.bridgesindust.com"]);
assert.deepEqual(liveHostsOf(fams[0]), ["bridgesindust.com", "www.bridgesindust.com"]);
assert.deepEqual(familyState(fams[0]), { verified: true, partly: false, failed: false, live: true });
assert.equal(fams[1].host, "shop.example.com");
assert.deepEqual(familyState(fams[1]), { verified: false, partly: false, failed: false, live: false });

// the post-2026-11-01 shape: one apex row whose serve carries its www companion
const one = familiesOf([{ host: "example.com", status: "VERIFIED", serve: { status: "SERVING", site: "root", www: { status: "SERVING", host: "www.example.com" } } }]);
assert.equal(one.length, 1);
assert.deepEqual(liveHostsOf(one[0]), ["example.com", "www.example.com"]);

// a subdomain alone, then its apex connected later, folds under it
const grown = familiesOf([{ host: "shop.example.com", status: "VERIFIED" }, { host: "example.com", status: "PENDING" }]);
assert.equal(grown.length, 1);
assert.equal(grown[0].host, "example.com");
assert.deepEqual(familyState(grown[0]), { verified: false, partly: true, failed: false, live: false });

// a family whose apex is not connected keeps the first row as primary
const noApex = familiesOf([{ host: "a.example.net", status: "VERIFIED" }, { host: "b.example.net", status: "VERIFIED" }]);
assert.equal(noApex.length, 2, "siblings without their parent are two families");

assert.equal(listWords(["a"]), "a");
assert.equal(listWords(["a", "b"]), "a and b");
assert.equal(listWords(["a", "b", "c"]), "a, b and c");
assert.deepEqual(familiesOf(null), []);
console.log("domain-families: ok");
