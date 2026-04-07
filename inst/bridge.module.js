  import { mountDnaSwirl } from './dna_swirl.js';
  import { getInputUOMValue as _getInputUOMValue } from './getInputUOMValue.js';
  import { getOutputUOMValue as _getOutputUOMValue } from './getOutputUOMValue.js';
  import { roundTo as _roundTo } from './roundTo.js';
  import { isMidEntryNumber as _isMidEntryNumber } from './isMidEntryNumber.js';
  import { sanitizeNumericTyping as _sanitizeNumericTyping } from './sanitizeNumericTyping.js';
  import { formatTo2 as _formatTo2 } from './formatTo2.js';
  import { clamp as _clamp } from './clamp.js';
  import { normalizePercent as _normalizePercent } from './normalizePercent.js';
  import { outputFromPercent as _outputFromPercent } from './outputFromPercent.js';
  import { calcPercentError as _calcPercentError } from './calcPercentError.js';
  import { getOutputCharacteristic as _getOutputCharacteristic } from './getOutputCharacteristic.js';
  import { getExpectedInputForPoint as _getExpectedInputForPoint } from './getExpectedInputForPoint.js';
  import { getAllowedActualInputBand as _getAllowedActualInputBand } from './getAllowedActualInputBand.js';
  import { getSeries as _getSeries } from './getSeries.js';
  import { getXYSeries as _getXYSeries } from './getXYSeries.js';
  import { drawLineXY as _drawLineXY } from './drawLineXY.js';
  import { drawDotsXY as _drawDotsXY } from './drawDotsXY.js';
  import { drawLine as _drawLine } from './drawLine.js';
  import { drawDots as _drawDots } from './drawDots.js';
  import { getExpectedOutCurve as _getExpectedOutCurve } from './getExpectedOutCurve.js';
  import { ensureGraphModal as _ensureGraphModal } from './ensureGraphModal.js';
  import { drawGraph as _drawGraph } from './drawGraph.js';
  import { captureGraphImage as _captureGraphImage } from './captureGraphImage.js';
  import { collectTable as _collectTable } from './collectTable.js';
  import { submitForm as _submitForm } from './submitForm.js';
  import { toast as _toast } from './toast.js';
  import { setToleranceByClass as _setToleranceByClass } from './setToleranceByClass.js';
  import { populateTagDropdown as _populateTagDropdown } from './populateTagDropdown.js';
  import { equipLabel as _equipLabel } from './equipLabel.js';
  import { populateEquip as _populateEquip } from './populateEquip.js';
  import { equipFilterByRole as _equipFilterByRole } from './equipFilterByRole.js';
  import { populateUnits as _populateUnits } from './populateUnits.js';
  import { resetForm as _resetForm } from './resetForm.js';
  import { buildReadingGrid as _buildReadingGrid } from './buildReadingGrid.js';
  import { attach2dpBlurFormatting as _attach2dpBlurFormatting } from './attach2dpBlurFormatting.js';
  import { scheduleCalculateAll as _scheduleCalculateAll } from './scheduleCalculateAll.js';
  import { flushCalculateAll as _flushCalculateAll } from './flushCalculateAll.js';
  import { calculateAll as _calculateAll } from './calculateAll.js';
  import { wireAsLeftEditing as _wireAsLeftEditing } from './wireAsLeftEditing.js';
  import { wireAsFoundGridEvents as _wireAsFoundGridEvents } from './wireAsFoundGridEvents.js';
  import { initCalibrationWizard } from './calibration.wizard.js';
  import { createCalibrationState } from './calibration.state.js';
  import { mountTemplatesOnce } from './mountTemplates.js';
  import { initFooter as _initFooter } from './footer.js';

  const el = (id) => document.getElementById(id);
  const pointsOrDefault = () => (window.points && Array.isArray(window.points)) ? window.points : [0,25,50,75,100];

window.mountCalibrationTemplates = () =>
  mountTemplatesOnce({
    gridId: 'grid',
    templates: [
      { src: './templates/instrument-setup.html' },
      { src: './templates/as-found.html' },
      { src: './templates/as-left.html' },
      { src: './templates/tech.html' }
    ]
  });

  window.getInputUOMValue = function () {
    return _getInputUOMValue(
      document.getElementById('inputType'),
      document.getElementById('inputUOM'),
      document.getElementById('inputUOMCustom')
    );
  };
  
  window.getOutputUOMValue = function () {
    return _getOutputUOMValue(
      document.getElementById('outputType'),
      document.getElementById('outputUOM'),
      document.getElementById('outputUOMCustom')
    );
  };

  window.getOutputCharacteristic = function () {
    return _getOutputCharacteristic(
      document.getElementById('outputCharacteristic')?.value
    );
  };

  window.getAllowedActualInputBand = function (pointPct) {
    return _getAllowedActualInputBand(
      pointPct,
      Number(document.getElementById('inputLRV')?.value),
      Number(document.getElementById('inputURV')?.value),
      Number(document.getElementById('tolerance')?.value) || 0,
      window.getExpectedInputForPoint
    );
  };


