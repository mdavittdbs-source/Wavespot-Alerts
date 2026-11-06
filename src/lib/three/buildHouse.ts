import * as THREE from "three";
import type { Floor, FloorPlan, Point } from "@/lib/plan/schema";
import { planBounds, polygonCentroid, wallLengthFeet, wallSegments } from "@/lib/plan/geometry";
import { TILE_FEET, floorTexture, grassTexture, roofTexture, wallTexture } from "./textures";

export const SLAB = 0.8; // ft between stories
export const EYE_HEIGHT = 5.5;

export type BuildOptions = {
  showRoof: boolean;
  showCeilings: boolean;
  showLabels: boolean;
  showGround: boolean;
  /** floor ids to render; empty = all */
  floors?: string[];
};

export type CollisionSeg = { a: THREE.Vector2; b: THREE.Vector2 };

export type BuiltHouse = {
  group: THREE.Group;
  /** per floor id: base elevation in feet and blocking wall segments in world XZ feet */
  floors: Record<string, { base: number; ceiling: number; segs: CollisionSeg[]; spawn: THREE.Vector3; bounds: { min: Point; max: Point } }>;
  toWorld: (p: Point) => THREE.Vector2;
  size: { w: number; d: number };
};

export function floorBase(plan: FloorPlan, floor: Floor) {
  const sorted = [...plan.floors].sort((a, b) => a.level - b.level);
  let base = 0;
  for (const f of sorted) {
    if (f.id === floor.id) return base;
    base += f.ceilingHeight + SLAB;
  }
  return base;
}

