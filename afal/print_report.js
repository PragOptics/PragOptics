/* print_report.js
   PragOptics Calibration Report (Print/PDF)
   - Generates a clean, audit-friendly report in a new window
   - Renders a report-quality graph (AF vs AL + tolerance band) WITH axes/labels
   - Includes technician + comments + equipment + ranges + summary
   - Removes JSON viewer (per request)

   Usage:
     window.openPrintableReport(payload)

   Note:
     Does NOT require captureGraphImage anymore.
*/

(function () {
  'use strict';

  window.openPrintableReport = openPrintableReport;

  function openPrintableReport(payload) {
    const w = window.open('', '_blank', 'width=1000,height=1200');
    if (!w) {
      alert('Popup blocked');
      return;
    }

    const data = payload ?? {};
    const safeDataJs = safeJsonForInlineScript(data);

    // --- derived report facts (computed once, used in template) ---
    const tol = num(data?.tolerance);
    const outLRV = num(data?.output?.LRV);
    const outURV = num(data?.output?.URV);
    const outSpan = (isFinite(outLRV) && isFinite(outURV) && outURV !== outLRV) ? (outURV - outLRV) : NaN;

    const afRows = Array.isArray(data?.asFound) ? data.asFound : [];
    const alRows = Array.isArray(data?.asLeft) ? data.asLeft : [];

    const afFailCount = countFails(afRows, tol);
    const alFailCount = countFails(alRows, tol);

    const asLeftRequired = afFailCount > 0; // matches your rule: any AF out-of-tol => AL becomes mandatory
    const correctedCount = countCorrected(afRows, alRows, tol);

    const reportTitle = `Calibration Report`;
    const tag = data?.tag ?? '—';
    const wo = data?.workOrder ?? '—';
    const ts = data?.timestamp ? new Date(data.timestamp).toLocaleString() : '—';

    const tech = (data?.technician ?? '').toString().trim() || '—';
    const comments = (data?.comments ?? '').toString().trim() || '—';

    const inType = data?.input?.type ?? '—';
    const inLRV = data?.input?.LRV ?? '—';
    const inURV = data?.input?.URV ?? '—';
    const inUOM = (data?.input?.UOM ?? '').toString().trim();
    const inEq = data?.input?.testEquipment ?? '—';

    const outType = data?.output?.type ?? '—';
    const outUOM = (data?.output?.UOM ?? '').toString().trim();
    const outEq = data?.output?.testEquipment ?? '—';
    const characteristic = data?.output?.characteristic ?? '—';

    const css = `
      :root{
        --ink:#101214;
        --muted:#5b616a;
        --border:#c9ced6;
        --soft:#eef1f5;
        --bg:#ffffff;

        --accentA:#a200ff;
        --accentB:#1ca490;
        --good:#0f9d58;
        --bad:#d93025;
        --warn:#b26a00;

        --radius:12px;
      }

      *{ box-sizing:border-box; 
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      }
      html,body{ height:100%; }
      body{
        margin: 24px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial;
        color: var(--ink);
        background: var(--bg);
      }

      h1,h2,h3{ margin:0 0 10px 0; }
      h1{ font-size: 22px; letter-spacing: .01em; }
      h2{ font-size: 16px; margin-top: 14px; }
      h3{ font-size: 14px; color: #111; margin-bottom: 8px; }

      .top{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap: 18px;
        padding-bottom: 12px;
        border-bottom: 2px solid var(--soft);
        margin-bottom: 14px;
      }
      .brand{
        display:flex;
        align-items:center;
        gap: 12px;
        min-width: 0;
      }
      .brand img{
        width: 34px;
        height: 34px;
        object-fit: contain;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: #fff;
      }
      .brandTitle{
        min-width: 0;
      }
      .brandTitle .kicker{
        font-size: 12px;
        color: var(--muted);
        margin-top: 2px;
      }
      .docMeta{
        font-size: 12px;
        color: var(--muted);
        text-align:right;
        line-height: 1.35;
      }

      .section{ margin: 14px 0 18px; page-break-inside: avoid; }

      .metaGrid{
        display:grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 16px;
        font-size: 12.5px;
        line-height: 1.3;
      }
      .kv{ display:flex; gap: 8px; }
      .kv b{ white-space: nowrap; }

      .panel{
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px 12px;
        background: #fff;
      }

      .summaryRow{
        display:flex;
        flex-wrap:wrap;
        gap: 10px;
        align-items:center;
      }
      .pill{
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: #fff;
        font-size: 12px;
        font-weight: 800;
      }
      .pill.good{ border-color: rgba(15,157,88,.35); background: rgba(15,157,88,.08); color: #0b6f3c; }
      .pill.bad{ border-color: rgba(217,48,37,.35); background: rgba(217,48,37,.08); color: #8b1a12; }
      .pill.warn{ border-color: rgba(178,106,0,.35); background: rgba(178,106,0,.08); color: #7a4a00; }

      .muted{ color: var(--muted); }
      .small{ font-size: 12px; }
      .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", monospace; }

      /* Graph */
      .graphWrap{
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px;
        background: #fff;
      }
      .graphHeader{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      .graphHeader .labels{
        font-size: 12px;
        color: var(--muted);
        line-height: 1.35;
      }
      .legend{
        display:flex;
        gap: 12px;
        align-items:center;
        flex-wrap:wrap;
        font-size: 12px;
        color: var(--muted);
      }
      .swatch{
        width: 10px;
        height: 10px;
        border-radius: 3px;
        display:inline-block;
        margin-right: 6px;
        vertical-align: middle;
      }
      .swA{ background: var(--accentA); }
      .swB{ background: var(--accentB); }
      .swTol{
        border: 2px dashed #00aa55;
        background: transparent;
      }
      canvas.reportGraph{
        width: 100%;
        height: auto;
        display:block;
        border-radius: 10px;
        background: #fff;
      }

      /* Tables */
      table{
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        font-size: 12px;
      }
      th, td{
        border: 1px solid var(--border);
        padding: 6px 8px;
        text-align: right;
        vertical-align: top;
      }
      th:first-child, td:first-child{ text-align: left; }
      thead th{
        background: var(--soft);
        font-weight: 900;
      }
      tr.fail td{ background: rgba(217,48,37,.06); }
      tr.pass td{ background: rgba(15,157,88,.06); }
      /* Print-safe indicators: borders usually survive even if backgrounds are suppressed */

      tr.fail td:first-child { border-left: 6px solid var(--bad); }
      tr.pass td:first-child { border-left: 6px solid var(--good); }

      /* Comments */
      .commentsBox{
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 10px 12px;
        background: #fff;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12.5px;
        line-height: 1.35;
      }

      @media print{
        body{ margin: 0.5in; }
        .section{ page-break-inside: avoid; }
        .top{ break-after: avoid; }
      }
    `;

    const metaHTML = buildMetaHtml({
      tag, wo, ts, tech, comments,
      inType, inLRV, inURV, inUOM, inEq,
      outType, outLRV: data?.output?.LRV ?? '—', outURV: data?.output?.URV ?? '—', outUOM, outEq,
      characteristic,
      tolerance: data?.tolerance ?? '—'
    });

    const summaryHTML = buildSummaryHtml({
      tol,
      afFailCount,
      alFailCount,
      asLeftRequired,
      correctedCount
    });

    const commentsHTML = `
      <div class="section">
        <h3>Technician Comments</h3>
        <div class="commentsBox">${escapeHtml(comments)}</div>
      </div>
    `;

    const graphHTML = `
      <div class="section">
        <h3>Calibration Plot</h3>

        <div class="graphWrap">
          <div class="graphHeader">
            <div class="labels">
              <div><b>X‑Axis:</b> Input (% of span)</div>
              <div><b>Y‑Axis:</b> Output (${escapeHtml(outUOM || '—')})</div>
              <div class="small">
                <b>Input Range:</b> ${escapeHtml(String(inLRV))} – ${escapeHtml(String(inURV))} ${escapeHtml(inUOM || '')}
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <b>Output Range:</b> ${escapeHtml(String(data?.output?.LRV ?? '—'))} – ${escapeHtml(String(data?.output?.URV ?? '—'))} ${escapeHtml(outUOM || '')}
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <b>Tolerance:</b> ±${escapeHtml(String(data?.tolerance ?? '—'))}%
              </div>
            </div>

            <div class="legend">
              <span><span class="swatch swA"></span>As‑Found</span>
              <span><span class="swatch swB"></span>As‑Left</span>
              <span><span class="swatch swTol"></span>Tolerance Band</span>
            </div>
          </div>

          <canvas id="reportGraph" class="reportGraph" width="980" height="420"></canvas>
        </div>
      </div>
    `;

    const tablesHTML =
      tableHTML(afRows, 'As‑Found', { tol, mode: 'af' }) +
      tableHTML(alRows, 'As‑Left',  { tol, mode: 'al', afRows });


    w.document.write(`
      <html>
        <head>
          <title>${escapeHtml(reportTitle)} — ${escapeHtml(String(tag))}</title>
          <style>${css}</style>
        </head>
        <body>
          <div class="top">
            <div class="brand">
              <img src="https://pragoptics.com/images/logo.png" alt="" />
              <div class="brandTitle">
                <h1>${escapeHtml(reportTitle)}</h1>
                <div class="kicker">PragOptics™ — Instrument Calibration (As‑Found / As‑Left)</div>
              </div>
            </div>

            <div class="docMeta">
              <div><b>Tag:</b> ${escapeHtml(String(tag))}</div>
              <div><b>Work Order:</b> ${escapeHtml(String(wo))}</div>
              <div><b>Generated:</b> ${escapeHtml(String(ts))}</div>
            </div>
          </div>

          <div class="section">
            <h3>Summary</h3>
            <div class="panel">${summaryHTML}</div>
          </div>

          <div class="section">
            <h3>Calibration Details</h3>
            <div class="panel metaGrid">${metaHTML}</div>
          </div>

          ${commentsHTML}

          ${graphHTML}

          ${tablesHTML}

          <script>
            const REPORT_DATA = ${safeDataJs};

            (function(){
              function num(v){
                const n = Number(v);
                return Number.isFinite(n) ? n : NaN;
              }
              function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

              function parseRows(rows){
                const inLRV = num(REPORT_DATA?.input?.LRV);
                const inURV = num(REPORT_DATA?.input?.URV);
                const span = (Number.isFinite(inLRV) && Number.isFinite(inURV)) ? (inURV - inLRV) : NaN;

                return (Array.isArray(rows) ? rows : []).map(r => {
                  const actIn  = num(r && r.actualInput);
                  const actOut = num(r && r.actualOutput);
                  const nomPt  = num(r && r.point); // fallback

                  let xPct = NaN;
                  if (Number.isFinite(actIn) && Number.isFinite(span) && span !== 0) {
                    xPct = ((actIn - inLRV) / span) * 100;
                  } else if (Number.isFinite(nomPt)) {
                  xPct = nomPt; // fallback to nominal step percent
                  }

                  return { nomPt, xPct, actOut };
                }).filter(p => Number.isFinite(p.xPct) && Number.isFinite(p.actOut));
              }

              function drawGraph(){
                const c = document.getElementById('reportGraph');
                if (!c) return;
                const ctx = c.getContext('2d');
                if (!ctx) return;

                // HiDPI crispness
                const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
                const cssW = c.clientWidth || 980;
                const cssH = Math.round(cssW * (420/980));
                c.width = Math.floor(cssW * dpr);
                c.height = Math.floor(cssH * dpr);
                ctx.setTransform(dpr,0,0,dpr,0,0);

                const W = cssW, H = cssH;

                // Data
                const af = parseRows(REPORT_DATA.asFound);
                const al = parseRows(REPORT_DATA.asLeft);

                // ===== X domain (mirror Y-axis behavior) =====
                let xMin = 0;
                let xMax = 100;

               const xVals = []
                .concat(af.map(p => p.xPct), al.map(p => p.xPct))
                .filter(v => Number.isFinite(v));

                if (xVals.length) {
                xMin = Math.min(0, ...xVals);
               xMax = Math.max(100, ...xVals);
              }

              // Pad X domain (~8%, minimum 2%)
              const xSpan = (xMax - xMin) || 100;
              const xPad  = Math.max(xSpan * 0.08, 2);

              xMin -= xPad;
              xMax += xPad;

                const outLRV = num(REPORT_DATA?.output?.LRV);
                const outURV = num(REPORT_DATA?.output?.URV);
                const tol = num(REPORT_DATA?.tolerance) || 0;

                // Use output range if valid, else infer from data
                let yMin = outLRV, yMax = outURV;
                const all = []
                  .concat(af.map(p => p.actOut), al.map(p => p.actOut))
                  .filter(v => Number.isFinite(v));

                if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
                  if (all.length) {
                    yMin = Math.min(...all);
                    yMax = Math.max(...all);
                  } else {
                    yMin = 0; yMax = 1;
                  }
                }

                // pad slightly for visual breathing room
                const pad = (yMax - yMin) * 0.08 || 1;
                yMin -= pad; yMax += pad;

                // Plot bounds
                const m = { l: 64, r: 18, t: 18, b: 56 };
                const x0 = m.l, x1 = W - m.r;
                const y0 = H - m.b, y1 = m.t;

                const xScale = (pct) =>
                x0 + ((pct - xMin) / (xMax - xMin)) * (x1 - x0);
                const yScale = (v) => y0 - ((v - yMin) / (yMax - yMin)) * (y0 - y1);

                // Background
                ctx.clearRect(0,0,W,H);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0,0,W,H);

                // Grid
                ctx.strokeStyle = 'rgba(0,0,0,0.08)';
                ctx.lineWidth = 1;

                // vertical grid lines at points
                [0,25,50,75,100].forEach(p => {
                  const x = xScale(p);
                  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y0); ctx.stroke();
                });

                // horizontal grid lines (4)
                for (let i=0;i<=4;i++){
                  const y = y0 - i*(y0-y1)/4;
                  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
                }

                // Axes
                ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x0,y0); ctx.stroke();

                // Axis labels + ticks
                ctx.fillStyle = 'rgba(0,0,0,0.70)';
                ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';

                // X tick labels
                [0,25,50,75,100].forEach(p => {
                  const x = xScale(p);
                  const text = p + '%';
                  const tw = ctx.measureText(text).width;
                  ctx.fillText(text, x - tw/2, y0 + 22);
                });

                // Y tick labels (min/max + midpoints)
                const yticks = 4;
                for (let i=0;i<=yticks;i++){
                  const v = yMin + (i/yticks)*(yMax-yMin);
                  const y = yScale(v);
                  const text = (Number.isFinite(v) ? v.toFixed(2) : '—');
                  ctx.fillText(text, 10, y + 4);
                }


              // Expected curve from transfer function vs X (% span)
              // (reuse outLRV/outURV/tol already declared above in drawGraph)
              const characteristic = (REPORT_DATA?.output?.characteristic || 'linear').toString().toLowerCase();
              const outSpan = (Number.isFinite(outLRV) && Number.isFinite(outURV)) ? (outURV - outLRV) : NaN;

              // tol band thickness in output units = tol% of output span (fallback to plotted span)
              const tolDelta = (Number.isFinite(outSpan) ? (tol/100) * outSpan : (tol/100) * (yMax - yMin));

              function expectedOutAtPct(pct){
                if (!Number.isFinite(outLRV) || !Number.isFinite(outURV) || outURV === outLRV) return NaN;
                if (!Number.isFinite(outSpan)) return NaN;

                const p = pct / 100;
                if (characteristic === 'sqrt') {
                 return outLRV + outSpan * Math.sqrt(Math.max(0, p));
               }
               return outLRV + outSpan * p;
              }

// Draw tolerance band on nominal curve at standard ticks (0/25/50/75/100)
const expPts = [0,25,50,75,100].map(p => expectedOutAtPct(p));
if (expPts.some(v => Number.isFinite(v))) {
  const upper = expPts.map(v => Number.isFinite(v) ? (v + tolDelta) : NaN);
  const lower = expPts.map(v => Number.isFinite(v) ? (v - tolDelta) : NaN);

  ctx.setLineDash([8,6]);
  ctx.strokeStyle = 'rgba(0,170,85,0.95)';
  ctx.lineWidth = 2;
  drawLine(upper);
  drawLine(lower);
  ctx.setLineDash([]);
}

                // AF and AL series
                ctx.lineWidth = 2.6;

                // AF
                ctx.strokeStyle = 'rgba(162,0,255,0.85)';
                drawSeriesLine(af);
                drawSeriesDots(af, 'rgba(162,0,255,0.85)');

                // AL
                ctx.strokeStyle = 'rgba(28,164,144,0.85)';
                drawSeriesLine(al);
                drawSeriesDots(al, 'rgba(28,164,144,0.85)');

                // helper: draw from expPts at standard points
                function drawLine(series){
                  ctx.beginPath();
                  let started = false;
                  [0,25,50,75,100].forEach((pt, i) => {
                    const v = series[i];
                    if (!Number.isFinite(v)) { started = false; return; }
                    const x = xScale(pt);
                    const y = yScale(v);
                    if (!started){
                      ctx.moveTo(x,y);
                      started = true;
                    } else {
                      ctx.lineTo(x,y);
                    }
                  });
                  if (started) ctx.stroke();
                }

                function drawSeriesLine(rows){
                  const r = rows.slice().sort((a,b)=>a.xPct-b.xPct);
                  ctx.beginPath();
                  let started = false;
                  r.forEach(p => {
                    if (!Number.isFinite(p.actOut)) { started = false; return; }
                    const x = xScale(p.xPct);
                    const y = yScale(p.actOut);
                    if (!started){ ctx.moveTo(x,y); started=true; }
                    else ctx.lineTo(x,y);
                  });
                  if (started) ctx.stroke();
                }

                function drawSeriesDots(rows, color){
                  const r = rows.slice().sort((a,b)=>a.xPct-b.xPct);
                  ctx.fillStyle = color;
                  r.forEach(p => {
                    if (!Number.isFinite(p.actOut)) return;
                    const x = xScale(p.xPct);
                    const y = yScale(p.actOut);
                    ctx.beginPath();
                    ctx.arc(x,y,4,0,Math.PI*2);
                    ctx.fill();
                  });
                }
              }

              function drawLine(series){ /* (kept for safety, unused here) */ }

              // Draw first, then print
              window.addEventListener('load', () => {
                try { drawGraph(); } catch {}
                // ensure canvas/layout paints before printing
                setTimeout(() => window.print(), 60);
              });
            })();
          </script>
        </body>
      </html>
    `);

    w.document.close();
  }

  // ===== tables (includes fail/pass row styling) =====
  function tableHTML(rows, title, { tol, mode, afRows } = {}) {
  const norm = (v) => (v == null || v === '') ? '—' : String(v);
  const tolN = toNum(tol);

  // Map AF fails by point so AL can mark "corrected" when now within tol
  const afFailByPoint = new Map();

  if (mode === 'al' && Array.isArray(afRows) && Number.isFinite(tolN)) {
    for (const r of afRows) {
      const p = toNum(r?.point);
      const e2 = absErr2dp(r?.errorPercent);
      if (!Number.isFinite(p) || !Number.isFinite(e2)) continue;

      // ✅ AF FAIL rule (matches UI + your new print rule): >= tol is FAIL
      afFailByPoint.set(p, e2 >= tolN);
    }
  }

  const body = (rows || []).map(r => {
    const p = toNum(r?.point);
    const e2 = absErr2dp(r?.errorPercent);

    // Fail/pass evaluation
    const hasTol = Number.isFinite(tolN);
    const hasErr = Number.isFinite(e2);

    // ✅ FAIL rule: >= tol is FAIL
    const fail = (hasTol && hasErr) ? (e2 >= tolN) : false;

    let cls = '';

    if (mode === 'af') {
      cls = fail ? 'fail' : '';
    } else if (mode === 'al') {
      if (fail) {
        cls = 'fail';
      } else {
        // ✅ Corrected = AF was FAIL and AL is PASS (< tol)
        const afWasFail = (Number.isFinite(p) ? afFailByPoint.get(p) : false) === true;
        const alIsPass = (hasTol && hasErr) ? (e2 < tolN) : false;

        if (afWasFail && alIsPass) cls = 'pass';
      }
    }

    return `
      <tr class="${cls}">
        <td>${escapeHtml(norm(r?.point))}%</td>
        <td>${escapeHtml(norm(r?.expectedInput))}</td>
        <td>${escapeHtml(norm(r?.actualInput))}</td>
        <td>${escapeHtml(norm(r?.expectedOutput))}</td>
        <td>${escapeHtml(norm(r?.actualOutput))}</td>
        <td>${escapeHtml(norm(r?.errorPercent))}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="section">
      <h3>${escapeHtml(title)}</h3>
      <table>
        <thead>
          <tr>
            <th>Point</th>
            <th>Exp In</th>
            <th>Act In</th>
            <th>Exp Out</th>
            <th>Act Out</th>
            <th>Error %</th>
          </tr>
        </thead>
        <tbody>
          ${body || `<tr><td colspan="6" class="muted">No data</td></tr>`}
        </tbody>
      </table>
      <div class="muted small" style="margin-top:8px;">
        ${mode === 'al'
          ? 'Row shading: red = out of tolerance (≥ tol); green = corrected from As‑Found (AF fail, AL pass).'
          : 'Row shading: red = out of tolerance (≥ tol).'}
      </div>
    </div>
  `;
}

  // ===== meta html =====
  function buildMetaHtml(m) {
    const lines = [
      kv('Tag:', m.tag),
      kv('Work Order:', m.wo),
      kv('Technician:', m.tech),
      kv('Timestamp:', m.ts),

      kv('Input Type:', m.inType),
      kv('Input Range:', `${m.inLRV}–${m.inURV} ${m.inUOM || ''}`.trim()),
      kv('Input Equip:', m.inEq),

      kv('Output Type:', m.outType),
      kv('Output Range:', `${m.outLRV}–${m.outURV} ${m.outUOM || ''}`.trim()),
      kv('Output Equip:', m.outEq),

      kv('Tolerance:', `±${m.tolerance}%`),
      kv('Characteristic:', m.characteristic),
    ];
    return lines.join('');
  }

  // ===== summary html =====
  function buildSummaryHtml(s) {
    const tolTxt = Number.isFinite(Number(s.tol)) ? `±${Number(s.tol).toFixed(2)}%` : '—';

    const afPill = (s.afFailCount > 0)
      ? pill(`As‑Found: OUT (${s.afFailCount} point${s.afFailCount===1?'':'s'})`, 'bad')
      : pill(`As‑Found: PASS`, 'good');

    const reqPill = s.asLeftRequired
      ? pill(`As‑Left: REQUIRED`, 'warn')
      : pill(`As‑Left: Optional`, 'good');

    const alPill = (s.alFailCount > 0)
      ? pill(`As‑Left: OUT (${s.alFailCount} point${s.alFailCount===1?'':'s'})`, 'bad')
      : pill(`As‑Left: PASS`, 'good');

    const corrPill = (s.correctedCount > 0)
      ? pill(`Corrected: ${s.correctedCount}`, 'good')
      : pill(`Corrected: 0`, 'muted');

    return `
      <div class="summaryRow">
        ${pill(`Tolerance: ${escapeHtml(tolTxt)}`, 'muted')}
        ${afPill}
        ${reqPill}
        ${alPill}
        ${corrPill}
      </div>
      <div class="muted small" style="margin-top:10px;">
        Rule: If any As‑Found point meets or exceeds tolerance, As‑Left becomes mandatory.
      </div>
    `;
  }

  // ===== helpers =====
  function kv(label, value) {
    return `<div class="kv"><b>${escapeHtml(label)}</b><span>${escapeHtml(String(value ?? '—'))}</span></div>`;
  }

  function pill(text, kind) {
    const k = (kind === 'good') ? 'pill good'
      : (kind === 'bad') ? 'pill bad'
      : (kind === 'warn') ? 'pill warn'
      : 'pill';
    return `<span class="${k}">${escapeHtml(text)}</span>`;
  }

  function toNum(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Compare based on the UI's 2dp contract.
// Returns absolute error rounded to 2dp, and tolerance as Number.
function absErr2dp(err){
  const e = toNum(err);
  if (!Number.isFinite(e)) return NaN;
  return Math.round((Math.abs(e) + Number.EPSILON) * 100) / 100;
}

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function countFails(rows, tol) {
  const t = toNum(tol);
  if (!Number.isFinite(t)) return 0;

  let c = 0;
  for (const r of (rows || [])) {
    const e2 = absErr2dp(r?.errorPercent);
    if (!Number.isFinite(e2)) continue;

    // FAIL rule: >= tolerance is FAIL
    if (e2 >= t) c++;
  }
  return c;
}

function countCorrected(afRows, alRows, tol) {
  const t = toNum(tol);
  if (!Number.isFinite(t)) return 0;

  // AF fail map by point
  const afFail = new Map();
  for (const r of (afRows || [])) {
    const p = toNum(r?.point);
    const e2 = absErr2dp(r?.errorPercent);
    if (!Number.isFinite(p) || !Number.isFinite(e2)) continue;

    // FAIL rule: >= tolerance is FAIL
    afFail.set(p, e2 >= t);
  }

  // Corrected = AF failed AND AL now strictly inside tolerance (< tol)
  let corrected = 0;
  for (const r of (alRows || [])) {
    const p = toNum(r?.point);
    const e2 = absErr2dp(r?.errorPercent);
    if (!Number.isFinite(p) || !Number.isFinite(e2)) continue;

    if (afFail.get(p) === true && e2 < t) corrected++;
  }
  return corrected;
}

  function safeJsonForInlineScript(obj) {
    // Prevent </script> injection and keep safe in HTML context
    return JSON.stringify(obj ?? {})
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
