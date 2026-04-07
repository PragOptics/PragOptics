// submitForm.js
export function submitForm(deps){
  const {
    points,
    tolerance,
    forceShowAsLeft,

    tagSelect,
    workOrder,

    inputType,
    inputLRV,
    inputURV,
    getInputUOMValue,
    inputEquipSelect,

    outputType,
    outputLRV,
    outputURV,
    getOutputCharacteristic,
    getOutputUOMValue,
    outputEquipSelect,

    outputEl,
    toast,
    openPrintableReport,

    hasAllAsFoundData,
    flushCalculateAll
  } = deps;

  if (!hasAllAsFoundData()) {
    toast(
      'Complete all As‑Found fields (Actual Input and Actual Output at every point) before generating the report.',
      'warn',
      4200
    );
    return;
  }

  flushCalculateAll();

  requestAnimationFrame(() => {
    const readRows = (prefix) => {
      return points.map(p => {
        const expectedInput  = document.getElementById(`${prefix}_exp_in_${p}`)?.textContent ?? null;
        const expectedOutput = document.getElementById(`${prefix}_exp_out_${p}`)?.textContent ?? null;
        const errorPercent   = document.getElementById(`${prefix}_err_${p}`)?.textContent ?? null;

        const aiEl = document.getElementById(`${prefix}_act_in_${p}`);
        const aoEl = document.getElementById(`${prefix}_act_out_${p}`);

        const actualInput  = (aiEl?.value ?? '').toString().trim() || null;
        const actualOutput = (aoEl?.value ?? '').toString().trim() || null;

        return { point: p, expectedInput, actualInput, expectedOutput, actualOutput, errorPercent };
      });
    };

    const asFound = readRows('af');

    const tol = Number(tolerance?.value) || 0;
    const anyFail = asFound.some(r =>
      r.errorPercent && r.errorPercent !== '—' && Math.abs(Number(r.errorPercent)) >= tol
    );

    const asLeft =
      (!forceShowAsLeft?.checked && !anyFail)
        ? JSON.parse(JSON.stringify(asFound))
        : readRows('al');

    const payload = {
      tag: tagSelect?.value || null,
      workOrder: workOrder?.value || null,

      input: {
        type: inputType?.value || null,
        LRV: inputLRV?.value || null,
        URV: inputURV?.value || null,
        UOM: getInputUOMValue(),
        testEquipment: inputEquipSelect?.value || null
      },

      output: {
        type: outputType?.value || null,
        characteristic: getOutputCharacteristic(),
        LRV: outputLRV?.value || null,
        URV: outputURV?.value || null,
        UOM: getOutputUOMValue(),
        testEquipment: outputEquipSelect?.value || null
      },

      tolerance: tolerance?.value || null,
      technician: document.getElementById('tech')?.value || null,
      comments: document.getElementById('comments')?.value || null,

      asFound,
      asLeft,
      timestamp: new Date().toISOString()
    };

    if (outputEl) outputEl.value = JSON.stringify(payload, null, 2);
    toast('Report generated successfully.', 'info', 2000);

    openPrintableReport(payload);
  });
}