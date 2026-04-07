import { normalizePercent } from './normalizePercent.js';
import { outputFromPercent } from './outputFromPercent.js';

export function getExpectedOutCurve( points, inputLRV, inputURV, outputLRV, outputURV, getOutputCharacteristic){
  // expected curve based on percent points (stable reference)
  const inLRVn  = Number(inputLRV?.value);
  const inURVn  = Number(inputURV?.value);
  const outLRVn = Number(outputLRV?.value);
  const outURVn = Number(outputURV?.value);
  const ch = getOutputCharacteristic();

  if ([inLRVn, inURVn, outLRVn, outURVn].some(Number.isNaN)) {
    return points.map(() => null);
  }

  return points.map(p => {
    const expIn = inLRVn + (p / 100) * (inURVn - inLRVn);
    const pct = normalizePercent(expIn, inLRVn, inURVn);
    const y = (pct == null)
      ? null
      : outputFromPercent(pct, outLRVn, outURVn, ch);

    return (y == null || Number.isNaN(y)) ? null : y;
  });
}