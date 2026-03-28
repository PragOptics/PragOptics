export function outputFromPercent(percent, outLRVn, outURVn, characteristic){
    const outSpan = outURVn - outLRVn;
    if (!outSpan) return null;

    if (characteristic === 'sqrt') {
      // Clamp percent to >=0 for sqrt domain (negative percent -> treat as 0)
      const p = Math.max(0, percent);
      return outLRVn + outSpan * Math.sqrt(p);
    }
    // linear
    return outLRVn + outSpan * percent;
  }