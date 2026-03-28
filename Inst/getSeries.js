import { isMidEntryNumber } from './isMidEntryNumber.js';

export function getSeries(prefix, field){
    // field: 'in' or 'out'
    return points.map(p => {
      const el = document.getElementById(`${prefix}_act_${field}_${p}`);
      const raw = (el?.value ?? '').toString().trim();
      if (isMidEntryNumber(raw)) return null;
      const n = Number(raw);
      return Number.isNaN(n) ? null : n;
    });
  }