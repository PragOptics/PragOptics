// attach2dpBlurFormatting.js
export function attach2dpBlurFormatting(deps){
  const {
    documentRef,              // document
    asLeftDirty,              // Set()
    sanitizeNumericTyping,    // (raw)=>string
    formatTo2,                // (el)=>void
    isMidEntryNumber,         // (raw)=>bool
    getAllowedActualInputBand,// (pointPct)=>band|null
    clamp,                    // (n,min,max)=>number
    getInputUOMValue,         // ()=>string|null
    toast,                    // (msg,type,ttl)=>void
    flushCalculateAll         // ()=>void
  } = deps;

  const all = documentRef.querySelectorAll(
    '[id^="af_act_in_"],[id^="af_act_out_"],[id^="al_act_in_"],[id^="al_act_out_"]'
  );

  all.forEach(el => {
    if (!(el instanceof HTMLInputElement)) return;

    // sanitize on input (numeric only feel)
    el.addEventListener('input', () => {
      const raw = el.value;
      const cleaned = sanitizeNumericTyping(raw);
      if (cleaned !== raw) el.value = cleaned;
    });

    // enforce 2dp on blur + constrain Actual Input band (AF/AL act_in only)
    el.addEventListener('blur', () => {
      // 1) normalize to 2dp first (so comparisons align with UI contract)
      formatTo2(el);

      // 2) If this is an Actual Input field, enforce per-row tolerance band
      // IDs: af_act_in_<point> or al_act_in_<point>
      const m = el.id.match(/^(af|al)_act_in_(\d+)$/);
      if (m) {
        const prefix = m[1];           // 'af' | 'al'
        const pointPct = Number(m[2]); // 0/25/50/75/100

        // Parse the now-formatted value
        const raw = (el.value ?? '').toString().trim();
        if (!isMidEntryNumber(raw) && raw !== '') {
          const val = Number(raw);
          if (!Number.isNaN(val)) {
            const band = getAllowedActualInputBand(pointPct);

            if (band) {
              const { min, max, tolPct } = band;

              if (val < min || val > max) {
                const clamped = clamp(val, min, max);

                // Write back clamped value in the same 2dp contract
                el.value = clamped.toFixed(2);

                // Toast with clear, operator-friendly info
                const uom = getInputUOMValue() || '';
                toast(
                  `Actual Input @ ${pointPct}% must be within ${min.toFixed(2)}–${max.toFixed(2)} ${uom} (±${Number(tolPct).toFixed(2)}% of span). Adjusted.`,
                  'warn',
                  4200
                );

                // If this was As-Left, ensure this point is considered "tech edited"
                // (so mirroring won't overwrite after the user interacted)
                if (prefix === 'al') asLeftDirty.add(pointPct);
              }
            }
          }
        }
      }

      // 3) Recompute everything after potential adjustment
      flushCalculateAll();
    });
  });
}