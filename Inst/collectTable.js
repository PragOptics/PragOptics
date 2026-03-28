export function collectTable(prefix){
    return points.map(p => {
      const expectedInput  = document.getElementById(`${prefix}_exp_in_${p}`)?.textContent || null;
      const actualInput    = document.getElementById(`${prefix}_act_in_${p}`)?.value || null;
      const expectedOutput = document.getElementById(`${prefix}_exp_out_${p}`)?.textContent || null;
      const actualOutput   = document.getElementById(`${prefix}_act_out_${p}`)?.value || null;
      const errorPercent   = document.getElementById(`${prefix}_err_${p}`)?.textContent || null;

      return { point: p, expectedInput, actualInput, expectedOutput, actualOutput, errorPercent };
    });
  }