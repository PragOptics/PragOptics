import { esc as escapeHtml } from '../ui/words.js';

// Stripe's API keeps two-decimal amounts for ISK and UGX. The other listed
// zero-decimal currencies are already in whole units (docs.stripe.com/currencies).
const whole = new Set('BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF VND VUV XAF XOF XPF'.split(' '));
const thousandths = new Set('BHD JOD KWD OMR TND'.split(' '));
function stripeMoney(minor, currency) {
  const scale = whole.has(currency) ? 1 : thousandths.has(currency) ? 1000 : 100;
  const digits = Math.log10(scale);
  return new Intl.NumberFormat('en-US', { style:'currency', currency, currencyDisplay:'code',
    minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / scale);
}

export function subscriptionReportHtml(report, legacyCounts) {
  const title = '<h3 class="adm-card-h">Subscriptions in force</h3>';
  if (!report) {
    const legacyRows = Object.entries(legacyCounts || {}).map(([key, value]) =>
      `<tr><td><code>${escapeHtml(key)}</code></td><td class="adm-num">${escapeHtml(String(value.count))}</td>
      <td class="adm-num">${Number.isFinite(value.runRateCents) ? escapeHtml(stripeMoney(value.runRateCents, 'USD')) : 'Unavailable'}</td></tr>`
    ).join('');
    return `<div class="adm-card">${title}<p class="adm-note">Partial price breakdown. The current backend reports only prices with lookup keys. Figures count units and use the legacy USD estimate; Stripe currency and billing cadence are unverified.</p>
      ${legacyRows ? `<div class="adm-table-scroll"><table class="adm-table"><thead><tr><th>Price</th><th class="adm-num">Units</th><th class="adm-num">Legacy monthly estimate</th></tr></thead><tbody>${legacyRows}</tbody></table></div>` : ''}</div>`;
  }
  const partial = report.warnings.length > 0;
  const rows = report.rows.map(row => {
    let rate = row.pricedItems > 0 ? stripeMoney(row.monthlyMinor, row.currency) : 'Not estimated';
    if (row.pricedItems > 0 && row.unpricedItems > 0) rate += ' + unestimated items';
    return `<tr><td><code>${escapeHtml(row.label)}</code></td><td class="adm-num">${escapeHtml(String(row.subscriptions))}</td><td class="adm-num">${escapeHtml(String(row.units ?? '—'))}</td><td class="adm-num">${escapeHtml(rate)}</td></tr>`;
  }).join('');
  return `<div class="adm-card">${title}
    ${partial ? '<p class="adm-note" role="status">Partial Stripe read. Counts and amounts below cover only the subscriptions and items retrieved.</p>' : ''}
    ${rows ? `<div class="adm-table-scroll"><table class="adm-table"><thead><tr><th>Price</th><th class="adm-num">Subscriptions</th><th class="adm-num">Units</th><th class="adm-num">Gross monthly equivalent</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="adm-note">An active subscription can carry several prices. Amounts use listed recurring prices before discounts, taxes and fees. Daily and weekly prices use an average calendar month. Usage-based and other indeterminate amounts are excluded from the estimate.</p>`
    : `<p class="adm-empty">${partial ? 'No price rows could be verified.' : 'No active subscriptions.'}</p>`}
  </div>`;
}
