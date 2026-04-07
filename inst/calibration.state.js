// calibration.state.js
export function createCalibrationState() {
  let anyOutOfTolerance = false;
  let lastAnyOut = false;
  let gridsReady = false;
  let calcTimer = null;

  return {
    // ---- tolerance flags ----
    getAnyOutOfTolerance: () => anyOutOfTolerance,
    setAnyOutOfTolerance: (v) => { anyOutOfTolerance = !!v; },

    getLastAnyOut: () => lastAnyOut,
    setLastAnyOut: (v) => { lastAnyOut = !!v; },

    // ---- grid lifecycle ----
    getGridsReady: () => gridsReady,
    setGridsReady: (v) => { gridsReady = !!v; },

    // ---- debounce timer ----
    getCalcTimer: () => calcTimer,
    setCalcTimer: (v) => { calcTimer = v; },

    // ---- reset helper ----
    reset() {
      anyOutOfTolerance = false;
      lastAnyOut = false;
      gridsReady = false;
      calcTimer = null;
    }
  };
}