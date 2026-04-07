export function isMidEntryNumber(raw){
  raw = (raw ?? '').toString().trim();
  return (
    raw === '' ||
    raw === '-' ||
    raw === '.' ||
    raw === '-.' ||
    raw.endsWith('.')
  );
}