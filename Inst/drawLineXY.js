export function drawLineXY(ctx, pts, xScale, yScale){
  const r = pts.slice().sort((a,b)=>a.xPct-b.xPct);
  let started = false;
  for (const p of r){
    const x = xScale(p.xPct);
    const y = yScale(p.y);
    if (!started){ ctx.beginPath(); ctx.moveTo(x,y); started = true; }
    else ctx.lineTo(x,y);
  }
  if (started) ctx.stroke();
}