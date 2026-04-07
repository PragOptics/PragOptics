// setToleranceByClass.js
const CLASS_TOL = {
  DEFAULT: 2.0,
  CE: 1.0,
  QCE: 0.5,
  SCE: 0.25,
  ECE: 0.1
};

export function setToleranceByClass(toleranceEl, cls){
  if (!toleranceEl) return;

  const key = (cls || '').toString().trim().toUpperCase();
  const tol = (key && CLASS_TOL[key] != null)
    ? CLASS_TOL[key]
    : CLASS_TOL.DEFAULT;

  toleranceEl.value = tol.toFixed(2);
}