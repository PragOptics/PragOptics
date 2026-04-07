// src/runtime/router.js
import { mountDnaSwirl } from '../components/dna_swirl.js';

export function initDnaSwirl() {
  return mountDnaSwirl('#dnaSwirl', {
    /* === Visual smoothness === */
    dotSpacingPx: 4.6,
    idleShimmerMul: 0.22,
    glowBridge: true,

    /* === Logo behavior === */
    logoMask: false,
    logoFadeInSecs: 0.30,

    /* === Intro speed === */
    buildDotsPerSec: 240,
    holdSecs: 0.25,
    shedDotsPerSec: 280,

    /* === Convergence feel === */
    snapEps: 1.1,
    easeToAnchor: 0.18
  });
}

// Back-compat for inline handlers / global calls while refactoring
globalThis.initDnaSwirl = initDnaSwirl;


// Back-compat registry: expose specific functions for inline HTML onclick="..."
export function registerLegacyGlobals(map) {
  if (!map || typeof map !== "object") return;
  Object.assign(globalThis, map);
}