window.ensureGraphModal = function () {
  return _ensureGraphModal({
    graphState: window.graphState,
    getGraphHitTargets: window.getGraphHitTargets,
    getGraphTipLocked: window.getGraphTipLocked,
    setGraphTipLocked: window.setGraphTipLocked,
    drawGraph: window.drawGraph,
    getInputUOMValue: window.getInputUOMValue,
    getOutputUOMValue: window.getOutputUOMValue
  });
};

window.drawGraph = function () {
  return _drawGraph({
    points: pointsOrDefault(),
    inputLRV: el('inputLRV'),
    inputURV: el('inputURV'),
    outputLRV: el('outputLRV'),
    outputURV: el('outputURV'),
    tolerance: el('tolerance'),

    graphState: window.graphState,
    getGraphHitTargets: window.getGraphHitTargets,
    setGraphHitTargets: window.setGraphHitTargets,
    getGraphTipLocked: window.getGraphTipLocked,
    setGraphTipLocked: window.setGraphTipLocked,

    getOutputCharacteristic: window.getOutputCharacteristic
  });
};


window.submitForm = function () {
  return _submitForm({
    points: pointsOrDefault(),

    tolerance: el('tolerance'),
    forceShowAsLeft: el('forceShowAsLeft'),

    tagSelect: el('tagSelect'),
    workOrder: el('workOrder'),

    inputType: el('inputType'),
    inputLRV: el('inputLRV'),
    inputURV: el('inputURV'),
    getInputUOMValue: window.getInputUOMValue,
    inputEquipSelect: el('inputEquipSelect'),

    outputType: el('outputType'),
    outputLRV: el('outputLRV'),
    outputURV: el('outputURV'),
    getOutputCharacteristic: window.getOutputCharacteristic,
    getOutputUOMValue: window.getOutputUOMValue,
    outputEquipSelect: el('outputEquipSelect'),

    outputEl: el('output'),
    toast: window.toast,
    openPrintableReport: window.openPrintableReport,

    hasAllAsFoundData: window.hasAllAsFoundData,
    flushCalculateAll: window.flushCalculateAll
  });
};

window.resetForm = function (opts) {
  opts = (opts && typeof opts === 'object') ? opts : {};

  return _resetForm({
    documentRef: document,
    outputEl: el('output'),
    forceShowAsLeft: el('forceShowAsLeft'),

    asLeftDirty: calState.asLeftDirty,

    setAnyOutOfTolerance: calState.engine.setAnyOutOfTolerance,
    setLastAnyOut: calState.engine.setLastAnyOut,
    setGridsReady: calState.engine.setGridsReady,

    asFoundGrid: el('asFoundGrid'),
    asLeftGrid: el('asLeftGrid'),
    buildReadingGrid: window.buildReadingGrid,
    attach2dpBlurFormatting: window.attach2dpBlurFormatting,

    setToleranceByClass: window.setToleranceByClass,
    scheduleCalculateAll: window.scheduleCalculateAll,
    toast: window.toast,
    onAfterReset: opts.onAfterReset
  });
};

window.attach2dpBlurFormatting = function () {
  return _attach2dpBlurFormatting({
    documentRef: document,
    asLeftDirty: calState.asLeftDirty,
    sanitizeNumericTyping: window.sanitizeNumericTyping,
    formatTo2: window.formatTo2,
    isMidEntryNumber: window.isMidEntryNumber,
    getAllowedActualInputBand: window.getAllowedActualInputBand,
    clamp: window.clamp,
    getInputUOMValue: window.getInputUOMValue,
    toast: window.toast,
    flushCalculateAll: window.flushCalculateAll
  });
};

window.scheduleCalculateAll = function () {
  return _scheduleCalculateAll({
    isGridsReady: calState.engine.getGridsReady,
    getCalcTimer: calState.engine.getCalcTimer,
    setCalcTimer: calState.engine.setCalcTimer,
    calculateAll: window.calculateAll
  });
};

window.flushCalculateAll = function () {
  return _flushCalculateAll({
    isGridsReady: calState.engine.getGridsReady,
    getCalcTimer: calState.engine.getCalcTimer,
    setCalcTimer: calState.engine.setCalcTimer,
    calculateAll: window.calculateAll
  });
};

const engineState = createCalibrationState();

const calState = (globalThis.__calState ||= {
  asLeftDirty: new Set(),
  engine: engineState
});

