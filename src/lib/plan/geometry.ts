import type { Floor, FloorPlan, Opening, Point, Wall } from "./schema";

export const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function wallLengthFeet(plan: FloorPlan, w: Wall) {
  return dist(w.start, w.end) / plan.pixelsPerFoot;
}

export function wallAngle(w: Wall) {
  return Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
}

/** Closest point parameter t on segment ab for point p */
export function projectT(a: Point, b: Point, p: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
}

export function pointSegDist(a: Point, b: Point, p: Point) {
  const t = projectT(a, b, p);
  return dist(lerp(a, b, t), p);
}

export function floorBounds(floor: Floor): { min: Point; max: Point } {
  const pts: Point[] = [];
  for (const w of floor.walls) pts.push(w.start, w.end);
  for (const r of floor.rooms) pts.push(...r.polygon);
  if (pts.length === 0) return { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };
  const min = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
  const max = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
  return { min, max };
}

export function planBounds(plan: FloorPlan) {
  const bs = plan.floors.map(floorBounds);
  return {
    min: { x: Math.min(...bs.map((b) => b.min.x)), y: Math.min(...bs.map((b) => b.min.y)) },
    max: { x: Math.max(...bs.map((b) => b.max.x)), y: Math.max(...bs.map((b) => b.max.y)) },
  };
}

export function polygonArea(poly: Point[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(poly: Point[]): Point {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}

export function roomAreaSqFt(plan: FloorPlan, poly: Point[]) {
  return polygonArea(poly) / (plan.pixelsPerFoot * plan.pixelsPerFoot);
}

/**
 * Split a wall into solid pieces around its openings.
 * Returns segments in wall-local coordinates: [fromFeet, toFeet, bottomFeet, topFeet]
 */
export function wallSegments(plan: FloorPlan, floor: Floor, wall: Wall) {
  const L = wallLengthFeet(plan, wall);
  const H = floor.ceilingHeight;
  const ops = floor.openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({
      ...o,
      from: Math.max(0, o.t * L - o.width / 2),
      to: Math.min(L, o.t * L + o.width / 2),
    }))
    .sort((a, b) => a.from - b.from);

  const segs: Array<{ from: number; to: number; bottom: number; top: number }> = [];
  let cursor = 0;
  for (const o of ops) {
    if (o.from > cursor) segs.push({ from: cursor, to: o.from, bottom: 0, top: H });
    const top = Math.min(H, o.sill + o.height);
    // lintel above
    if (top < H) segs.push({ from: o.from, to: o.to, bottom: top, top: H });
    // sill below (windows)
    if (o.sill > 0) segs.push({ from: o.from, to: o.to, bottom: 0, top: o.sill });
    cursor = Math.max(cursor, o.to);
  }
  if (cursor < L) segs.push({ from: cursor, to: L, bottom: 0, top: H });
  return { segments: segs.filter((s) => s.to - s.from > 0.01 && s.top - s.bottom > 0.01), openings: ops, length: L };
}

export function openingWorld(plan: FloorPlan, wall: Wall, o: Opening) {
  const c = lerp(wall.start, wall.end, o.t);
  return { center: c, angle: wallAngle(wall), widthPx: o.width * plan.pixelsPerFoot };
}

/** Ensure walls that nearly touch are snapped together (cleans up extraction noise). */
export function snapWalls(floor: Floor, tolerancePx: number): Floor {
  const walls = floor.walls.map((w) => ({ ...w, start: { ...w.start }, end: { ...w.end } }));
  const endpoints: Point[] = [];
  for (const w of walls) endpoints.push(w.start, w.end);
  for (const p of endpoints) {
    for (const q of endpoints) {
      if (p === q) continue;
      if (dist(p, q) > 0 && dist(p, q) <= tolerancePx) {
        q.x = p.x; q.y = p.y;
      }
    }
  }
  return { ...floor, walls };
}

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
