export function sanitizeNumericTyping(raw){
  raw = (raw ?? '').toString();

  // Keep leading '-' if present
  const neg = raw.startsWith('-');

  // Remove everything except digits and '.'
  raw = raw.replace(/[^0-9.]/g, '');

  // Keep only the first '.'
  const parts = raw.split('.');
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');

  return neg ? '-' + raw : raw;
}