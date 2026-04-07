export function logout() {
  sessionStorage.clear();
  localStorage.clear();

  // Return user to PragOptics in a signed-out state
  window.location.replace('/');
}