export async function fetchJsonWithDna(
  url,
  options = {},
  dna = { rampUpMs: 250, mul: 8, rampDownMs: 700 }
) {
  const endHyper = beginHyperHelix(dna);
  try {
    return await fetchJson(url, options);
  } finally {
    endHyper?.();
  }
}