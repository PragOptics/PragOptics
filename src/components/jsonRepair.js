// src/components/jsonRepair.js

// Deterministic, low-risk repairs only.
// Goal: make JSON.parse succeed without guessing missing values.

function stripTrailingCommas(input) {
  let out = "";
  let inStr = false;
  let escd = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inStr) {
      out += ch;
      if (escd) { escd = false; continue; }
      if (ch === "\\") { escd = true; continue; }
      if (ch === "\"") inStr = false;
      continue;
    }

    if (ch === "\"") { inStr = true; out += ch; continue; }

    // if we see a comma, look ahead for only whitespace then a closing brace/bracket
    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      const next = input[j];
      if (next === "}" || next === "]") {
        // skip this comma (remove trailing comma)
        continue;
      }
    }

    out += ch;
  }

  return out;
}

function quoteBareKeys(input) {
  // Quotes unquoted object keys when they are clearly keys:
  // { foo: 1 } -> { "foo": 1 }
  // Safe approach: state machine, only when not in string, and only when followed by colon.
  let out = "";
  let inStr = false;
  let escd = false;

  // track whether we're inside an object expecting a key (not perfect JSON parser, but deterministic)
  const stack = []; // '{' or '['
  let expectKey = false; // only meaningful when top of stack is '{'

  function top() { return stack[stack.length - 1]; }

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inStr) {
      out += ch;
      if (escd) { escd = false; continue; }
      if (ch === "\\") { escd = true; continue; }
      if (ch === "\"") {
        inStr = false;
        // after a string in object, next meaningful token could be colon (key) or comma/close (value string)
      }
      continue;
    }

    if (ch === "\"") { inStr = true; out += ch; continue; }

    if (ch === "{") { stack.push("{"); expectKey = true; out += ch; continue; }
    if (ch === "[") { stack.push("["); out += ch; continue; }

    if (ch === "}" || ch === "]") {
      stack.pop();
      expectKey = (top() === "{"); // if we close into an object, next could be comma/close; keep simple
      out += ch;
      continue;
    }

    if (ch === ",") {
      // after comma in object => expect key; in array => expect value
      if (top() === "{") expectKey = true;
      out += ch;
      continue;
    }

    if (ch === ":") {
      // after colon in object => expect value (not key)
      if (top() === "{") expectKey = false;
      out += ch;
      continue;
    }

    // Only attempt to quote when:
    // - inside object
    // - expecting key
    // - see an identifier start
    if (top() === "{" && expectKey && /[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_$]/.test(input[j])) j++;

      // look ahead for whitespace then colon
      let k = j;
      while (k < input.length && /\s/.test(input[k])) k++;

      if (input[k] === ":") {
        const key = input.slice(i, j);
        out += `"${key}"`;
        i = j - 1; // advance
        expectKey = false; // key consumed; colon will flip state again
        continue;
      }
    }

    // default
    out += ch;
  }

  return out;
}

function balanceClosers(input) {
  // If JSON ends early, append required closers (} or ]) based on a string-safe scan.
  let inStr = false;
  let escd = false;
  const stack = [];

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inStr) {
      if (escd) { escd = false; continue; }
      if (ch === "\\") { escd = true; continue; }
      if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") { inStr = true; continue; }

    if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}" && stack[stack.length - 1] === "{") stack.pop();
    else if (ch === "]" && stack[stack.length - 1] === "[") stack.pop();
  }

  if (!stack.length) return input;

  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += (stack[i] === "{") ? "}" : "]";
  }
  return input + suffix;
}

export function repairJson(raw) {
  const original = String(raw || "");

  // If empty / whitespace, nothing to repair
  if (!original.trim()) return { ok: true, text: original, reason: "Empty" };

  // If already valid JSON object, return unchanged
  try {
    const parsed = JSON.parse(original);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, text: original, reason: "Already valid" };
    }
    // Valid but not an object → do not “repair” into something else
    return { ok: false, text: original, reason: "JSON must be an object" };
  } catch {
    // continue
  }

  // Apply safe transforms in order; stop as soon as we become valid
  const attempts = [
    { name: "Removed trailing commas", fn: stripTrailingCommas },
    { name: "Quoted bare object keys", fn: quoteBareKeys },
    { name: "Balanced missing closers", fn: balanceClosers }
  ];

  let cur = original;

  for (const step of attempts) {
    const next = step.fn(cur);
    if (next === cur) continue;

    try {
      const parsed = JSON.parse(next);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ok: true, text: next, reason: step.name };
      }
    } catch {
      // keep trying
    }

    cur = next;
  }

  return { ok: false, text: original, reason: "Unable to repair automatically" };
}