export function buildHouse(plan: FloorPlan, opts: BuildOptions): BuiltHouse {
  const group = new THREE.Group();
  const ppf = plan.pixelsPerFoot;
  const b = planBounds(plan);
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
  const toWorld = (p: Point) => new THREE.Vector2((p.x - cx) / ppf, (p.y - cy) / ppf);
  const size = { w: (b.max.x - b.min.x) / ppf, d: (b.max.y - b.min.y) / ppf };

  const interiorMat = new THREE.MeshStandardMaterial({ map: wallTexture(plan.style.wallColor), roughness: 0.9 });
  const exteriorMat = new THREE.MeshStandardMaterial({ map: wallTexture(plan.style.exteriorColor), roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: plan.style.trimColor, roughness: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 1, side: THREE.DoubleSide });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 1 });

  const result: BuiltHouse["floors"] = {};
  const visible = new Set(opts.floors && opts.floors.length ? opts.floors : plan.floors.map((f) => f.id));
  const sortedFloors = [...plan.floors].sort((a, b) => a.level - b.level);

  for (const floor of sortedFloors) {
    const base = floorBase(plan, floor);
    const H = floor.ceilingHeight;
    const fg = new THREE.Group();
    fg.name = `floor:${floor.id}`;
    fg.visible = visible.has(floor.id);
    const segs: CollisionSeg[] = [];

    // --- walls
    for (const wall of floor.walls) {
      const a = toWorld(wall.start), bb = toWorld(wall.end);
      const L = wallLengthFeet(plan, wall);
      if (L < 0.05) continue;
      const dir = bb.clone().sub(a).normalize();
      const angle = -Math.atan2(dir.y, dir.x);
      const { segments, openings } = wallSegments(plan, floor, wall);
      const mat = wall.exterior ? exteriorMat : interiorMat;
      for (const s of segments) {
        const len = s.to - s.from, h = s.top - s.bottom;
        const geo = new THREE.BoxGeometry(len, h, wall.thickness);
        const mesh = new THREE.Mesh(geo, mat);
        const mid = a.clone().add(dir.clone().multiplyScalar((s.from + s.to) / 2));
        mesh.position.set(mid.x, base + s.bottom + h / 2, mid.y);
        mesh.rotation.y = angle;
        mesh.castShadow = mesh.receiveShadow = true;
        fg.add(mesh);
      }
      // collision: solid wall between door/opening spans (windows still block)
      let cursor = 0;
      const passable = openings.filter((o) => o.type !== "window").sort((x, y) => x.from - y.from);
      const pushSeg = (f0: number, f1: number) => {
        if (f1 - f0 < 0.05) return;
        segs.push({ a: a.clone().add(dir.clone().multiplyScalar(f0)), b: a.clone().add(dir.clone().multiplyScalar(f1)) });
      };
      for (const o of passable) { pushSeg(cursor, o.from); cursor = Math.max(cursor, o.to); }
      pushSeg(cursor, L);

      // frames, glass, door leaves
      for (const o of openings) {
        const c = a.clone().add(dir.clone().multiplyScalar((o.from + o.to) / 2));
        const w = o.to - o.from;
        const t = wall.thickness;
        const frameT = 0.15;
        const holder = new THREE.Group();
        holder.position.set(c.x, base, c.y);
        holder.rotation.y = angle;
        // jambs
        for (const side of [-1, 1]) {
          const jamb = new THREE.Mesh(new THREE.BoxGeometry(frameT, o.height, t + 0.08), trimMat);
          jamb.position.set((side * (w - frameT)) / 2, o.sill + o.height / 2, 0);
          holder.add(jamb);
        }
        const head = new THREE.Mesh(new THREE.BoxGeometry(w, frameT, t + 0.08), trimMat);
        head.position.set(0, o.sill + o.height - frameT / 2, 0);
        holder.add(head);
        if (o.type === "window") {
          const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, frameT, t + 0.25), trimMat);
          sill.position.set(0, o.sill + frameT / 2, 0);
          holder.add(sill);
          const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - frameT * 2, o.height - frameT * 2), glassMat);
          glass.position.set(0, o.sill + o.height / 2, 0);
          holder.add(glass);
          // mullion
          const mull = new THREE.Mesh(new THREE.BoxGeometry(0.08, o.height - frameT * 2, 0.06), trimMat);
          mull.position.set(0, o.sill + o.height / 2, 0);
          holder.add(mull);
        } else if (o.type === "door") {
          // door leaf, hinged open 70 degrees
          const leafW = Math.min(w - frameT * 2, 3.2);
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, o.height - frameT - 0.05, 0.12), doorMat);
          const pivot = new THREE.Group();
          pivot.position.set(-(w / 2 - frameT), 0, 0);
          leaf.position.set(leafW / 2, (o.height - frameT) / 2, 0);
          pivot.add(leaf);
          pivot.rotation.y = wall.exterior ? 0 : -THREE.MathUtils.degToRad(70);
          holder.add(pivot);
          if (w > 3.4) { // double door: second leaf
            const pivot2 = new THREE.Group();
            pivot2.position.set(w / 2 - frameT, 0, 0);
            const leaf2 = leaf.clone();
            leaf2.position.set(-leafW / 2, (o.height - frameT) / 2, 0);
            pivot2.add(leaf2);
            pivot2.rotation.y = wall.exterior ? 0 : THREE.MathUtils.degToRad(70);
            holder.add(pivot2);
          }
        }
        fg.add(holder);
      }
    }

    // --- floors + ceilings per room
    const roomShapes: THREE.Shape[] = [];
    for (const room of floor.rooms) {
      const pts = room.polygon.map(toWorld);
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
      roomShapes.push(shape);
      const geo = new THREE.ShapeGeometry(shape);
      // UVs in feet so textures tile at TILE_FEET
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / TILE_FEET, pos.getY(i) / TILE_FEET);
      uv.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({ map: floorTexture(room.floorMaterial), roughness: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = base + 0.01;
      mesh.receiveShadow = true;
      mesh.name = `room:${room.id}`;
      fg.add(mesh);

      if (opts.showCeilings) {
        const cgeo = new THREE.ShapeGeometry(shape);
        const cmesh = new THREE.Mesh(cgeo, ceilingMat);
        cmesh.rotation.x = -Math.PI / 2;
        cmesh.position.y = base + H - 0.01;
        cmesh.name = "ceiling";
        fg.add(cmesh);
      }

      if (opts.showLabels) {
        const c = toWorld(polygonCentroid(room.polygon));
        const sprite = makeLabel(room.name);
        sprite.position.set(c.x, base + 7.2, c.y);
        sprite.name = "label";
        fg.add(sprite);
      }
    }

    // --- slab under the whole floor
    const fb = floorBoundsWorld(floor, toWorld);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(fb.w + 0.5, SLAB, fb.d + 0.5), slabMat);
    slab.position.set(fb.cx, base - SLAB / 2, fb.cz);
    slab.receiveShadow = true;
    fg.add(slab);
    if (floor.rooms.length === 0) {
      // fallback floor when the extractor found no rooms
      const geo = new THREE.PlaneGeometry(fb.w, fb.d);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: floorTexture("wood") }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(fb.cx, base + 0.01, fb.cz);
      fg.add(mesh);
    }

    group.add(fg);

    // spawn: centroid of the largest room, else bounds center
    let spawn = new THREE.Vector3(fb.cx, base + EYE_HEIGHT, fb.cz);
    if (floor.rooms.length) {
      const biggest = [...floor.rooms].sort((r1, r2) => areaOf(r2.polygon) - areaOf(r1.polygon))[0];
      const c = toWorld(polygonCentroid(biggest.polygon));
      spawn = new THREE.Vector3(c.x, base + EYE_HEIGHT, c.y);
    }
    result[floor.id] = { base, ceiling: H, segs, spawn, bounds: { min: toWorldPoint(toWorld, b.min), max: toWorldPoint(toWorld, b.max) } };
  }

  // --- roof over the top floor
  const top = sortedFloors[sortedFloors.length - 1];
  if (opts.showRoof && plan.roof !== "none" && top) {
    const topBase = floorBase(plan, top) + top.ceilingHeight;
    const fb = floorBoundsWorld(top, toWorld);
    const roof = buildRoof(plan.roof, fb.w, fb.d, plan.style.roofColor, trimMat);
    roof.position.set(fb.cx, topBase, fb.cz);
    roof.name = "roof";
    roof.visible = visible.has(top.id);
    group.add(roof);
  }

  // --- ground
  if (opts.showGround) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
    (g.material as THREE.MeshStandardMaterial).map!.repeat.set(60, 60);
    g.rotation.x = -Math.PI / 2;
    g.position.y = -SLAB;
    g.receiveShadow = true;
    g.name = "ground";
    group.add(g);
  }

  return { group, floors: result, toWorld, size };
}

