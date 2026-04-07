// calculateAll.js
export function calculateAll(deps){
  const {
    // DOM refs / elements
    inputLRV, inputURV, outputLRV, outputURV, tolerance,
    asFoundGrid, asLeftGrid,
    forceShowAsLeft, afStatus, alStatus, ts,

    // constants
    points,

    // shared state
    state,          // { anyOutOfTolerance, lastAnyOut, asLeftDirty:Set }

    // helpers (already modularized in your bridge)
    getOutputCharacteristic,
    isMidEntryNumber,
    normalizePercent,
    outputFromPercent,
    roundTo,
    calcPercentError,

    // ui helper
    toast
  } = deps;

  const inLRVn  = Number(inputLRV?.value);
  const inURVn  = Number(inputURV?.value);
  const outLRVn = Number(outputLRV?.value);
  const outURVn = Number(outputURV?.value);
  const tolVal  = Number(tolerance?.value) || 0;

  const characteristic = getOutputCharacteristic?.();

  // As-Found failing points (for As-Left green "corrected")
  const afFailPoints = new Set();

  // PASS 1: expected displays + As-Found fails
  const afErrMap = new Map();

  points.forEach(p => {
    // Expected input based on percent point (still shown)
    const expInPct = p / 100;
    const expIn = (!Number.isNaN(inLRVn) && !Number.isNaN(inURVn)) ? (inLRVn + expInPct * (inURVn - inLRVn)) : NaN;

    // AF actual input for this row
    const afActInEl = document.getElementById(`af_act_in_${p}`);
    const afActOutEl = document.getElementById(`af_act_out_${p}`);
    const rawAfIn = (afActInEl?.value ?? '').toString().trim();
    const rawAfOut = (afActOutEl?.value ?? '').toString().trim();

    const afActIn = isMidEntryNumber(rawAfIn) ? NaN : Number(rawAfIn);
    const afActOut = isMidEntryNumber(rawAfOut) ? NaN : Number(rawAfOut);

    // Expected output computed from AF actual input if provided, else from expected input
    let expectedOutAF = NaN;
    if (!Number.isNaN(inLRVn) && !Number.isNaN(inURVn) && !Number.isNaN(outLRVn) && !Number.isNaN(outURVn)) {
      const baseIn = Number.isNaN(afActIn) ? expIn : afActIn;
      const pct = normalizePercent(baseIn, inLRVn, inURVn);
      expectedOutAF = (pct == null) ? NaN : outputFromPercent(pct, outLRVn, outURVn, characteristic);
    }

    // Fill expected displays (AF)
    const afExpInEl  = document.getElementById(`af_exp_in_${p}`);
    const afExpOutEl = document.getElementById(`af_exp_out_${p}`);
    const alExpInEl  = document.getElementById(`al_exp_in_${p}`);

    if (afExpInEl)  afExpInEl.textContent  = Number.isNaN(expIn) ? '—' : expIn.toFixed(2);
    if (afExpOutEl) afExpOutEl.textContent = (expectedOutAF == null || Number.isNaN(expectedOutAF)) ? '—' : expectedOutAF.toFixed(2);
    if (alExpInEl)  alExpInEl.textContent  = Number.isNaN(expIn) ? '—' : expIn.toFixed(2);

    // As-Found error
    let errText = '—';
    let isFail = false;

    if (!Number.isNaN(afActOut) && !Number.isNaN(expectedOutAF) &&
        !Number.isNaN(outLRVn) && !Number.isNaN(outURVn) && (outURVn - outLRVn) !== 0) {

      // ✅ round BOTH sides to what the tech sees (2dp)
      const afActOut_2dp      = roundTo(afActOut, 2);
      const expectedOutAF_2dp = roundTo(expectedOutAF, 2);

      const err = calcPercentError(
        afActOut_2dp,
        expectedOutAF_2dp,
        outLRVn,
        outURVn
      );

      errText = (err == null) ? '—' : err.toFixed(2);

      // ✅ Compare using the same 2dp contract the user sees
      const err2 = roundTo(err, 2);
      const tol2 = roundTo(tolVal, 2);

      // ✅ Restore “don’t flag while typing in Actual Output”
      const focusedOut = (document.activeElement === afActOutEl);

      // FAIL rule: >= tolerance is out of tolerance (but only once field is not focused)
      isFail = focusedOut ? false : (Math.abs(err2) >= tol2);

      if (!focusedOut && isFail) afFailPoints.add(p);
    }

    afErrMap.set(p, { errText, isFail, expectedOutAF });
  });

  state.anyOutOfTolerance = afFailPoints.size > 0;

  // PASS 2: As-Found highlight + As-Left mirror/edit + As-Left expected output + As-Left fail/pass
  points.forEach(p => {
    const { errText, isFail, expectedOutAF } = afErrMap.get(p);

    const afRow = asFoundGrid?.querySelector(`.reading-row[data-point="${p}"]`);
    const alRow = asLeftGrid?.querySelector(`.reading-row[data-point="${p}"]`);

    // As-Found highlight + error text
    if (afRow) afRow.classList.toggle('fail', isFail);
    const afErrEl = document.getElementById(`af_err_${p}`);
    if (afErrEl) afErrEl.textContent = errText;

    // Mirror source
    const afInEl  = document.getElementById(`af_act_in_${p}`);
    const afOutEl = document.getElementById(`af_act_out_${p}`);
    const afInVal  = (afInEl?.value ?? '').toString();
    const afOutVal = (afOutEl?.value ?? '').toString();

    // As-Left inputs
    const alInEl  = document.getElementById(`al_act_in_${p}`);
    const alOutEl = document.getElementById(`al_act_out_${p}`);
    const alErrEl = document.getElementById(`al_err_${p}`);

    const editMode = state.anyOutOfTolerance || (forceShowAsLeft?.checked === true);

    // Reset As-Left row classes each pass
    if (alRow) { alRow.classList.remove('fail'); alRow.classList.remove('pass'); }

    if (!editMode) {
      // Mirror + lock
      if (alInEl)  { alInEl.value  = afInVal;  alInEl.disabled  = true; }
      if (alOutEl) { alOutEl.value = afOutVal; alOutEl.disabled = true; }

      // Expected Out for AL mirrors AF expected out in this mode
      const alExpOutEl = document.getElementById(`al_exp_out_${p}`);
      if (alExpOutEl) alExpOutEl.textContent = (expectedOutAF == null || Number.isNaN(expectedOutAF)) ? '—' : expectedOutAF.toFixed(2);

      // AL error mirrors AF error in this mode
      if (alErrEl) alErrEl.textContent = errText;
      return;
    }

    // Editable mode
    if (alInEl)  alInEl.disabled = false;
    if (alOutEl) alOutEl.disabled = false;

    // Live mirror until tech edits this point
    if (!state.asLeftDirty.has(p)) {
      if (alInEl)  alInEl.value  = afInVal;
      if (alOutEl) alOutEl.value = afOutVal;
    }

    // Compute AL expected output based on AL actual input (or expected input if AL actual input empty)
    const expInText = document.getElementById(`al_exp_in_${p}`)?.textContent ?? '—';
    const expInNum = Number(expInText);
    const rawAlIn = (alInEl?.value ?? '').toString().trim();
    const alActIn = isMidEntryNumber(rawAlIn) ? NaN : Number(rawAlIn);
    const baseInAL = Number.isNaN(alActIn) ? (Number.isNaN(expInNum) ? NaN : expInNum) : alActIn;

    let expectedOutAL = NaN;
    if (!Number.isNaN(inLRVn) && !Number.isNaN(inURVn) && !Number.isNaN(outLRVn) && !Number.isNaN(outURVn) && !Number.isNaN(baseInAL)) {
      const pct = normalizePercent(baseInAL, inLRVn, inURVn);
      expectedOutAL = (pct == null) ? NaN : outputFromPercent(pct, outLRVn, outURVn, characteristic);
    }

    const alExpOutEl = document.getElementById(`al_exp_out_${p}`);
    if (alExpOutEl) {
      alExpOutEl.textContent =
        (expectedOutAL == null || Number.isNaN(expectedOutAL))
          ? '—'
          : roundTo(expectedOutAL, 2).toFixed(2);
    }

    // Compute AL error from AL actual output vs expectedOutAL
    const rawAlOut = (alOutEl?.value ?? '').toString().trim();
    const alActOut = isMidEntryNumber(rawAlOut) ? NaN : Number(rawAlOut);

    let alErr = null;
    let alErrText = '—';

    if (!Number.isNaN(alActOut) && !Number.isNaN(expectedOutAL) &&
        !Number.isNaN(outLRVn) && !Number.isNaN(outURVn) &&
        (outURVn - outLRVn) !== 0) {

      // ✅ round BOTH sides to the same 2dp contract the user sees
      const alActOut_2dp      = roundTo(alActOut, 2);
      const expectedOutAL_2dp = roundTo(expectedOutAL, 2);

      alErr = calcPercentError(
        alActOut_2dp,
        expectedOutAL_2dp,
        outLRVn,
        outURVn
      );

      alErrText = (alErr == null) ? '—' : alErr.toFixed(2);
    }

    if (alErrEl) alErrEl.textContent = alErrText;

    // As-Left highlight (use SAME 2dp contract as UI + As-Found)
    if (alErr != null && alRow) {
      const err2 = roundTo(alErr, 2);
      const tol2 = roundTo(tolVal, 2);

      const focusedOut = (document.activeElement === alOutEl);

      if (focusedOut) {
        return;
      }

      const alFail = Math.abs(err2) >= tol2;

      if (alFail) {
        alRow.classList.add('fail');
      } else if (afFailPoints.has(p)) {
        alRow.classList.add('pass');
      }
    }
  });

  // Badges + toast
  if (state.anyOutOfTolerance) {
    if (afStatus) afStatus.style.display = 'inline-flex';
    if (alStatus) alStatus.style.display = 'inline-flex';

    // force edit mode ON
    if (forceShowAsLeft) forceShowAsLeft.checked = true;

    if (!state.lastAnyOut) {
      toast('As‑Found out of tolerance — calibration required. Enter As‑Left values.', 'warn', 4200);
    }
  } else {
    if (afStatus) afStatus.style.display = 'none';
    if (alStatus) alStatus.style.display = 'none';
  }

  state.lastAnyOut = state.anyOutOfTolerance;
  if (ts) ts.textContent = new Date().toLocaleString();
}
