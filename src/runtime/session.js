export function logout() {
  sessionStorage.clear();
  localStorage.clear();

  window.location.href =
    'https://pragoptics.ciamlogin.com/pragoptics.onmicrosoft.com/oauth2/v2.0/logout' +
    '?client_id=20a95281-4569-40f2-9b1d-74d5d5e03ca5' +
    '&logout_hint=signedout' +
    '&post_logout_redirect_uri=' +
    encodeURIComponent('https://pragoptics.com/logout-complete');
}