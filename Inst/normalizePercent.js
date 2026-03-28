export function normalizePercent(actualIn, inLRVn, inURVn){
    const span = (inURVn - inLRVn);
    if (!span) return null;
    return (actualIn - inLRVn) / span;
  }