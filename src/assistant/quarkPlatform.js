// Deterministic platform guidance. Descriptions come from the capability registry;
// navigation uses existing surfaces. This module cannot place orders or move money.
export const FAMILIES = Object.freeze({
  connections: 'Connected accounts', 'auth-identity': 'Accounts and teams',
  'billing-commerce': 'Billing, hardware and warranty', 'domains-licensing': 'Domains, licensing and mail',
  'studio-projects': 'Studio and reusable modules', 'imports-data': 'Data, documents and archives',
  'shipping-ai-metering': 'Shipping, AI, usage and support', 'admin-desks': 'Platform operator desks',
  'env-lifecycle': 'Environment and platform operations', assistant: 'Quark and platform knowledge'
});

const STOP = new Set('a an the my me i you your our this that these those it is are do does can could would please how what where why when tell show about want need to for of on in with and or use using'.split(' '));
const ALIASES = [
  [/\b(?:web address|hostname|dns)\b/g, ' domain '], [/\b(?:mailbox|mailer|email|e-mail)\b/g, ' mail '],
  [/\b(?:backup|restore|back up)\b/g, ' archive '], [/\b(?:seat|seats|license|licenses)\b/g, ' licensing '],
  [/\b(?:apikey|api key|api keys)\b/g, ' keys '], [/\b(?:python|powershell|power shell|fnm)\b/g, ' engine ']
];
function words(value) {
  let text = String(value || '').toLowerCase();
  for (const [pattern, replacement] of ALIASES) text = text.replace(pattern, replacement);
  return [...new Set((text.match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !STOP.has(w)))];
}

export function capabilityFamilies(capabilities = []) {
  const groups = new Map();
  for (const capability of capabilities) {
    if (!capability || typeof capability.id !== 'string') continue;
    const key = capability.id.split('.')[0];
    if (!groups.has(key)) groups.set(key, { id: key, title: FAMILIES[key] || key, capabilities: [] });
    groups.get(key).capabilities.push(capability);
  }
  return [...groups.values()];
}

export function findCapabilities(capabilities = [], query = '', limit = 8) {
  const text = String(query).trim().toLowerCase();
  const identifiers = text.match(/\b[a-z0-9-]+\.[a-z0-9-]+\b/g) || [];
  const exact = capabilities.find(c => typeof c.id === 'string' && (text === c.id.toLowerCase() || identifiers.includes(c.id.toLowerCase())));
  if (exact) return [exact];
  const terms = words(text);
  if (!terms.length) return [];
  return capabilities.map(capability => {
    const title = new Set(words(capability.id));
    const description = new Set(words(capability.what));
    const detail = new Set(words([...(capability.how || []), capability.why, capability.doneState].join(' ')));
    let score = 0, matched = 0;
    for (const term of terms) {
      const same = set => [...set].some(w => w === term || (Math.min(w.length, term.length) > 3 && (w === term + 's' || term === w + 's')));
      const value = same(title) ? 7 : same(description) ? 4 : same(detail) ? 1 : 0;
      score += value; if (value) matched++;
    }
    return { capability, score: score + (matched === terms.length ? 5 : 0), matched };
  }).filter(x => x.matched && x.score > 2).sort((a, b) => b.score - a.score || a.capability.id.localeCompare(b.capability.id))
    .slice(0, Math.max(1, Math.min(Number(limit) || 8, 30))).map(x => x.capability);
}

const ADMIN = {
  arrivals: 'overview', 'needs-attention': 'attention', notifications: 'notify', orders: 'shiporders',
  'orders-mine': 'orders', 'real-orders': 'shiporders', 'catalog-goods': 'catalog', 'catalog-import': 'catalog',
  conduct: 'users', roles: 'users', users: 'users', 'users-patch': 'users', tenants: 'tenants',
  'tenant-licensing-reset': 'tenants', 'stripe-overview': 'payments', 'stripe-webhook-sync': 'payments',
  'billing-reconcile': 'payments', 'agent-billing': 'agentdesk', 'support-requests': 'agentdesk',
  'anomaly-analyst': 'reports', costs: 'overview', 'agreement-notice': 'notify'
};

