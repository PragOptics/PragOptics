// src/api/fetchWithDna.js
import { beginHyperHelix } from '../components/dna_swirl.speed.controller.js';

/**
 * Wrap native fetch() with DNA hyper orchestration.
 * Does NOT delay the network request.
 * Optional minVisibleMs holds the *visual* hyper state for observability.
 */
export async function fetchWithDna(
  url,
  options = {},
  dna = { rampUpMs: 250, mul: 8, rampDownMs: 700, minVisibleMs: 0 }
) {
  const t0 = performance.now();

  const {
    minVisibleMs = 0,
    rampUpMs = 250,
    mul = 8,
    rampDownMs = 700
  } = dna || {};

  const endHyper = beginHyperHelix({ rampUpMs, mul, rampDownMs });

  try {
    return await fetch(url, options);
  } finally {
    const hold = Math.max(0, Number(minVisibleMs) || 0);
    if (hold > 0) {
      const elapsed = performance.now() - t0;
      const wait = Math.max(0, hold - elapsed);
      if (wait) setTimeout(() => endHyper?.(), wait);
      else endHyper?.();
    } else {
      endHyper?.();
    }
  }
}