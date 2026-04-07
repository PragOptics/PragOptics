import { ensureGraphModal } from './ensureGraphModal.js';
import { getXYSeries } from './getXYSeries.js';
import { getExpectedOutCurve } from './getExpectedOutCurve.js';

import { drawLineXY } from './drawLineXY.js';
import { drawDotsXY } from './drawDotsXY.js';
import { drawLine as _drawLine } from './drawLine.js';
import { drawDots as _drawDots } from './drawDots.js';

export function drawGraph(deps){
  const {
    points,
    inputLRV, inputURV,
    outputLRV, outputURV,
    tolerance,
    graphState,
    getGraphHitTargets,
    setGraphHitTargets,
    getGraphTipLocked,
    setGraphTipLocked,
    getOutputCharacteristic
  } = deps;

  // Adapter bindings to preserve your original call shapes (NO logic change)
  const drawLine = (ctx, series, xScale, yScale) => _drawLine(ctx, series, xScale, yScale, points);
  const drawDots = (ctx, series, xScale, yScale, color) => _drawDots(ctx, series, xScale, yScale, color, points);

  // ensureGraphModal() in original was zero-arg; keep that experience here via deps pass-through
  ensureGraphModal({
    graphState,
    getGraphHitTargets,
    getGraphTipLocked,
    setGraphTipLocked,
    drawGraph: () => drawGraph(deps),
    getInputUOMValue: window.getInputUOMValue,
    getOutputUOMValue: window.getOutputUOMValue
  });

  const modal = document.getElementById('calGraphModal');
  const canvas = document.getElementById('calGraphCanvas');
  if (!modal || !canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const rect = canvas.getBoundingClientRect();

  const scaleX = canvas.width / rect.width; // canvas px per CSS px
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // radius in CSS px (finger size), then convert to canvas px
  const hitRadiusCss = isCoarse ? 22 : 12;
  const dotR = hitRadiusCss * scaleX;

  ctx.clearRect(0,0,W,H);

  // Data (Standard 1)
  // - Points are plotted at X = Actual Input (% span), Y = Actual Output
  const afPts = getXYSeries(points, 'af', inputLRV, inputURV);
  const alPts = getXYSeries(points, 'al', inputLRV, inputURV);

  // ===== X domain (mirror Y-axis behavior) =====
  let xMin = 0;
  let xMax = 100;

  const xVals = [
    ...afPts.map(p => p.xPct),
    ...alPts.map(p => p.xPct)
  ].filter(v => Number.isFinite(v));

  if (xVals.length) {
    xMin = Math.min(0, ...xVals);
    xMax = Math.max(100, ...xVals);
  }

  // Pad X domain (~8%, minimum 2%)
  const xSpan = (xMax - xMin) || 100;
  const xPad  = Math.max(xSpan * 0.08, 2);

  xMin -= xPad;
  xMax += xPad;

  const exp = getExpectedOutCurve(points, inputLRV, inputURV, outputLRV, outputURV, getOutputCharacteristic);

  // Determine Y range from output LRV/URV (fallback to data bounds)
  let yMin = Number(outputLRV?.value);
  let yMax = Number(outputURV?.value);

  const allVals = [
    ...afPts.map(p => p.y),
    ...alPts.map(p => p.y),
    ...exp
  ].filter(v => v != null && !Number.isNaN(v));

  if (Number.isNaN(yMin) || Number.isNaN(yMax) || yMin === yMax) {
    if (allVals.length) {
      yMin = Math.min(...allVals);
      yMax = Math.max(...allVals);
    } else {
      yMin = 0; yMax = 1;
    }
  }

  const pad = (yMax - yMin) * 0.08 || 1;
  yMin -= pad; yMax += pad;

  const m = { l: 54, r: 18, t: 18, b: 44 };
  const x0 = m.l, x1 = W - m.r;
  const y0 = H - m.b, y1 = m.t;

  const xScale = (p) =>
    x0 + ((p - xMin) / (xMax - xMin)) * (x1 - x0);
  const yScale = (v) => y0 - ((v - yMin) / (yMax - yMin)) * (y0 - y1);

  // was: graphHitTargets = [];
  setGraphHitTargets([]);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  [0,25,50,75,100].forEach(p => {
    const x = xScale(p);
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y0); ctx.stroke();
  });
  for (let i=0;i<=4;i++){
    const y = y0 - i*(y0-y1)/4;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x0,y0); ctx.stroke();

  // Labels X
  ctx.fillStyle = 'rgba(232,236,247,0.75)';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  [0,25,50,75,100].forEach(p => {
    const x = xScale(p);
    ctx.fillText(`${p}%`, x-10, H-18);
  });

  // Labels Y (min/max)
  ctx.fillText(`${yMin.toFixed(2)}`, 8, y0+4);
  ctx.fillText(`${yMax.toFixed(2)}`, 8, y1+10);

  // Tolerance band around expected curve (+/- tol% of span)
  const tolVal = Number(tolerance?.value) || 0;
  const outSpan = (Number(outputURV?.value) - Number(outputLRV?.value)) || (yMax - yMin);

  if (graphState.showBand && exp.some(v => v != null)) {
    const upper = exp.map(v => (v == null ? null : v + (tolVal/100)*outSpan));
    const lower = exp.map(v => (v == null ? null : v - (tolVal/100)*outSpan));

    ctx.setLineDash([8,6]);
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 2.5;

    drawLine(ctx, upper, xScale, yScale);
    drawLine(ctx, lower, xScale, yScale);

    ctx.setLineDash([]);
  }

  // Series lines
  ctx.lineWidth = 2.5;

  if (graphState.showAF) {
    ctx.strokeStyle = '#a200ffc5';
    drawLineXY(ctx, afPts, xScale, yScale);
    drawDotsXY(ctx, afPts, xScale, yScale, '#a200ffc5');

    const targets = getGraphHitTargets();
    afPts.forEach(p => {
      targets.push({
        series: 'af',
        label: 'As‑Found',
        point: p.pt,
        value: p.y,
        x: xScale(p.xPct),
        y: yScale(p.y),
        r: dotR
      });
    });
    setGraphHitTargets(targets);
  }

  if (graphState.showAL) {
    ctx.strokeStyle = '#1ca490da';
    drawLineXY(ctx, alPts, xScale, yScale);
    drawDotsXY(ctx, alPts, xScale, yScale, '#1ca490da');

    const targets = getGraphHitTargets();
    alPts.forEach(p => {
      targets.push({
        series: 'al',
        label: 'As‑Left',
        point: p.pt,
        value: p.y,
        x: xScale(p.xPct),
        y: yScale(p.y),
        r: dotR
      });
    });
    setGraphHitTargets(targets);
  }

  modal.style.display = 'flex';
}