function areaOf(poly: Point[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

function toWorldPoint(toWorld: (p: Point) => THREE.Vector2, p: Point): Point {
  const v = toWorld(p); return { x: v.x, y: v.y };
}

function floorBoundsWorld(floor: Floor, toWorld: (p: Point) => THREE.Vector2) {
  const pts: THREE.Vector2[] = [];
  for (const w of floor.walls) pts.push(toWorld(w.start), toWorld(w.end));
  for (const r of floor.rooms) for (const p of r.polygon) pts.push(toWorld(p));
  if (!pts.length) return { w: 20, d: 20, cx: 0, cz: 0 };
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minZ = Math.min(...pts.map((p) => p.y)), maxZ = Math.max(...pts.map((p) => p.y));
  return { w: maxX - minX, d: maxZ - minZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

function buildRoof(style: FloorPlan["roof"], w: number, d: number, color: string, trimMat: THREE.Material) {
  const g = new THREE.Group();
  const overhang = 1.5;
  const W = w + overhang * 2, D = d + overhang * 2;
  const pitch = 6 / 12;
  const mat = new THREE.MeshStandardMaterial({ map: roofTexture(color), roughness: 0.95, side: THREE.DoubleSide });
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, D), trimMat);
  fascia.position.y = 0.3;
  g.add(fascia);

  if (style === "flat") {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), mat);
    slab.position.y = 0.8;
    g.add(slab);
    return g;
  }
  // ridge runs along the longer axis
  const alongX = W >= D;
  const span = alongX ? D : W;      // across the ridge
  const length = alongX ? W : D;    // along the ridge
  const rise = (span / 2) * pitch;
  const geo = new THREE.BufferGeometry();
  const verts: number[] = [];
  const uvs: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => { verts.push(...a, ...b, ...c); uvs.push(0, 0, 1, 0, 1, 1); };
  const y0 = 0.6;
  const hipInset = style === "hip" ? Math.min(span / 2, length / 2 - 0.5) : 0;
  // corners in local (u along ridge, v across)
  const L = length / 2, S = span / 2;
  const r1 = [-L + hipInset, y0 + rise, 0], r2 = [L - hipInset, y0 + rise, 0];
  const c1 = [-L, y0, -S], c2 = [L, y0, -S], c3 = [L, y0, S], c4 = [-L, y0, S];
  // two main slopes
  tri(c1, c2, r2); tri(c1, r2, r1);
  tri(c3, c4, r1); tri(c3, r1, r2);
  if (style === "hip") {
    tri(c2, c3, r2); tri(c4, c1, r1);
  } else {
    // gable end walls
    const endMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c5, roughness: 0.95, side: THREE.DoubleSide });
    const endGeo = new THREE.BufferGeometry();
    const ev: number[] = [];
    ev.push(...c2, ...c3, ...r2, ...c4, ...c1, ...r1);
    endGeo.setAttribute("position", new THREE.Float32BufferAttribute(ev, 3));
    endGeo.computeVertexNormals();
    const ends = new THREE.Mesh(endGeo, endMat);
    g.add(ends);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  // uv scaled in feet
  const uvScaled: number[] = [];
  for (let i = 0; i < verts.length; i += 3) uvScaled.push(verts[i] / 4, verts[i + 2] / 4);
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvScaled, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  g.add(mesh);
  if (!alongX) { g.rotation.y = Math.PI / 2; }
  return g;
}

function makeLabel(text: string) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = "600 44px system-ui, sans-serif";
  const w = Math.ceil(ctx.measureText(text).width) + 48;
  c.width = w; c.height = 80;
  ctx.font = "600 44px system-ui, sans-serif";
  ctx.fillStyle = "rgba(10,12,18,0.75)";
  roundRect(ctx, 0, 0, w, 80, 20); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
  ctx.fillText(text, 24, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set((w / 80) * 1.4, 1.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
