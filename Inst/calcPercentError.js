export function calcPercentError(actualOut, expectedOut, outLRVn, outURVn){
    const span = outURVn - outLRVn;
    if (!span) return null;
    return ((actualOut - expectedOut) / span) * 100;
  }