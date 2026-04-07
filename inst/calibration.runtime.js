// =======================================================
// TEMPLATE MOUNT (must run before any getElementById lookups)
// =======================================================

(async () => {
  await window.mountHeader?.();
  window.initDnaSwirl?.();
  await window.mountCalibrationTemplates?.();
  await window.mountFooter?.();
  window.initFooter?.();
  initCalibrationRuntime();
})();

// =======================================================
// DOM ELEMENTS & RUNTIME CONSTANTS
// =======================================================
function initCalibrationRuntime() {
const tagSearch = document.getElementById('tagSearch');
const tagSelect = document.getElementById('tagSelect');
const workOrder = document.getElementById('workOrder');

const inputType = document.getElementById('inputType');
const inputLRV  = document.getElementById('inputLRV');
const inputURV  = document.getElementById('inputURV');
const inputUOM  = document.getElementById('inputUOM');
const inputUOMCustom = document.getElementById('inputUOMCustom');

const outputType = document.getElementById('outputType');
const outputLRV  = document.getElementById('outputLRV');
const outputURV  = document.getElementById('outputURV');
const outputUOM  = document.getElementById('outputUOM');
const outputUOMCustom = document.getElementById('outputUOMCustom');

const outputCharacteristic = document.getElementById('outputCharacteristic');

const tolerance = document.getElementById('tolerance');

const asFoundGrid = document.getElementById('asFoundGrid');
const asLeftGrid  = document.getElementById('asLeftGrid');

const forceShowAsLeft = document.getElementById('forceShowAsLeft');
const clearAsLeftBtn  = document.getElementById('clearAsLeftBtn');

const afStatus = document.getElementById('afStatus');
const alStatus = document.getElementById('alStatus');

const generateBtn = document.getElementById('generateBtn');
const resetBtn    = document.getElementById('resetBtn');

const outputEl = document.getElementById('output');
const copyBtn  = document.getElementById('copyBtn');

const ts = document.getElementById('ts');
const toastWrap = document.getElementById('toastWrap');

const points = [0,25,50,75,100];

const instrumentSetupCard = document.getElementById('instrumentSetup');
const asFoundCard = document.getElementById('asFoundCard');
const asLeftCard = document.getElementById('asLeftCard');
const techCard = document.getElementById('techCard');
const outputCard = document.getElementById('outputCard');

// =======================================================
// PAGE / BROWSER BEHAVIOR
// =======================================================

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// =======================================================
// EXPOSE RUNTIME CONTRACT (used by bridge + helpers)
// =======================================================

Object.assign(window, {
  // calibration points
  points,

  // grids
  asFoundGrid,
  asLeftGrid,

  // range inputs (used by calculateAll / scheduleCalculateAll)
  inputLRV,
  inputURV,
  outputLRV,
  outputURV,

  // tolerance element
  tolerance
});

window.points = points;
window.tolerance = tolerance;

// =======================================================
// VALIDATION & WIZARD GATING FUNCTIONS
// =======================================================

/* Minimal gating: keep it permissive, but warn */
function isSetupSane(){
  const inLRVn = Number(inputLRV?.value);
  const inURVn = Number(inputURV?.value);
  const outLRVn = Number(outputLRV?.value);
  const outURVn = Number(outputURV?.value);

  const okRanges =
    !Number.isNaN(inLRVn) && !Number.isNaN(inURVn) && inURVn !== inLRVn &&
    !Number.isNaN(outLRVn) && !Number.isNaN(outURVn) && outURVn !== outLRVn;

  return okRanges;
}

function hasAllAsFoundData(){
  return points.every(p => {
    const aiEl = document.getElementById(`af_act_in_${p}`);
    const aoEl = document.getElementById(`af_act_out_${p}`);

    if (!aiEl || !aoEl) return false;

    const ai = aiEl.value.trim();
    const ao = aoEl.value.trim();

    // Reject empty or mid-entry values
    if (
      ai === '' || ao === '' ||
      ai === '-' || ao === '-' ||
      ai === '.' || ao === '.' ||
      ai === '-.' || ao === '-.' ||
      ai.endsWith('.') || ao.endsWith('.')
    ) {
      return false;
    }

    // Reject non-numeric
    if (Number.isNaN(Number(ai)) || Number.isNaN(Number(ao))) {
      return false;
    }

    return true;
  });
}

window.hasAllAsFoundData = hasAllAsFoundData;

function shouldRequireAsLeft(){
  return calState.engine.getAnyOutOfTolerance() === true;
}

// =========================
// Wizard initialization
// =========================


const wizard = initCalibrationWizard({
  instrumentSetupCard,
  asFoundCard,
  asLeftCard,
  techCard,
  outputCard,

  toast,
  flushCalculateAll,
  isSetupSane,
  hasAllAsFoundData,
  shouldRequireAsLeft
});

wizard.setWizStep('setup');



// =========================
// Card-as-wizard navigation wiring (REQUIRED)
// =========================

// Setup → As-Found
document.getElementById('toAsFoundBtn')?.addEventListener('click', () => {
  if (!isSetupSane()) {
    toast('Setup incomplete: enter valid input/output ranges first.', 'warn', 3600);
    return;
  }
  wizard.setWizStep('af');
});

// As-Found → Setup
document.getElementById('backToSetupBtn')?.addEventListener('click', () => {
  wizard.setWizStep('setup');
});

// As-Found → As-Left OR Finalize
document.getElementById('toNextFromAfBtn')?.addEventListener('click', () => {
  flushCalculateAll();

  if (!hasAllAsFoundData()) {
  toast(
    'Complete all As‑Found fields (Actual Input and Actual Output at every point) before continuing.',
    'warn',
    4200
  );
  return;
}

  wizard.setWizStep('al');
});

// As-Left → As-Found
document.getElementById('backToAfBtn')?.addEventListener('click', () => {
  wizard.setWizStep('af');
});

// As-Left → Finalize
document.getElementById('toFinalizeBtn')?.addEventListener('click', () => {
  flushCalculateAll();
  wizard.setWizStep('final');
});

// Finalize → back to last data step
document.getElementById('backToDataBtn')?.addEventListener('click', () => {
  wizard.setWizStep('al');
});

// =========================
  // Graph display state
// =========================
const graphState = {
  showAF: true,
  showAL: true,
  showBand: true
};

// Graph UI state (globals)
let graphHitTargets = [];     // rebuilt every drawGraph()
let graphTipLocked = false;   // tap to lock tooltip on mobile

window.graphState = graphState;
window.getGraphHitTargets = () => graphHitTargets;
window.setGraphHitTargets = (v) => { graphHitTargets = v; };
window.getGraphTipLocked = () => graphTipLocked;
window.setGraphTipLocked = (v) => { graphTipLocked = v; };

  // =========================
  // Tag library (tag + desc + class)
  // =========================
  let tagLibrary = [];


  fetch('tags.json')
    .then(r => r.ok ? r.json() : [])
    .then(tags => {
      tagLibrary = Array.isArray(tags) ? tags : [];
      populateTagDropdown(tagLibrary);
      setToleranceByClass(null);
      scheduleCalculateAll();
    })
    .catch(() => {
      populateTagDropdown([]);
      setToleranceByClass(null);
      scheduleCalculateAll();
    });

  if (tagSearch) {
    tagSearch.addEventListener('input', () => {
      const q = tagSearch.value.trim().toLowerCase();
      const filtered = tagLibrary.filter(t => {
        const tag = (t && typeof t === 'object') ? (t.tag || '') : (t || '');
        const desc = (t && typeof t === 'object') ? (t.desc || t.description || '') : '';
        return (tag + ' ' + desc).toLowerCase().includes(q);
      });
      populateTagDropdown(filtered);
    });
  }

  if (tagSelect) {
    tagSelect.addEventListener('change', () => {
      const selected = tagSelect.value;
      const obj = tagLibrary.find(t => t && typeof t === 'object' && t.tag === selected);
      setToleranceByClass(obj?.class);
      scheduleCalculateAll();
    });
  }

  // Optional test equipment elements (safe if missing)
  const inputEquipSearch = document.getElementById('inputEquipSearch');
  const inputEquipSelect = document.getElementById('inputEquipSelect');
  const outputEquipSearch = document.getElementById('outputEquipSearch');
  const outputEquipSelect = document.getElementById('outputEquipSelect');
  
  // =========================
  // Test equipment
  // =========================
  let equipLibrary = [];

  // Only fetch if at least one equipment element exists
  if (inputEquipSelect || outputEquipSelect || inputEquipSearch || outputEquipSearch) {
    fetch('test_equipment.json')
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        equipLibrary = Array.isArray(list) ? list : [];
        populateEquip(inputEquipSelect, equipFilterByRole(equipLibrary, 'input'));
        populateEquip(outputEquipSelect, equipFilterByRole(equipLibrary, 'output'));
      })
      .catch(() => {
        equipLibrary = [];
        populateEquip(inputEquipSelect, []);
        populateEquip(outputEquipSelect, []);
      });

    if (inputEquipSearch) {
      inputEquipSearch.addEventListener('input', () => {
        const q = inputEquipSearch.value.trim().toLowerCase();
        const base = equipFilterByRole(equipLibrary, 'input');
        const filtered = !q ? base : base.filter(e => {
        const id   = (e?.id ?? '').toString().toLowerCase();
        const name = (e?.name ?? '').toString().toLowerCase();
        const desc = (e?.desc ?? e?.description ?? '').toString().toLowerCase();
        return (id + ' ' + name + ' ' + desc).includes(q);
      });
        populateEquip(inputEquipSelect, filtered);
      });
    }
    if (outputEquipSearch) {
      outputEquipSearch.addEventListener('input', () => {
        const q = outputEquipSearch.value.trim().toLowerCase();
        const base = equipFilterByRole(equipLibrary, 'output');
        const filtered = !q ? base : base.filter(e => equipLabel(e).toLowerCase().includes(q));
        populateEquip(outputEquipSelect, filtered);
      });
    }
  }

  // =========================
  // Input Type -> Input Units mapping
  // =========================
  const INPUT_UNIT_MAP = {
    pressure: [
      { value: 'psi',  label: 'PSI' },
      { value: 'inH2O', label: 'inH₂O' },
      { value: 'kPa',  label: 'kPa' },
      { value: 'bar',  label: 'bar' }
    ],
    temperature: [
      { value: 'F', label: '°F' },
      { value: 'C', label: '°C' },
      { value: 'K', label: 'K (Kelvin)' }
    ],
    frequency: [
      { value: 'Hz',  label: 'Hz' },
      { value: 'kHz', label: 'kHz' }
    ],
    percent: [{ value: '%', label: '%' }],
    volts:   [{ value: 'V', label: 'V' }],
    custom:  [{ value: '', label: '(custom)' }]
  };

  if (inputType) {
  inputType.addEventListener('change', () => {
    const type = inputType.value;

    const isCustom = (type === 'custom');

    // Show text input for custom units; otherwise show select
    if (inputUOMCustom) inputUOMCustom.classList.toggle('wiz-hidden', !isCustom);
    if (inputUOM)       inputUOM.classList.toggle('wiz-hidden', isCustom);

    if (isCustom) {
      // Clear select; let user type
      if (inputUOM) inputUOM.value = '';
      if (inputUOMCustom) inputUOMCustom.value = '';
    } else {
      populateUnits(inputUOM, INPUT_UNIT_MAP[type], type ? 'Select units...' : 'Select input type first...');
      if (inputUOM) inputUOM.value = '';
    }

    scheduleCalculateAll();
  });
}