/** Explanations cover internal capabilities too. A button is offered only for a surface this user actually has. */
export function capabilityDestination(capability, context = {}) {
  if (!capability || typeof capability.id !== 'string') return null;
  if (!(capability.who || []).length || capability.who.every(w => w === 'platform') || (capability.who.includes('platform') && capability.who.every(w => w === 'platform' || w === 'visitor'))) return null;
  const [family, name] = capability.id.split('.');
  let section = '', card = '', mode = '';
  if (family === 'connections') {
    section = name === 'microsoft-operator-watch' ? 'attention' : 'environment'; card = section === 'environment' ? 'connections' : '';
  } else if (family === 'auth-identity') {
    section = name.startsWith('team-') ? 'team' : 'profile';
    card = name === 'passkeys' ? 'passkeys' : /password/.test(name) ? 'password' : /phone/.test(name) ? 'phone' : name === 'aliases' ? 'email' : '';
  } else if (family === 'billing-commerce') {
    if (name === 'warranty-codes') section = 'warranty';
    else if (name === 'warranty-mine') section = 'products';
    else if (/warranty/.test(name)) { mode = 'warranty'; }
    else if (name === 'catalog-prices' || name === 'shop-interest') mode = 'shop';
    else if (/order/.test(name)) { section = 'orders'; }
    else if (/catalog-sync/.test(name)) { section = 'catalog'; }
    else if (name === 'print-queue') { section = 'inventory'; }
    else { section = 'subscription'; card = name === 'billing-profile' ? 'details' : 'plan'; }
  } else if (family === 'domains-licensing') {
    section = name.startsWith('domain') ? 'environment' : 'licensing'; card = section === 'environment' ? 'domains' : '';
  } else if (family === 'studio-projects') {
    if (name === 'variables' || name === 'files') { section = 'environment'; card = name; }
    else if (name === 'site-serve') { section = 'environment'; card = 'domains'; }
    else if (name === 'builds-review') section = 'buildsqueue';
    else if (name === 'builds-catalog') mode = 'builds';
    else mode = 'studio';
  } else if (family === 'imports-data') {
    if (name === 'approvals') section = 'approvals';
    else { section = 'environment'; card = ({ 'site-import': 'import', 'records-import': 'import', 'document-worker': 'documents', 'data-tables': 'data', 'external-archive': 'archive' })[name] || 'environment'; }
  } else if (family === 'shipping-ai-metering') {
    if (/^ai(?:-|$)/.test(name)) section = 'ai';
    else if (name === 'admin-ai') section = 'aidesk';
    else if (name === 'support-desk') section = 'support';
    else if (name === 'support-intake') section = 'liveagents';
    else if (name === 'bandwidth') { section = 'subscription'; card = 'bandwidth'; }
    else if (name === 'usage-mine') { section = 'environment'; card = 'storage'; }
    else if (/ownstore/.test(name)) section = 'shiporders';
    else { section = 'environment'; card = 'connections'; }
  } else if (family === 'admin-desks') section = ADMIN[name] || '';
  else if (family === 'env-lifecycle') {
    section = 'environment';
    card = ({ sandbox: 'lanes', 'api-keys': 'keys', mailer: 'mail', provision: 'environment' })[name] || 'environment';
    if (name === 'setup') { section = 'home'; card = ''; }
    if (name === 'usage-overview') { section = 'overview'; card = ''; }
  } else if (family === 'assistant') section = 'home';
  if (!section && !mode) return null;
  // A team administrator is not a platform administrator. Use the account panel's available section list.
  if (section && !(context.sections || []).includes(section)) return null;
  return { section, card, mode };
}

