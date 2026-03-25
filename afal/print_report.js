/* print_report.js
   Printable snapshot report for the Calibration Form
   Requires (global): captureGraphImage() -> returns dataURL string or null
*/

(function () {
  'use strict';

  // Expose globally
  window.openPrintableReport = openPrintableReport;

  function openPrintableReport(payload) {
    // Capture graph if present (expects captureGraphImage in main script)
    const graphImg = safeCaptureGraph();

    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) {
      alert('Popup blocked');
      return;
    }

    const css = `
      :root { --border:#bbb; --muted:#555; --bg:#fff; --ink:#111; }
      * { box-sizing: border-box; }
      body{
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial;
        color: var(--ink);
        background: var(--bg);
        margin: 24px;
      }
      h1,h2,h3{ margin:0 0 8px; }
      .section{ margin-bottom: 22px; }
      .meta{
        display:grid;
        grid-template-columns: repeat(2, minmax(0,1fr));
        gap: 6px 18px;
        font-size: 13px;
        line-height: 1.25;
      }
      .meta div{ word-break: break-word; }
      .muted{ color: var(--muted); }
      .graph img{
        max-width:100%;
        border:1px solid #999;
        border-radius: 8px;
        display:block;
      }
      table{
        width:100%;
        border-collapse:collapse;
        margin-top:8px;
      }
      th,td{
        border:1px solid var(--border);
        padding:6px 8px;
        font-size:12px;
        text-align:right;
        vertical-align:top;
      }
      th:first-child, td:first-child{ text-align:left; }
      .kv { display:flex; gap:6px; }
      .kv b { white-space:nowrap; }
      details{ margin-top: 8px; }
      summary{ cursor:pointer; user-select:none; }
      pre{
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 11px;
        border: 1px solid #ccc;
        padding: 10px;
        border-radius: 8px;
        background: #fafafa;
        margin: 10px 0 0;
      }
      @media print{
        body{ margin: 0.5in; }
        .section{ page-break-inside: avoid; }
      }
    `;

    const tableHTML = (rows, title) => `
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
            ${(rows || []).map(r => `
              <tr>
                <td>${escapeHtml(String(r?.point ?? '—'))}%</td>
                <td>${escapeHtml(String(r?.expectedInput ?? '—'))}</td>
                <td>${escapeHtml(String(r?.actualInput ?? '—'))}</td>
                <td>${escapeHtml(String(r?.expectedOutput ?? '—'))}</td>
                <td>${escapeHtml(String(r?.actualOutput ?? '—'))}</td>
                <td>${escapeHtml(String(r?.errorPercent ?? '—'))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Flattened (NO nested template literal inside the big write string)
    const graphSection = graphImg
      ? `
        <div class="section graph">
          <h3>Calibration Plot</h3>
          <img src="${graphImg}" alt="Calibration plot">
        </div>
      `
      : '';

    const meta = buildMeta(payload);

    const jsonSection = `
      <div class="section">
        <h3>JSON Payload</h3>
        <details>
          <summary class="muted">Show JSON</summary>
          <pre>${escapeHtml(JSON.stringify(payload ?? {}, null, 2))}</pre>
        </details>
      </div>
    `;

    w.document.write(`
      <html>
        <head>
          <title>Calibration Report</title>
          <style>${css}</style>
        </head>
        <body>
          <h1>Calibration Report</h1>

          <div class="section meta">
            ${meta}
          </div>

          ${graphSection}

          ${tableHTML(payload?.asFound, 'As‑Found')}
          ${tableHTML(payload?.asLeft,  'As‑Left')}

          ${jsonSection}

          <script>
            window.onload = () => window.print();
          </script>
        </body>
      </html>
    `);

    w.document.close();
  }

  function safeCaptureGraph() {
    try {
      if (typeof window.captureGraphImage === 'function') {
        const s = window.captureGraphImage();
        return (typeof s === 'string' && s.startsWith('data:image/')) ? s : '';
      }
      return '';
    } catch {
      return '';
    }
  }

  function buildMeta(payload) {
    const tag = payload?.tag || '—';
    const wo = payload?.workOrder || '—';
    const tech = payload?.technician || '—';
    const ts = payload?.timestamp ? new Date(payload.timestamp).toLocaleString() : '—';

    const inLRV = payload?.input?.LRV ?? '—';
    const inURV = payload?.input?.URV ?? '—';
    const inUOM = payload?.input?.UOM ?? '';

    const outLRV = payload?.output?.LRV ?? '—';
    const outURV = payload?.output?.URV ?? '—';
    const outUOM = payload?.output?.UOM ?? '';

    const tol = payload?.tolerance ?? '—';
    const ch = payload?.output?.characteristic ?? '—';

    const inEq = payload?.input?.testEquipment ?? '—';
    const outEq = payload?.output?.testEquipment ?? '—';

    const lines = [
      kv('Tag:', tag),
      kv('Work Order:', wo),
      kv('Technician:', tech),
      kv('Timestamp:', ts),
      kv('Input:', `${inLRV}–${inURV} ${inUOM}`.trim()),
      kv('Output:', `${outLRV}–${outURV} ${outUOM}`.trim()),
      kv('Tolerance:', `±${tol}%`),
      kv('Characteristic:', ch),
      kv('Input Equip:', inEq),
      kv('Output Equip:', outEq),
    ];

    return lines.join('');
  }

  function kv(label, value) {
    return `<div class="kv"><b>${escapeHtml(label)}</b><span>${escapeHtml(String(value ?? '—'))}</span></div>`;
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