// When user types custom UOM, recalc
inputUOMCustom?.addEventListener('input', scheduleCalculateAll);

  if (inputUOM) inputUOM.addEventListener('change', scheduleCalculateAll);
  populateUnits(inputUOM, [], 'Select input type first...');

  // Output defaults
  if (outputType) {
  outputType.addEventListener('change', () => {
    const type = outputType.value;
    const isCustom = (type === 'custom');

    // ✅ NEW: toggle visibility between auto-filled outputUOM and custom input
    if (outputUOM)       outputUOM.classList.toggle('wiz-hidden', isCustom);
    if (outputUOMCustom) outputUOMCustom.classList.toggle('wiz-hidden', !isCustom);

    if (type === 'ma') {
      outputLRV.value = 4;
      outputURV.value = 20;
      outputUOM.value = 'mA';
      if (outputUOMCustom) outputUOMCustom.value = '';
    } else if (type === 'psi') {
      outputLRV.value = 3;
      outputURV.value = 15;
      outputUOM.value = 'PSI';
      if (outputUOMCustom) outputUOMCustom.value = '';
    } else if (type === 'percent') {
      outputLRV.value = 0;
      outputURV.value = 100;
      outputUOM.value = '%';
      if (outputUOMCustom) outputUOMCustom.value = '';
    } else if (type === 'volts') {
      outputLRV.value = 0;
      outputURV.value = 5;
      outputUOM.value = 'V';
      if (outputUOMCustom) outputUOMCustom.value = '';
    } else if (isCustom) {
      outputLRV.value = '';
      outputURV.value = '';
      outputUOM.value = '';          // keep auto field empty while hidden
      if (outputUOMCustom) outputUOMCustom.value = '';
    } else {
      outputLRV.value = '';
      outputURV.value = '';
      outputUOM.value = '';
      if (outputUOMCustom) outputUOMCustom.value = '';
    }

    scheduleCalculateAll();
  });
}

