export function ensureGraphModal(deps){
  const {
    graphState,                 // object reference (showAF/showAL/showBand)
    getGraphHitTargets,         // () => graphHitTargets array
    getGraphTipLocked,          // () => boolean
    setGraphTipLocked,          // (bool) => void
    drawGraph,                  // () => void
    getInputUOMValue,           // () => string|null
    getOutputUOMValue           // () => string|null
  } = deps;

  if (document.getElementById('calGraphModal')) return;

  const modal = document.createElement('div');
  modal.id = 'calGraphModal';
  modal.style.cssText = `
    position:fixed; inset:0; display:none; z-index:99999;
    background: var(--card); backdrop-filter: blur(6px);
    align-items:center; justify-content:center; padding:16px;
  `;

  modal.innerHTML = `
    <div style="
      width:min(980px, 96vw);
      background:  var(--card);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      box-shadow: 0 18px 60px var(--shadow);
      overflow:hidden;
    ">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,0.08);">
        <div style="color:#21bca5; font-weight:800;">Calibration Plot (As‑Found vs As‑Left)</div>
        <button id="calGraphClose" type="button" style="
          border:none; cursor:pointer; color:#071028;
          background: linear-gradient(180deg, #1ca490da, #21bca5);
          border-radius:10px; padding:8px 12px; font-weight:800;
        ">Close</button>
      </div>
      <div style="padding:12px 14px; position:relative;">
        <canvas id="calGraphCanvas" width="920" height="420" style="width:100%; height:auto; display:block;"></canvas>

        <div id="calGraphTip" style="
          position:absolute;
          display:none;
          max-width:min(320px, 80vw);
          background: rgba(2,6,23,0.92);
          color: #e8ecf7;
          border: 1px solid var(--card-border);
          border-left: 4px solid #21bca5;
          border-radius: 12px;
          box-shadow: 0 10px 34px var(--shadow);
          padding: 10px 12px;
          font-size: 12px;
          line-height: 1.25;
          pointer-events:none;
          z-index: 5;
        "></div>

        <div style="margin-top:10px; color: var(--card); font-size:12px; display:flex; gap:14px; flex-wrap:wrap;">
          <div id="calLegend" style="margin-top:10px; color: var(--muted); font-size:12px; display:flex; gap:14px; flex-wrap:wrap;">
            <button type="button" data-series="af" style="all:unset; cursor:pointer; display:inline-flex; align-items:center;">
              <span style="display:inline-block;width:10px;height:10px;background:#a200ffc5;border-radius:2px;margin-right:6px;"></span>
              As‑Found
            </button>

            <button type="button" data-series="al" style="all:unset; cursor:pointer; display:inline-flex; align-items:center;">
              <span style="display:inline-block;width:10px;height:10px;background:#1ca490da;border-radius:2px;margin-right:6px;"></span>
              As‑Left
            </button>

            <button type="button" data-series="band" style="all:unset; cursor:pointer; display:inline-flex; align-items:center;">
              <span style="display:inline-block;width:10px;height:10px;border:2px dashed var(--tol);border-radius:2px;margin-right:6px;"></span>
              Tolerance band
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
  modal.querySelector('#calGraphClose').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  const canvas = modal.querySelector('#calGraphCanvas');
  const tip = modal.querySelector('#calGraphTip');

  function hideTip(){
    if (!tip) return;
    tip.style.display = 'none';
  }

  function showTipAt(x, y, html){
    if (!tip) return;
    tip.innerHTML = html;
    tip.style.display = 'block';

    const pad = 10;
    const w = tip.offsetWidth || 220;
    const h = tip.offsetHeight || 80;

    const container = tip.parentElement;
    const maxX = (container?.clientWidth || 0) - w - pad;
    const maxY = (container?.clientHeight || 0) - h - pad;

    tip.style.left = Math.max(pad, Math.min(x + 12, maxX)) + 'px';
    tip.style.top  = Math.max(pad, Math.min(y - h - 12, maxY)) + 'px';
  }

  function fmt2(v){
    const n = Number(v);
    return (v == null || v === '' || Number.isNaN(n)) ? '—' : n.toFixed(2);
  }

  function hitTest(px, py){
    let best = null;
    let bestD2 = Infinity;

    const magnetMul = 1.35;

    const targets = getGraphHitTargets();

    for (const t of targets) {
      const dx = px - t.x, dy = py - t.y;
      const d2 = dx*dx + dy*dy;

      const rr = (t.r * magnetMul);
      if (d2 <= rr*rr && d2 < bestD2) {
        best = t;
        bestD2 = d2;
      }
    }
    return best;
  }

  function buildTooltip(hit){
    const p = hit.point;
    const prefix = hit.series; // 'af' or 'al'
    const inU = getInputUOMValue();
    const outU = getOutputUOMValue();

    const ai = document.getElementById(`${prefix}_act_in_${p}`)?.value ?? '';
    const ao = document.getElementById(`${prefix}_act_out_${p}`)?.value ?? '';

    const swatch = modal?.querySelector(`#calLegend button[data-series="${prefix}"] span`);
    const accent = swatch ? getComputedStyle(swatch).backgroundColor : '#1ca490da';

    if (tip) tip.style.borderLeftColor = accent;

    return `
      <div style="font-weight:800; color:${accent}; margin-bottom:6px;">
        ${hit.label} — ${p}%
      </div>
      <div><span style="opacity:.75;">Actual Input:</span> <b>${fmt2(ai)}</b> ${inU}</div>
      <div><span style="opacity:.75;">Actual Output:</span> <b>${fmt2(ao)}</b> ${outU}</div>
    `;
  }

  function canvasPointFromEvent(ev){
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY,
      cx: (ev.clientX - rect.left),
      cy: (ev.clientY - rect.top)
    };
  }

  if (canvas && !canvas.dataset.tipWired) {
    canvas.dataset.tipWired = '1';

    canvas.addEventListener('pointermove', (ev) => {
      if (getGraphTipLocked()) return;
      const {x,y,cx,cy} = canvasPointFromEvent(ev);
      const hit = hitTest(x,y);
      if (!hit) return hideTip();
      showTipAt(cx, cy, buildTooltip(hit));
    });

    canvas.addEventListener('pointerleave', () => {
      if (!getGraphTipLocked()) hideTip();
    });

    canvas.addEventListener('pointerdown', (ev) => {
      const {x,y,cx,cy} = canvasPointFromEvent(ev);
      const hit = hitTest(x,y);
      if (!hit) {
        setGraphTipLocked(false);
        hideTip();
        return;
      }
      setGraphTipLocked(!getGraphTipLocked());
      showTipAt(cx, cy, buildTooltip(hit));
    });
  }

  const legend = modal.querySelector('#calLegend');
  if (legend && !legend.dataset.wired) {
    legend.dataset.wired = '1';

    const syncLegendUI = () => {
      legend.querySelectorAll('button[data-series]').forEach(btn => {
        const k = btn.dataset.series;
        const on = (k === 'af') ? graphState.showAF
                : (k === 'al') ? graphState.showAL
                : graphState.showBand;

        btn.style.opacity = on ? '1' : '0.35';
        btn.style.textDecoration = on ? 'none' : 'line-through';
      });
    };

    legend.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-series]');
      if (!btn) return;

      const k = btn.dataset.series;
      if (k === 'af') graphState.showAF = !graphState.showAF;
      if (k === 'al') graphState.showAL = !graphState.showAL;
      if (k === 'band') graphState.showBand = !graphState.showBand;

      syncLegendUI();
      drawGraph(); // redraw with new visibility
    });

    syncLegendUI();
  }
}