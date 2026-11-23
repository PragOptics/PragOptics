// Inert compatibility exports for cached clients. No interpreter is shipped here.
const unavailable = () => { throw new Error('Quark now runs through the private service. Reload the platform.'); };
export const FAMILIES = Object.freeze({});
export const capabilityFamilies = () => [];
export const findCapabilities = () => [];
export const capabilityDestination = () => null;
export const setupView = () => null;
export const isLaunchRequest = () => false;
export const quarkRequestAllowed = () => false;
export const createPlatformGuide = unavailable;
export { scopeKey } from './quarkClient.js';
