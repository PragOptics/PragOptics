export function getAllowedActualInputBand( pointPct, inLRVn, inURVn, tolPct, getExpectedInputForPointFn){
  if (Number.isNaN(inLRVn) || Number.isNaN(inURVn) || inURVn === inLRVn) {
    return null;
  }

  const span = (inURVn - inLRVn);
  const expIn = getExpectedInputForPointFn(pointPct, inLRVn, inURVn);

  if (Number.isNaN(expIn)) return null;

  const delta = Math.abs(span) * ((Number(tolPct) || 0) / 100);

  return {
    expIn,
    min: expIn - delta,
    max: expIn + delta,
    tolPct: Number(tolPct) || 0,
    span
  };
}