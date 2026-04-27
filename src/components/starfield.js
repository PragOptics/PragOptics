// src/components/starfield.js

export function initStarfield({ canvasId = "bg-stars", starCount = 160 } = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }

  resize();
  addEventListener("resize", resize);

  const stars = Array.from({ length: starCount }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.2 + 0.4,
    alpha: Math.random(),
    delta: Math.random() * 0.015 + 0.005
  }));

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const s of stars) {
      s.alpha += s.delta;
      if (s.alpha <= 0 || s.alpha >= 1) s.delta = -s.delta;

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  animate();
}