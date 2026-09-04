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

  // Star colour follows the theme: white on the galactic-dark ground, dark
  // indigo specks on the daylight-nebula light ground (a canvas cannot be
  // recoloured by CSS). The inline no-flash script in index.html has already
  // stamped data-theme before this runs, and theme.js announces every later
  // switch; because the draw loop reads this each frame, a change shows up
  // immediately with no forced redraw.
  const isLight = () => document.documentElement.getAttribute("data-theme") === "light";
  let starRGB = isLight() ? "27,35,64" : "255,255,255";
  addEventListener("pragoptics:themechange", () => {
    starRGB = isLight() ? "27,35,64" : "255,255,255";
  });

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const s of stars) {
      s.alpha += s.delta;
      if (s.alpha <= 0 || s.alpha >= 1) s.delta = -s.delta;

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${starRGB},${s.alpha})`;
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  animate();
}