export function setupView(value) {
  if (!value || !Array.isArray(value.groups)) return null;
  const steps = value.groups.flatMap(group => (Array.isArray(group.steps) ? group.steps : []).map(step => ({ ...step, group: group.title || group.id })));
  const next = steps.find(step => step.id === value.next?.id && ['next', 'open'].includes(step.state)) || steps.find(step => step.state === 'next') || steps.find(step => !step.optional && step.state === 'open') || null;
  return { steps, next, done: steps.filter(s => s.state === 'done').length, total: steps.filter(s => s.state !== 'off').length,
    waiting: steps.filter(s => s.state === 'waiting'), unavailable: steps.filter(s => s.state === 'off') };
}

export function isLaunchRequest(text) {
  return /\b(?:launch|build|create|start|publish)\b.{0,65}\b(?:website|web site|site|store|shop|page)\b|\bgo live\b/i.test(String(text));
}

export function scopeKey(scope = {}) { return JSON.stringify([scope.userId || '', scope.tenant || '', scope.lane === 'sandbox' ? 'sandbox' : 'live']); }
export function quarkRequestAllowed(apiBase, address, method = 'GET') {
  try {
    const base = new URL(apiBase), target = new URL(address);
    if (target.origin !== base.origin || target.username || target.password) return false;
    const prefix = base.pathname.replace(/\/$/, '') + '/';
    if (!target.pathname.startsWith(prefix)) return false;
    const resource = target.pathname.slice(prefix.length);
    if (method.toUpperCase() === 'GET') return ['assistant/knowledge','environment/setup','environment/connections','environment/data/supplier_products','environment/data/supplier_orders'].includes(resource);
    return method.toUpperCase() === 'POST' && ['environment/connections/shopify/refresh','environment/connections/shopify/sync','environment/connections/shopify/order-status'].includes(resource);
  } catch { return false; }
}
function failure(code, message) { return Object.assign(new Error(message), { code }); }
const READS = Object.freeze({ setup: 'environment/setup', connections: 'environment/connections',
  catalog: 'environment/data/supplier_products', orders: 'environment/data/supplier_orders' });
function publicConnection(row = {}) {
  return { id: row.id, provider: row.provider, status: row.status, label: row.label,
    message: row.message, verifiedAt: row.verifiedAt,
    detail: { managed: row.detail?.managed, shop: row.detail?.shop, name: row.detail?.name } };
}
function projectRead(resource, result = {}) {
  if (!result || typeof result !== 'object' || result.ok === false || (resource === 'connections' ? !Array.isArray(result.connections) : resource === 'setup' ? !Array.isArray(result.groups) : !Array.isArray(result.rows))) throw failure('UNCONFIRMED_RESULT', 'The platform did not return a valid result. No outcome was confirmed.');
  if (resource === 'connections') return { connections: (result.connections || []).map(publicConnection) };
  if (resource === 'setup') return result;
  const rows = (Array.isArray(result.rows) ? result.rows : []).map(row => {
    const value = row?.value || {};
    const common = { supplier: value.supplier, connectionId: value.connectionId, supplierName: value.supplierName, shop: value.shop };
    const visible = resource === 'catalog'
      ? { ...common, productId: value.productId, title: value.title, currency: value.currency,
        variants: (Array.isArray(value.variants) ? value.variants : []).map(v=>({ id:v.id, variantId:v.variantId, title:v.title, sku:v.sku, price:v.price, inventory:v.inventory, requiresShipping:v.requiresShipping })) }
      : { ...common, supplierOrderId:value.supplierOrderId, name:value.name, status:value.status,
        tracking:(Array.isArray(value.tracking) ? value.tracking : []).map(t=>({company:t.company,number:t.number,url:t.url,status:t.status})) };
    return { key: row.key, value: visible };
  });
  return { rows };
}

