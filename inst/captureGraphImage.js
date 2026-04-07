export function captureGraphImage(){
  const canvas = document.getElementById('calGraphCanvas');
  if (!canvas) return null;
  return canvas.toDataURL('image/png', 1.0);
}