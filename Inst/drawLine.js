export function drawLine(ctx, series, xScale, yScale){
    let started = false;
    for (let i=0;i<points.length;i++){
      const v = series[i];
      if (v == null || Number.isNaN(v)) { started = false; continue; }
      const x = xScale(points[i]);
      const y = yScale(v);
      if (!started){
        ctx.beginPath();
        ctx.moveTo(x,y);
        started = true;
      } else {
        ctx.lineTo(x,y);
      }
    }
    if (started) ctx.stroke();
  }