/** All transport rides the same authenticated panel fetch; no credential is returned to Quark. */
export function createPlatformGuide({ apiBase, context, request }) {
  const active = new Set();
  function snapshot() {
    const scope = context();
    if (!scope?.userId) throw failure('SIGN_IN_REQUIRED', 'Sign in to read your environment.');
    return { ...scope, lane: scope.lane === 'sandbox' ? 'sandbox' : 'live' };
  }
  function current(scope) { if (scopeKey(context()) !== scopeKey(scope)) throw failure('SCOPE_CHANGED', 'The account, environment or lane changed. Ask again in the environment now open.'); }
  async function call(scope, path, options = {}) {
    current(scope);
    const url = new URL(`${String(apiBase).replace(/\/$/, '')}/${path}`);
    if (scope.tenant) url.searchParams.set('tenant', scope.tenant);
    if (scope.lane === 'sandbox') url.searchParams.set('lane', 'sandbox');
    if (path.startsWith('environment/data/')) { url.searchParams.set('values', '1'); url.searchParams.set('limit', '50'); }
    if ((options.method || 'GET') === 'GET') url.searchParams.set('_', String(Date.now()));
    const result = await request(url.toString(), options);
    current(scope);
    return result;
  }
  async function readAt(scope, resource) {
    if (!Object.hasOwn(READS, resource)) throw failure('UNKNOWN_ACTION', 'That read is not available to Quark.');
    // Setup is the account's live environment checklist, not a sandbox readiness proof.
    if (resource === 'setup' && scope.lane === 'sandbox') throw failure('LIVE_SETUP_ONLY', 'The account setup checklist describes the live environment. Open the live environment to check it.');
    return projectRead(resource, await call(scope, READS[resource]));
  }
  async function supplierAction(action, id, supplierOrderId = '') {
    if (!['check', 'sync', 'tracking'].includes(action)) throw failure('HUMAN_REVIEW_REQUIRED', 'Quark does not place orders, make payments, send approval emails or approve another company’s access. Open the existing review flow.');
    const scope = snapshot(), key = `${scopeKey(scope)}|${action}|${id}`;
    if (active.has(key)) throw failure('ACTION_PENDING', 'That request is already running.');
    active.add(key);
    try {
      const list = await readAt(scope, 'connections');
      const connection = (list.connections || []).find(row => row.id === id && row.provider === 'shopify' && row.detail?.managed === 'shopify-supplier');
      if (!connection) throw failure('CONNECTION_CHANGED', 'That Shopify supplier is not in the current environment and lane.');
      if (action !== 'check' && connection.status !== 'ACTIVE') throw failure('NOT_CONNECTED', 'This supplier must approve the relationship before it can be used.');
      if (action === 'tracking' && !/^gid:\/\/shopify\/Order\/\d+$/.test(supplierOrderId)) throw failure('ORDER_REQUIRED', 'Choose a saved Shopify supplier order before checking tracking.');
      const path = action === 'check' ? 'refresh' : action === 'sync' ? 'sync' : 'order-status';
      const body = { id, ...(scope.tenant ? { tenant: scope.tenant } : {}), ...(scope.lane === 'sandbox' ? { lane: 'sandbox' } : {}), ...(action === 'tracking' ? { supplierOrderId } : {}) };
      const result = await call(scope, `environment/connections/shopify/${path}`, { method: 'POST', body: JSON.stringify(body) });
      if (!result || typeof result !== 'object' || result.ok === false) throw failure('UNCONFIRMED_RESULT', 'The supplier action returned no confirmed result. Check Connected accounts before trying again.');
      if (action === 'check') {
        if (!result.connection || result.connection.id !== id) throw failure('UNCONFIRMED_RESULT', 'The supplier check returned no matching connection.');
        return { connection: publicConnection(result.connection) };
      }
      if (action === 'sync') {
        if (!['written','removed','total'].every(key => Number.isSafeInteger(result[key]) && result[key] >= 0)) throw failure('UNCONFIRMED_RESULT', 'The supplier sync returned no confirmed counts. Check the supplier data before trying again.');
        return { written: result.written, removed: result.removed, total: result.total, capped: !!result.capped };
      }
      if (result.order?.supplierOrderId !== supplierOrderId) throw failure('UNCONFIRMED_RESULT', 'The tracking response did not match the selected supplier order.');
      return { order: projectRead('orders', { rows: [{ value: result.order }] }).rows[0].value };
    } finally { active.delete(key); }
  }
  return Object.freeze({ read: resource => readAt(snapshot(), resource), supplierAction, scope: snapshot });
}
