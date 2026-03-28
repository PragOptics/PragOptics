export function drawDotsXY(ctx, pts, xScale, yScale, color){
  ctx.fillStyle = color;
  for (const p of pts){
    const x = xScale(p.xPct);
    const y = yScale(p.y);
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fill();
  }
}