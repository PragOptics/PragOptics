export function roundTo(n, dp = 2){
  const x = Number(n);
  if (Number.isNaN(x)) return NaN;
  const f = Math.pow(10, dp);
  return Math.round((x + Number.EPSILON) * f) / f;
}