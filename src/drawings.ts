import type { Drawing } from "./types";
export function drawingSvg(d: Drawing): string {
  if (d.type === "rectangle")
    return `<rect x="${d.x * 1000}" y="${d.y * 1000}" width="${d.width * 1000}" height="${d.height * 1000}" rx="2"/>`;
  if (d.type === "arrow") {
    const x = d.to.x * 1000,
      y = d.to.y * 1000,
      angle = Math.atan2(d.to.y - d.from.y, d.to.x - d.from.x);
    const head = [0.45, -0.45].map(
      (a) => `${x - 22 * Math.cos(angle + a)},${y - 22 * Math.sin(angle + a)}`,
    );
    return `<path d="M${d.from.x * 1000},${d.from.y * 1000} L${x},${y} M${head[0]} L${x},${y} L${head[1]}"/>`;
  }
  return `<polyline points="${d.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}"/>`;
}
export function paintDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  w: number,
  h: number,
): void {
  ctx.strokeStyle = "#ff2020";
  ctx.lineWidth = Math.max(6, Math.max(w, h) / 150);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  if (d.type === "rectangle")
    ctx.rect(d.x * w, d.y * h, d.width * w, d.height * h);
  else if (d.type === "freehand")
    d.points.forEach((p, i) =>
      i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h),
    );
  else {
    const x = d.to.x * w,
      y = d.to.y * h,
      angle = Math.atan2((d.to.y - d.from.y) * h, (d.to.x - d.from.x) * w);
    ctx.moveTo(d.from.x * w, d.from.y * h);
    ctx.lineTo(x, y);
    for (const a of [-0.45, 0.45]) {
      ctx.moveTo(x, y);
      ctx.lineTo(x - 20 * Math.cos(angle + a), y - 20 * Math.sin(angle + a));
    }
  }
  ctx.stroke();
}
