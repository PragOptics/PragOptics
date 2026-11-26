import { esc } from '../ui/words.js';

// Small AI amounts retain their recorded micro-dollar precision. A failed read
// is unavailable, never an invented zero or an apparently free answer.
export function aiMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'Unavailable';
  const dollars = Number(value) / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
const count = value => value == null ? 'Unavailable' : Number(value).toLocaleString('en-US');

export function adminAiDeskHtml(d, { statCard, tierPill, platformLane }) {
  const cap = d.cap || {}, p = d.provider || {}, m = d.money || {};
  const usage = d.usage || {}, updated = d.scope === 'customer-ai-passthrough';
  const ownCalls = usage.ownCalls ?? (d.rows || []).reduce((sum, row) => sum + (Number(row.ownCalls) || 0), 0);
  const markup = d.pricing?.markupPercent ?? m.markupPercent ?? m.marginPercent;
  const grossPercent = m.grossMarginPercent;
  const hasCap = Number(cap.capCents) > 0, pct = Number(cap.percent) || 0;
  const models = d.pricing?.lanes || (p.lanes || []).map(lane => ({ ...lane, estimatedCostCents: lane.exchangeCents,
    estimatedChargeCents: markup == null ? null : lane.exchangeCents * (1 + markup / 100) }));
  const rows = d.rows || [], lane = d.platform || platformLane;
  return `
    <p class="adm-note"><strong>${esc(lane === 'dev' ? 'Dev platform' : 'Live platform')}</strong> · ${esc(d.month || '')} UTC · Customer AI passthrough</p>
    <div class="adm-stat-grid">
      ${statCard(aiMoney(m.revenueCents), 'Platform credit used', 'Usage charges, not credit top-up payments')}
      ${statCard(aiMoney(m.costCents ?? cap.totalCents), 'Estimated provider cost', usage.trialEstimatedCostCents == null ? 'Token usage × configured provider rates' : `Includes ${aiMoney(usage.trialEstimatedCostCents)} of recorded free-trial cost`)}
      ${statCard(aiMoney(m.marginCents), 'Usage result', grossPercent == null ? 'Charges less estimated provider cost' : `${grossPercent}% of usage charges; excludes fees and other operating costs`, Number(m.marginCents) < 0 ? 'amber' : '')}
      ${statCard(aiMoney(m.outstandingCents), 'Customer credit held', m.outstandingComplete === false ? 'Partial or unavailable balance total' : `${count(m.outstandingOwners)} accounts with credit`)}
      ${statCard(count(usage.platformCalls ?? cap.totalCalls), 'Platform-funded answers', usage.trialCalls == null ? 'Includes free-trial answers' : `Includes ${count(usage.trialCalls)} recorded free-trial answers`)}
      ${statCard(count(ownCalls), 'Connected-account answers', usage.ownComplete === false ? 'Partial count; paid directly to the customer’s provider' : 'Paid directly to the customer’s provider')}
    </div>
    ${cap.totalsAvailable === false ? '<p class="acct-error" role="status">The platform usage rollup is missing. Platform totals could not be verified.</p>' : ''}
    ${m.outstandingComplete === false ? '<p class="acct-error" role="status">Credit totals are incomplete. An unread balance is not counted as zero.</p>' : !updated ? '<p class="adm-note">The backend reporting update is required to verify credit held by accounts with no usage this month.</p>' : ''}
    ${Number(m.overdrawnCents) > 0 ? `<p class="acct-error" role="status">Overdrawn balances: ${esc(aiMoney(m.overdrawnCents))} across ${esc(count(m.overdrawnOwners))} accounts. Review credit settlement.</p>` : ''}
    <div class="adm-card">
      <h3 class="adm-card-h">Platform-funded AI safeguard</h3>
      <p>${hasCap ? `${esc(aiMoney(cap.totalCents))} estimated provider cost against a ${esc(aiMoney(cap.capCents))} monthly stop threshold (${esc(pct)}%).` : 'No monthly platform-funded spend stop is configured.'}</p>
      ${hasCap ? `<div class="use-row ev-meter"><div class="use-head"><span class="use-name">Recorded cost against threshold</span><span class="use-val">${esc(pct)}%${cap.warned80 ? ' · 80% notice recorded' : ''}</span></div><div class="use-track"><div class="use-fill ${pct >= 95 ? 'is-hot' : pct >= 70 ? 'is-warn' : ''}" style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></div></div></div>` : ''}
      <p class="adm-note">This check stops new platform-funded requests once recorded estimated cost reaches the threshold. Requests already in flight can exceed it. Connected customer AI accounts use their own limits. Prepaid credit and free-trial eligibility are checked separately.</p>
      <p class="adm-note">These figures cover customer AI passthrough on this platform lane. Internal anomaly/support AI and provider invoices are outside this report.</p>
    </div>
    <div class="adm-card">
      <h3 class="adm-card-h">Platform models and estimated pricing</h3>
      <p class="adm-note">${esc(p.configured ? p.name : 'Provider not configured')} · Default model tier: ${esc(p.defaultLane || 'Unavailable')}. Configured markup on provider cost: ${markup == null ? 'Unavailable' : esc(markup) + '%'}.</p>
      ${models.length ? `<div class="adm-table-scroll"><table class="adm-table">
        <thead><tr><th>Model tier</th><th>Model</th><th class="adm-num">Input / 1M tokens</th><th class="adm-num">Output / 1M tokens</th><th class="adm-num">Example provider cost</th><th class="adm-num">Example customer charge</th></tr></thead>
        <tbody>${models.map(model => `<tr><td>${esc(model.lane)}${model.lane === p.defaultLane ? ' <span class="acct-tag is-primary">default</span>' : ''}</td><td><code>${esc(model.model)}</code></td><td class="adm-num">${model.inputUsdPerMillion == null ? 'Unavailable' : esc(aiMoney(model.inputUsdPerMillion * 100))}</td><td class="adm-num">${model.outputUsdPerMillion == null ? 'Unavailable' : esc(aiMoney(model.outputUsdPerMillion * 100))}</td><td class="adm-num">${esc(aiMoney(model.estimatedCostCents))}</td><td class="adm-num">${esc(aiMoney(model.estimatedChargeCents))}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}
      <p class="adm-note">Examples use ${esc(count(d.pricing?.example?.inputTokens ?? 2000))} input and ${esc(count(d.pricing?.example?.outputTokens ?? 500))} output tokens. Actual usage varies. Configured rates estimate provider cost; they are not invoice verification. Customer charges use the configured markup; free-trial answers do not draw prepaid credit.</p>
    </div>
    <div class="adm-card">
      <h3 class="adm-card-h">Customer account usage</h3>
      ${rows.length ? `<div class="adm-table-scroll"><table class="adm-table">
        <thead><tr><th>Account</th><th>Plan</th><th class="adm-num">Platform credit used</th><th class="adm-num">Estimated platform cost</th><th class="adm-num">Usage result</th><th class="adm-num">Credit available</th><th class="adm-num">Platform answers</th><th class="adm-num">Connected-account answers</th><th class="adm-num">Connected-account estimate</th></tr></thead>
        <tbody>${rows.map(row => `<tr><td class="cell-ellip" title="${esc(row.email || row.userId)}">${esc(row.email || row.userId)}</td><td>${row.tier ? tierPill(row.tier) : 'Unavailable'}</td><td class="adm-num">${esc(aiMoney(row.usedCents))}</td><td class="adm-num">${esc(aiMoney(row.costCents))}</td><td class="adm-num">${esc(aiMoney(row.marginCents))}</td><td class="adm-num">${esc(aiMoney(row.balanceCents))}${Number(row.overdrawnCents) > 0 ? `<div class="acct-error">Overdrawn ${esc(aiMoney(row.overdrawnCents))}</div>` : ''}</td><td class="adm-num">${esc(count(row.calls))}</td><td class="adm-num">${esc(count(row.ownCalls || 0))}</td><td class="adm-num">${esc(aiMoney(row.ownCostCents || 0))}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="adm-empty">No customer AI usage is recorded this month. Unused credit is included in the credit total above.</p>'}
      ${d.truncated ? `<p class="adm-note">Showing ${esc(count(d.shown ?? rows.length))} accounts; the account list is incomplete. Platform rollup totals are read separately.</p>` : ''}
    </div>`;
}
