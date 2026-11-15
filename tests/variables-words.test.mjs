// The Environment variables card's words and rules (src/account/variablesWords.js, 2026-11-14).
import assert from "node:assert/strict";
import { nameOf, suggestedName, providerChoices, allowWords, useWords, pendingWords, migrationWords, formBody } from "../src/account/variablesWords.js";

assert.equal(nameOf("gemini api key"), "GEMINI_API_KEY");
assert.equal(nameOf("  Stripe-Secret "), "STRIPE_SECRET");
assert.equal(nameOf("9lives"), "", "a digit first is not a name");
assert.equal(nameOf("__x"), "X", "leading underscores drop");
assert.equal(suggestedName("google"), "GEMINI_API_KEY");
assert.equal(suggestedName("nothing"), "");

const catalog = [
  { id: "openai", label: "OpenAI", fields: [{ key: "apiKey", label: "API key", secret: true }], receivesData: "yes" },
  { id: "twilio", label: "Twilio", fields: [{ key: "accountSid", label: "Account SID" }, { key: "authToken", label: "Auth token", secret: true }] },
  { id: "microsoft", label: "Microsoft 365", fields: [], managedOnly: true },
  { id: "shopify", label: "Shopify supplier", fields: [], managedOnly: true }
];
const choices = providerChoices(catalog);
assert.deepEqual(choices.map(c => c.id), ["openai", "twilio", "other"]);
assert.deepEqual(choices[1].fields.map(f => f.key), ["accountSid"], "the non-secret fields stay as extra boxes");
assert.equal(choices[0].secret.key, "apiKey"); assert.equal(choices[0].receivesData, true);

assert.equal(allowWords({ roles: [], users: [] }), "Only you");
assert.equal(allowWords({ roles: ["admin", "member"], users: [] }), "You and admins, members");
assert.equal(allowWords({ roles: [], users: ["u1", "u2"] }), "You and 2 people");
assert.equal(allowWords({ roles: ["developer"], users: ["u1"] }, { people: [{ userId: "u1", email: "sam@acme.test" }] }), "You and developers and sam@acme.test");

const fmt = d => "today";
assert.equal(useWords({ uses: 0 }), "Never used yet.");
assert.equal(useWords({ uses: 3, lastUsedAt: "x", lastUsedBy: "u1", bindings: [{ status: "approved" }, { status: "pending" }] }, fmt), "Used 3 times in 1 place, last today.");
assert.equal(useWords({ uses: 1, lastUsedAt: "x", lastUsedBy: "site", bindings: [{ status: "approved" }] }, fmt), "Used 1 time in 1 place, last today by your site.");
assert.equal(pendingWords({ bindings: [{ status: "pending" }, { status: "approved" }] }), "1 use waits for your approval, under Requests on the Licensing tab.");
assert.equal(pendingWords({ bindings: [] }), "");

assert.equal(migrationWords([]), "");
assert.equal(migrationWords([{ name: "OPENAI_API_KEY", hint: "ab12" }, { name: "SITE_SQO74AD_X_GOOG_API_KEY", hint: "" }]), "2 keys you already hold can be named: OPENAI_API_KEY (…ab12), SITE_SQO74AD_X_GOOG_API_KEY.");

assert.deepEqual(formBody({ name: "gemini api key", value: " AIza-1 ", provider: "google", allowRoles: ["admin"], requireApproval: true }), { ok: true, body: { name: "GEMINI_API_KEY", value: "AIza-1", provider: "google", allow: { roles: ["admin"], users: [] }, requireApproval: true } });
assert.deepEqual(formBody({ name: "weather key", value: "wk", provider: "other", host: "https://API.Weather.example/v2", header: "" }), { ok: true, body: { name: "WEATHER_KEY", value: "wk", provider: "other", allow: { roles: [], users: [] }, requireApproval: false, host: "api.weather.example", header: "Authorization" } });
assert.equal(formBody({ name: "x", value: "", provider: "google" }).field, "value");
assert.equal(formBody({ name: "", value: "v", provider: "google" }).field, "name");
assert.equal(formBody({ name: "k", value: "v", provider: "other", host: "not a host" }).field, "host");
assert.equal(formBody({ name: "k", value: "v", provider: "twilio", extra: { accountSid: "" } }).field, "accountSid");
assert.deepEqual(formBody({ name: "k", value: "v", provider: "twilio", extra: { accountSid: " AC1 " } }).body.fields, { accountSid: "AC1" });
console.log("variables-words: ok");

// approval on use is instead of scoping (2026-11-15): the words say so, whatever roles the row still carries
assert.equal(allowWords({ roles: ['admin'] }, { requireApproval: true }), 'Anyone on the team may ask; each use waits for your approval');
assert.equal(allowWords({ roles: ['admin'] }, { requireApproval: false }), 'You and admins');
