import { isMidEntryNumber } from './isMidEntryNumber.js';
import { normalizePercent } from './normalizePercent.js';

export function getXYSeries( points, prefix, inputLRV, inputURV){
  const inLRVn = Number(inputLRV?.value);
  const inURVn = Number(inputURV?.value);
  const span = (inURVn - inLRVn);

  return points.map(pt => {
    const inEl  = document.getElementById(`${prefix}_act_in_${pt}`);
    const outEl = document.getElementById(`${prefix}_act_out_${pt}`);

    const rawIn  = (inEl?.value ?? '').toString().trim();
    const rawOut = (outEl?.value ?? '').toString().trim();

    const actIn  = isMidEntryNumber(rawIn) ? NaN : Number(rawIn);
    const actOut = isMidEntryNumber(rawOut) ? NaN : Number(rawOut);

    // X percent from actual input; fallback to nominal step if missing
    let xPct = pt;
    if (!Number.isNaN(actIn) && span && !Number.isNaN(inLRVn) && !Number.isNaN(inURVn)) {
      const pct = normalizePercent(actIn, inLRVn, inURVn);
      if (pct != null && !Number.isNaN(pct)) xPct = pct * 100;
    }

    return { pt, xPct, y: actOut };
  }).filter(p => p.y != null && !Number.isNaN(p.y) && p.xPct != null && !Number.isNaN(p.xPct));
}