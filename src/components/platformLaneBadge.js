// Routing context only. API authentication and dev admission remain server-side.
export function signInTitle(mode, lane) {
  const title = mode === 'login' ? 'Sign in to PragOptics™' : mode === 'signup' ? 'Create your PragOptics™ account' : 'Reset your PragOptics™ password';
  return title + (lane === 'dev' ? ' — Dev' : '');
}
export function showDevelopmentIndicators(lane, doc = document) {
  const dev = lane === 'dev';
  for (const id of ['platformDevBadge', 'loginDevNotice']) {
    const element = doc.getElementById(id);
    if (element) element.hidden = !dev;
  }
}