// When user types custom output UOM, recalc
outputUOMCustom?.addEventListener('input', scheduleCalculateAll);

  if (outputCharacteristic) outputCharacteristic.addEventListener('change', scheduleCalculateAll);


  buildReadingGrid(asFoundGrid, 'af', false);
  buildReadingGrid(asLeftGrid,  'al', true);
  attach2dpBlurFormatting();
  window.setGridsReady(true);
  wireAsFoundGridEvents();
  wireAsLeftEditing();

// Wire View Graph button (now in Tech/Actions row)
const viewGraphBtn = document.getElementById('viewGraphBtn');
if (viewGraphBtn) {
  viewGraphBtn.addEventListener('click', () => {
    flushCalculateAll();
    drawGraph();
  });
}

const commentsEl = document.getElementById('comments');
const commentsCount = document.getElementById('commentsCount');
if (commentsEl && commentsCount) {
  const syncCount = () => {
    const n = (commentsEl.value || '').length;
    commentsCount.textContent = `${n} / 500`;
  };
  commentsEl.addEventListener('input', syncCount);
  syncCount();
}

  // =========================
  // Wire actions
  // =========================
  if (generateBtn) generateBtn.addEventListener('click', () => window.submitForm());
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      window.resetForm({
        onAfterReset: () => wizard.setWizStep('setup')
      });
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      if (!outputEl || !outputEl.value) return toast('Nothing to copy yet.', 'warn', 2400);
      try {
        await navigator.clipboard.writeText(outputEl.value);
        toast('Copied to clipboard.', 'info', 1700);
      } catch {
        outputEl.focus();
        outputEl.select();
        document.execCommand('copy');
        toast('Copied (fallback).', 'info', 1700);
      }
    });
  }

  [inputLRV, inputURV, outputLRV, outputURV].forEach(el => el && el.addEventListener('input', scheduleCalculateAll));

  // Init
  setToleranceByClass(null);
  scheduleCalculateAll();

  // Sync unit input visibility on load (in case browser restores selects)
if (inputType?.value) inputType.dispatchEvent(new Event('change'));
if (outputType?.value) outputType.dispatchEvent(new Event('change'));
}
