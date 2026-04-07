// equipFilterByRole.js
export function equipFilterByRole(equipLibrary, role){
  const rWanted = (role || '').toString().toLowerCase();

  return (equipLibrary || []).filter(e => {
    const r = (e?.role || e?.type || 'both').toString().toLowerCase();
    return r === 'both' || r === rWanted;
  });
}