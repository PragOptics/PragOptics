// Display transport only. Interpretation and workflow execution live on the server.
export function scopeKey(scope = {}) {
  return JSON.stringify([scope.userId || '', scope.tenant || '', scope.lane === 'sandbox' ? 'sandbox' : 'live',scope.audience||'customer']);
}
function changed() { return Object.assign(new Error('The account or environment changed. Ask Quark again.'), { code: 'SCOPE_CHANGED' }); }
export function createQuarkClient({ context, send, refresh }) {
  const running = new Set();
  return {
    async request(input) {
      if (!input || Object.keys(input).some(key => !['text','ticket'].includes(key)) || (!!input.text === !!input.ticket)) throw new Error('Provide a message or Quark control.');
      const scope = context(), key = scopeKey(scope);
      if (!scope.userId) throw new Error('Sign in to use Quark.');
      const pending = input.ticket ? key + '|' + input.ticket : '';
      if (pending && running.has(pending)) throw Object.assign(new Error('That request is already running.'), { code:'ACTION_PENDING' });
      if (pending) running.add(pending);
      try {
        const result = await send({ ...input, tenant: scope.tenant || '', lane: scope.lane === 'sandbox' ? 'sandbox' : 'live',audience:scope.audience||'customer' });
        if (scopeKey(context()) !== key) throw changed();
        if (!result || result.ok !== true || typeof result.html !== 'string' || result.html.length > 250000) throw new Error('Quark returned no confirmed reply.');
        if (result.refresh === 'connections' && typeof refresh === 'function') { try { await refresh(result.refresh); } catch { /* The confirmed operation remains confirmed if its view cannot refresh. */ } }
        if (scopeKey(context()) !== key) throw changed();
        return result;
      } catch (error) {
        if (scopeKey(context()) !== key) throw changed();
        if ([404,405,410].includes(error?.status)) throw new Error('Quark’s private service has not been deployed on this platform yet.');
        throw error;
      } finally { if (pending) running.delete(pending); }
    }
  };
}
