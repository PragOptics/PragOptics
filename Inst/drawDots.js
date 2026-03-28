export function drawDots(ctx, series, xScale, yScale, color){
    ctx.fillStyle = color;
    for (let i=0;i<points.length;i++){
      const v = series[i];
      if (v == null || Number.isNaN(v)) continue;
      const x = xScale(points[i]);
      const y = yScale(v);
      ctx.beginPath();
      ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fill();
    }
  }