window.calculateAll = function () {
  return _calculateAll({
    inputLRV: el('inputLRV'),
    inputURV: el('inputURV'),
    outputLRV: el('outputLRV'),
    outputURV: el('outputURV'),
    tolerance: el('tolerance'),

    asFoundGrid: el('asFoundGrid'),
    asLeftGrid: el('asLeftGrid'),

    forceShowAsLeft: el('forceShowAsLeft'),
    afStatus: el('afStatus'),
    alStatus: el('alStatus'),
    ts: el('ts'),

    points: pointsOrDefault(),

    // ✅ KEEP YOUR STATE PROXY EXACTLY (unchanged)
    state: {
      get anyOutOfTolerance() {
        return calState.engine.getAnyOutOfTolerance();
      },
      set anyOutOfTolerance(v) {
        calState.engine.setAnyOutOfTolerance(v);
      },
      get lastAnyOut() {
        return calState.engine.getLastAnyOut();
      },
      set lastAnyOut(v) {
        calState.engine.setLastAnyOut(v);
      },
      asLeftDirty: calState.asLeftDirty
    },

    getOutputCharacteristic: window.getOutputCharacteristic,
    isMidEntryNumber: window.isMidEntryNumber,
    normalizePercent: window.normalizePercent,
    outputFromPercent: window.outputFromPercent,
    roundTo: window.roundTo,
    calcPercentError: window.calcPercentError,
    toast: window.toast
  });
};

window.wireAsLeftEditing = function () {
  return _wireAsLeftEditing({
    asLeftGrid: el('asLeftGrid'),
    forceShowAsLeft: el('forceShowAsLeft'),
    clearAsLeftBtn: el('clearAsLeftBtn'),
    points: pointsOrDefault(),
    asLeftDirty: calState.asLeftDirty,
    toast: window.toast,
    scheduleCalculateAll: window.scheduleCalculateAll,
    flushCalculateAll: window.flushCalculateAll,
    getAnyOutOfTolerance: () => calState.engine.getAnyOutOfTolerance()
  });
};

window.wireAsFoundGridEvents = function () {
  return _wireAsFoundGridEvents(
    el('asFoundGrid'),
    window.scheduleCalculateAll,
    window.flushCalculateAll
  );
};



  
  window.roundTo = function (n, dp = 2) {
    return _roundTo(n, dp);
  };

  window.isMidEntryNumber = function (raw) {
    return _isMidEntryNumber(raw);
  };

  window.sanitizeNumericTyping = function (raw) {
    return _sanitizeNumericTyping(raw);
  };

  window.formatTo2 = function (el) {
    return _formatTo2(el);
  };

  window.clamp = function (n, min, max) {
    return _clamp(n, min, max);
  };

  window.normalizePercent = function (actualIn, inLRVn, inURVn) {
    return _normalizePercent(actualIn, inLRVn, inURVn);
  };

  window.outputFromPercent = function (percent, outLRVn, outURVn, characteristic) {
    return _outputFromPercent(percent, outLRVn, outURVn, characteristic);
  };

  window.calcPercentError = function (actualOut, expectedOut, outLRVn, outURVn) {
    return _calcPercentError(actualOut, expectedOut, outLRVn, outURVn);
  };

  window.getExpectedInputForPoint = function (pointPct, inLRVn, inURVn) {
    return _getExpectedInputForPoint(pointPct, inLRVn, inURVn);
  };

  window.getSeries = function (prefix, field) {
    return _getSeries(pointsOrDefault(), prefix, field);
  };

  window.getXYSeries = function (prefix) {
    return _getXYSeries(pointsOrDefault(), prefix, el('inputLRV'), el('inputURV'));
  };

  window.drawLineXY = function (ctx, pts, xScale, yScale) {
    return _drawLineXY(ctx, pts, xScale, yScale);
  };
  
  window.drawDotsXY = function (ctx, pts, xScale, yScale, color) {
    return _drawDotsXY(ctx, pts, xScale, yScale, color);
  };

  window.drawLine = function (ctx, series, xScale, yScale) {
    return _drawLine(ctx, series, xScale, yScale, pointsOrDefault());
  };

  window.drawDots = function (ctx, series, xScale, yScale, color) {
    return _drawDots(ctx, series, xScale, yScale, color, pointsOrDefault());
  };

  window.getExpectedOutCurve = function () {
    return _getExpectedOutCurve(
      pointsOrDefault(),
      el('inputLRV'), el('inputURV'),
      el('outputLRV'), el('outputURV'),
      window.getOutputCharacteristic
    );
  };

  window.captureGraphImage = function () {
    return _captureGraphImage();
  };

  window.collectTable = function (prefix) {
    return _collectTable(pointsOrDefault(), prefix);
  };

  window.toast = function (message, type='info', ttl=3200) {
    return _toast(el('toastWrap'), message, type, ttl);
  };

  window.setToleranceByClass = function (cls) {
    return _setToleranceByClass(el('tolerance'), cls);
  };

  window.populateTagDropdown = function (tags) {
    return _populateTagDropdown(el('tagSelect'), tags);
  };

  window.equipLabel = function (e) {
    return _equipLabel(e);
  };
  
  window.populateEquip = function (selectEl, list) {
    return _populateEquip(selectEl, list);
  };

  window.equipFilterByRole = function (list, role) {
    return _equipFilterByRole(Array.isArray(list) ? list : [], role);
  };

  window.populateUnits = function (selectEl, units, placeholder='Select units...') {
    return _populateUnits(selectEl, units, placeholder);
  };

  window.buildReadingGrid = function (container, prefix, disabled) {
    return _buildReadingGrid(container, prefix, disabled, pointsOrDefault());
  };


  window.initCalibrationWizard = function (deps) {
    return initCalibrationWizard(deps);
  };

  window.setGridsReady = function (v) { return calState.engine.setGridsReady(v); };
  
  window.initFooter = function () {
    return _initFooter();
  };

