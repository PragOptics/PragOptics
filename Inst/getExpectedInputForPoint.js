export function getExpectedInputForPoint(pointPct, inLRVn, inURVn){
    if (Number.isNaN(inLRVn) || Number.isNaN(inURVn)) return NaN;
    return inLRVn + (pointPct / 100) * (inURVn - inLRVn);
  }