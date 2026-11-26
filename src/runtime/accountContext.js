// Navigation preferences only. The target API still verifies every membership and work area.
export const TEAM_KEY = 'pragoptics_team_id';
export const WORK_AREA_KEY = 'pragoptics_env_lane';
export function accountSelection(storage) {
  try {
    const team = storage?.getItem(TEAM_KEY) || 'own';
    return { team: /^[A-Za-z0-9_-]{1,64}$/.test(team) ? team : 'own', workLane: storage?.getItem(WORK_AREA_KEY) === 'sandbox' ? 'sandbox' : 'live' };
  } catch { return { team: 'own', workLane: 'live' }; }
}
export function captureAccountSelection(params, storage) {
  let changed = false;
  const team = params.get('team'), area = params.get('workLane');
  if (team !== null && /^[A-Za-z0-9_-]{1,64}$/.test(team)) {
    if (team === 'own') storage.removeItem(TEAM_KEY); else storage.setItem(TEAM_KEY, team);
    params.delete('team'); changed = true;
  }
  if (['live', 'sandbox'].includes(area)) {
    storage.setItem(WORK_AREA_KEY, area); params.delete('workLane'); changed = true;
  }
  return changed;
}
