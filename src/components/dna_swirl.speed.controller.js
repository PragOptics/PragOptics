// src/components/dna_swirl.speed.controller.js

// ===== internal state =====
let helixMul = 1;

let helixMulFrom = 1;
let helixMulTo = 1;
let helixMulT0 = 0;
let helixMulDur = 0;

let helixHyperRefCount = 0;

// ===== helpers =====
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function easeInOutCubic(x) {
  return x < 0.5
    ? 4 * x * x * x
    : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function evalHelixMul(now) {
  if (helixMulDur <= 0) return helixMulTo;

  const t01 = clamp((now - helixMulT0) / helixMulDur, 0, 1);
  const k = easeInOutCubic(t01);
  return helixMulFrom + (helixMulTo - helixMulFrom) * k;
}

// ===== public API =====

export function getHelixSpeedMul(now) {
  helixMul = evalHelixMul(now);
  return helixMul;
}

export function setHelixSpeedMul(targetMul = 1, rampMs = 0) {
  const now = performance.now();

  // sync to current ramp position
  helixMul = evalHelixMul(now);

  helixMulFrom = helixMul;
  helixMulTo = clamp(Number(targetMul) || 1, 0.05, 12);
  helixMulT0 = now;
  helixMulDur = Math.max(0, Number(rampMs) || 0);

  if (helixMulDur === 0) {
    helixMul = helixMulTo;
  }
}

export function beginHyperHelix({
  rampUpMs = 250,
  mul = 7,
  rampDownMs = 600
} = {}) {
  helixHyperRefCount++;

  if (helixHyperRefCount === 1) {
    setHelixSpeedMul(mul, rampUpMs);
  }

  return function endHyperHelix() {
    helixHyperRefCount = Math.max(0, helixHyperRefCount - 1);
    if (helixHyperRefCount === 0) {
      setHelixSpeedMul(1, rampDownMs);
    }
  };
}