// Inert compatibility exports keep old cached imports from breaking the app.
const message = 'Quark now runs through the private service. Reload the platform.';
export const escapeQuark = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const platformIndex = () => message;
export const capabilityDetails = () => message;
export const actualSetup = () => message;
export const supplierResult = () => message;
export const answerPlatform = async () => message;