window.mountFooter = async function () {
  const mount = document.getElementById('footerMount');
  if (!mount) return;

  const res = await fetch('./templates/footer.html');
  const html = await res.text();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html.trim();

  while (wrapper.firstChild) {
    mount.appendChild(wrapper.firstChild);
  }
};

window.mountHeader = async function () {
  return fetch('./templates/header.html')
    .then(r => r.text())
    .then(html => {
      const mount = document.getElementById('headerMount');
      if (!mount) return;

      mount.innerHTML = html;
    });
};

 window.initDnaSwirl = function () {
  return mountDnaSwirl('#dnaSwirl', {
    /* === Visual smoothness === */
    dotSpacingPx: 4.6,
    idleShimmerMul: 0.22,
    glowBridge: true,

    /* === Logo behavior === */
    logoMask: false,
    logoFadeInSecs: 0.30,

    /* === Intro speed === */
    buildDotsPerSec: 240,
    holdSecs: 0.25,
    shedDotsPerSec: 280,

    /* === Convergence feel === */
    snapEps: 1.1,
    easeToAnchor: 0.18
  });
};
  // ---- LEGACY GLOBAL ALIASES ----
// Allow classic <script> to call bare function names
globalThis.initCalibrationWizard = window.initCalibrationWizard;
globalThis.mountCalibrationTemplates = window.mountCalibrationTemplates;
globalThis.getOutputCharacteristic = window.getOutputCharacteristic;
globalThis.getInputUOMValue = window.getInputUOMValue;
globalThis.getOutputUOMValue = window.getOutputUOMValue;

globalThis.roundTo = window.roundTo;
globalThis.isMidEntryNumber = window.isMidEntryNumber;
globalThis.sanitizeNumericTyping = window.sanitizeNumericTyping;
globalThis.formatTo2 = window.formatTo2;
globalThis.clamp = window.clamp;

globalThis.normalizePercent  = window.normalizePercent;
globalThis.outputFromPercent = window.outputFromPercent;
globalThis.calcPercentError = window.calcPercentError;

globalThis.getAllowedActualInputBand = window.getAllowedActualInputBand;
globalThis.getExpectedInputForPoint = window.getExpectedInputForPoint;

globalThis.drawGraph = window.drawGraph;
globalThis.ensureGraphModal = window.ensureGraphModal;
globalThis.collectTable = window.collectTable;
globalThis.populateTagDropdown = window.populateTagDropdown;
globalThis.equipLabel = window.equipLabel;
globalThis.populateEquip = window.populateEquip;
globalThis.equipFilterByRole = window.equipFilterByRole;
globalThis.populateUnits = window.populateUnits;
globalThis.submitForm = window.submitForm;
globalThis.resetForm = window.resetForm;
globalThis.buildReadingGrid = window.buildReadingGrid;
globalThis.attach2dpBlurFormatting = window.attach2dpBlurFormatting;
globalThis.scheduleCalculateAll = window.scheduleCalculateAll;
globalThis.flushCalculateAll = window.flushCalculateAll;
globalThis.calculateAll = window.calculateAll;
globalThis.wireAsLeftEditing = window.wireAsLeftEditing;
globalThis.wireAsFoundGridEvents = window.wireAsFoundGridEvents;
globalThis.toast = window.toast;
globalThis.setToleranceByClass = window.setToleranceByClass;
globalThis.initFooter = window.initFooter;
globalThis.mountFooter = window.mountFooter;
globalThis.mountHeader = window.mountHeader;
globalThis.initDnaSwirl = window.initDnaSwirl;