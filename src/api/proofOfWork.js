// src/api/proofOfWork.js
//
// THE PLATFORM'S OWN CHALLENGE, SOLVED IN THE PAGE (2026-09-24, for the signed-out Report a site form). The platform
// hands the page a signed challenge (auth/publicDoors.js mintChallenge: { nonce, difficulty, minAgeMs }); the page
// finds a counter whose sha256(nonce + "." + counter) starts with `difficulty` zero bits and sends it with the form,
// no sooner than minAgeMs after the challenge was made. A small SHA-256 over ASCII here, because crypto.subtle is
// asynchronous per hash and far slower for the tens of thousands of tries a solve takes; the work runs in slices that
// give the page back between them, so typing and the spinner never stall.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const W = new Uint32Array(64);
const ror = (x, n) => (x >>> n) | (x << (32 - n));

/** SHA-256 of an ASCII string (the challenge's nonce and a counter are ASCII), as eight 32-bit words. */
export function sha256Words(ascii) {
  const s = String(ascii);
  const l = s.length;
  const size = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(size);
  for (let i = 0; i < l; i++) m[i] = s.charCodeAt(i) & 0xff;
  m[l] = 0x80;
  const bits = l * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(size - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(size - 4, bits >>> 0);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let off = 0; off < size; off += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = W[t - 15], y = W[t - 2];
      W[t] = (W[t - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + W[t - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10))) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) >>> 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7];
}

/** The leading zero bits of a hash given as eight words. */
export function leadingZeroBits(H) {
  let n = 0;
  for (const w of H) { if (w === 0) { n += 32; continue; } n += Math.clz32(w); break; }
  return n;
}

/**
 * The counter that solves the challenge, found in slices of `slice` tries with the page given back between them.
 * Gives up (answers '') after `max` tries: the server's difficulty is small, so that only happens to a broken page.
 */
export async function solveChallenge({ nonce, difficulty }, { slice = 20000, max = 20000000 } = {}) {
  const need = Number(difficulty) || 0;
  const pre = `${nonce}.`;
  for (let c = 0; c < max;) {
    const end = Math.min(max, c + slice);
    for (; c < end; c++) if (leadingZeroBits(sha256Words(pre + c)) >= need) return String(c);
    await new Promise((r) => setTimeout(r, 0));
  }
  return '';
}
