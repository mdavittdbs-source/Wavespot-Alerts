"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Floor, FloorPlan, Opening, Point, Room, Wall } from "@/lib/plan/schema";
import { dist, floorBounds, lerp, newId, pointSegDist, polygonCentroid, projectT, roomAreaSqFt, wallAngle } from "@/lib/plan/geometry";

type Tool = "select" | "wall" | "door" | "window" | "opening" | "room" | "scale";
type Sel = { kind: "wall" | "opening" | "room"; id: string } | null;

type Props = {
  plan: FloorPlan;
  onChange: (plan: FloorPlan) => void;
  accent?: string;
};

const TOOLS: Array<{ id: Tool; label: string; key: string }> = [
  { id: "select", label: "Select", key: "V" },
  { id: "wall", label: "Wall", key: "L" },
  { id: "door", label: "Door", key: "D" },
  { id: "window", label: "Window", key: "N" },
  { id: "opening", label: "Opening", key: "O" },
  { id: "room", label: "Room", key: "R" },
  { id: "scale", label: "Set scale", key: "K" },
];

export default function PlanEditor({ plan, onChange, accent = "#f59e0b" }: Props) {
  const [floorIdx, setFloorIdx] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<Sel>(null);
  const [draft, setDraft] = useState<Point[]>([]); // in-progress wall/room/scale points
  const [cursor, setCursor] = useState<Point | null>(null);
  const [scaleFeet, setScaleFeet] = useState("10");
  const [view, setView] = useState({ x: 0, y: 0, k: 1 }); // pan/zoom
  const [showImage, setShowImage] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const history = useRef<FloorPlan[]>([]);
  const drag = useRef<null | { kind: "pan"; sx: number; sy: number; vx: number; vy: number } | { kind: "wallEnd"; id: string; end: "start" | "end" } | { kind: "opening"; id: string } | { kind: "vertex"; roomId: string; idx: number } | { kind: "wall"; id: string; last: Point }>(null);

  const floor = plan.floors[Math.min(floorIdx, plan.floors.length - 1)];
  const ppf = plan.pixelsPerFoot;

  const commit = useCallback((next: FloorPlan) => {
    history.current.push(plan);
    if (history.current.length > 60) history.current.shift();
    onChange(next);
  }, [plan, onChange]);

  const updateFloor = useCallback((patch: Partial<Floor> | ((f: Floor) => Floor)) => {
    const floors = plan.floors.map((f, i) => i === floorIdx ? (typeof patch === "function" ? patch(f) : { ...f, ...patch }) : f);
    commit({ ...plan, floors });
  }, [plan, floorIdx, commit]);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) onChange(prev);
  }, [onChange]);

  // --- viewBox: fit content
  const fit = useMemo(() => {
    const b = floor.imageWidth && floor.imageHeight
      ? { min: { x: 0, y: 0 }, max: { x: floor.imageWidth, y: floor.imageHeight } }
      : floorBounds(floor);
    const pad = 40;
    return { x: b.min.x - pad, y: b.min.y - pad, w: b.max.x - b.min.x + pad * 2, h: b.max.y - b.min.y + pad * 2 };
  }, [floor]);

  const viewBox = `${fit.x - view.x} ${fit.y - view.y} ${fit.w / view.k} ${fit.h / view.k}`;

  const toPlan = useCallback((e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // --- snapping
  const snap = useCallback((p: Point, ignoreWall?: string): Point => {
    const tol = 10 / view.k;
    let best: Point | null = null, bd = tol;
    for (const w of floor.walls) {
      if (w.id === ignoreWall) continue;
      for (const q of [w.start, w.end]) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
    }
    if (best) return { ...best };
    // snap onto a wall line
    for (const w of floor.walls) {
      if (w.id === ignoreWall) continue;
      if (pointSegDist(w.start, w.end, p) < tol) { const t = projectT(w.start, w.end, p); return lerp(w.start, w.end, t); }
    }
    return p;
  }, [floor, view.k]);

  const axisSnap = (from: Point, to: Point): Point => {
    const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
    if (dx === 0 && dy === 0) return to;
    const ang = Math.atan2(dy, dx);
    if (ang < 0.12) return { x: to.x, y: from.y };
    if (ang > Math.PI / 2 - 0.12) return { x: from.x, y: to.y };
    return to;
  };

  const wallAt = (p: Point): Wall | null => {
    let best: Wall | null = null, bd = 12 / view.k;
    for (const w of floor.walls) { const d = pointSegDist(w.start, w.end, p); if (d < bd) { bd = d; best = w; } }
    return best;
  };

  // --- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      if (e.key === "Escape") { setDraft([]); setTool("select"); setSel(null); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); deleteSel(); return; }
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) { setTool(t.id); setDraft([]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const deleteSel = () => {
    if (!sel) return;
    if (sel.kind === "wall") updateFloor((f) => ({ ...f, walls: f.walls.filter((w) => w.id !== sel.id), openings: f.openings.filter((o) => o.wallId !== sel.id) }));
    if (sel.kind === "opening") updateFloor((f) => ({ ...f, openings: f.openings.filter((o) => o.id !== sel.id) }));
    if (sel.kind === "room") updateFloor((f) => ({ ...f, rooms: f.rooms.filter((r) => r.id !== sel.id) }));
    setSel(null);
  };

  // --- pointer handlers on the SVG
  const onPointerDown = (e: React.PointerEvent) => {
    const raw = toPlan(e);
    if (e.button === 1 || (e.button === 0 && e.altKey) || (tool === "select" && e.button === 0 && !(e.target as Element).closest("[data-hit]"))) {
      // pan on background
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      if (tool === "select" && !(e.target as Element).closest("[data-hit]")) setSel(null);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (tool === "wall") {
      const p = draft.length ? axisSnap(draft[0], snap(raw)) : snap(raw);
      if (draft.length === 0) setDraft([p]);
      else {
        if (dist(draft[0], p) > 2) {
          const w: Wall = { id: newId("w"), start: draft[0], end: p, thickness: 0.45, exterior: false };
          updateFloor((f) => ({ ...f, walls: [...f.walls, w] }));
        }
        setDraft(e.shiftKey ? [p] : []); // shift: chain walls
      }
      return;
    }
    if (tool === "door" || tool === "window" || tool === "opening") {
      const w = wallAt(raw);
      if (!w) return;
      const t = projectT(w.start, w.end, raw);
      const o: Opening = tool === "door"
        ? { id: newId("o"), wallId: w.id, type: "door", t, width: 3, height: 6.8, sill: 0 }
        : tool === "window"
          ? { id: newId("o"), wallId: w.id, type: "window", t, width: 4, height: 4, sill: 3 }
          : { id: newId("o"), wallId: w.id, type: "opening", t, width: 5, height: 8, sill: 0 };
      updateFloor((f) => ({ ...f, openings: [...f.openings, o] }));
      setSel({ kind: "opening", id: o.id });
      setTool("select");
      return;
    }
    if (tool === "room") {
      const p = snap(raw);
      if (draft.length >= 3 && dist(p, draft[0]) < 12 / view.k) {
        const r: Room = { id: newId("r"), name: `Room ${floor.rooms.length + 1}`, polygon: draft, floorMaterial: "wood" };
        updateFloor((f) => ({ ...f, rooms: [...f.rooms, r] }));
        setSel({ kind: "room", id: r.id });
        setDraft([]); setTool("select");
      } else setDraft([...draft, p]);
      return;
    }
    if (tool === "scale") {
      const p = snap(raw);
      if (draft.length === 0) setDraft([p]);
      else { setDraft([draft[0], p]); }
      return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toPlan(e);
    setCursor(p);
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      const svg = svgRef.current!;
      const scale = (fit.w / view.k) / svg.clientWidth;
      setView({ ...view, x: d.vx + (e.clientX - d.sx) * scale, y: d.vy + (e.clientY - d.sy) * scale });
      return;
    }
    if (d.kind === "wallEnd") {
      const w = floor.walls.find((x) => x.id === d.id)!;
      const other = d.end === "start" ? w.end : w.start;
      const np = e.shiftKey ? snap(p, d.id) : axisSnap(other, snap(p, d.id));
      onChange({ ...plan, floors: plan.floors.map((f, i) => i === floorIdx ? { ...f, walls: f.walls.map((x) => x.id === d.id ? { ...x, [d.end]: np } : x) } : f) });
      return;
    }
    if (d.kind === "wall") {
      const dx = p.x - d.last.x, dy = p.y - d.last.y;
      d.last = p;
      onChange({ ...plan, floors: plan.floors.map((f, i) => i === floorIdx ? { ...f, walls: f.walls.map((x) => x.id === d.id ? { ...x, start: { x: x.start.x + dx, y: x.start.y + dy }, end: { x: x.end.x + dx, y: x.end.y + dy } } : x) } : f) });
      return;
    }
    if (d.kind === "opening") {
      const o = floor.openings.find((x) => x.id === d.id)!;
      const w = floor.walls.find((x) => x.id === o.wallId)!;
      const t = projectT(w.start, w.end, p);
      onChange({ ...plan, floors: plan.floors.map((f, i) => i === floorIdx ? { ...f, openings: f.openings.map((x) => x.id === d.id ? { ...x, t } : x) } : f) });
      return;
    }
    if (d.kind === "vertex") {
      const np = snap(p);
      onChange({ ...plan, floors: plan.floors.map((f, i) => i === floorIdx ? { ...f, rooms: f.rooms.map((r) => r.id === d.roomId ? { ...r, polygon: r.polygon.map((v, k) => k === d.idx ? np : v) } : r) } : f) });
    }
  };

  const onPointerUp = () => {
    if (drag.current && drag.current.kind !== "pan") history.current.push(plan);
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const k = Math.min(8, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    setView({ ...view, k });
  };

  const startDrag = (e: React.PointerEvent, d: NonNullable<typeof drag.current>) => {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    drag.current = d;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  // --- selection helpers
  const selWall = sel?.kind === "wall" ? floor.walls.find((w) => w.id === sel.id) : undefined;
  const selOpening = sel?.kind === "opening" ? floor.openings.find((o) => o.id === sel.id) : undefined;
  const selRoom = sel?.kind === "room" ? floor.rooms.find((r) => r.id === sel.id) : undefined;

  const patchWall = (patch: Partial<Wall>) => selWall && updateFloor((f) => ({ ...f, walls: f.walls.map((w) => w.id === selWall.id ? { ...w, ...patch } : w) }));
  const patchOpening = (patch: Partial<Opening>) => selOpening && updateFloor((f) => ({ ...f, openings: f.openings.map((o) => o.id === selOpening.id ? { ...o, ...patch } : o) }));
  const patchRoom = (patch: Partial<Room>) => selRoom && updateFloor((f) => ({ ...f, rooms: f.rooms.map((r) => r.id === selRoom.id ? { ...r, ...patch } : r) }));

  const applyScale = () => {
    if (draft.length !== 2) return;
    const feet = parseFloat(scaleFeet);
    if (!feet || feet <= 0) return;
    const px = dist(draft[0], draft[1]);
    commit({ ...plan, pixelsPerFoot: px / feet, scaleNote: `Set manually: ${feet} ft = ${px.toFixed(0)} px` });
    setDraft([]); setTool("select");
  };

  const addFloor = () => {
    const level = Math.max(...plan.floors.map((f) => f.level)) + 1;
    const src = floor;
    // copy exterior walls so the new story has the same footprint
    const walls = src.walls.filter((w) => w.exterior).map((w) => ({ ...w, id: newId("w") }));
    const nf: Floor = { id: newId("f"), name: `Floor ${level + 1}`, level, ceilingHeight: 8, imageUrl: null, imageWidth: null, imageHeight: null, walls, openings: [], rooms: [] };
    commit({ ...plan, floors: [...plan.floors, nf] });
    setFloorIdx(plan.floors.length);
  };

  const removeFloor = () => {
    if (plan.floors.length <= 1) return;
    commit({ ...plan, floors: plan.floors.filter((_, i) => i !== floorIdx) });
    setFloorIdx(0); setSel(null);
  };

  const sqft = useMemo(() => floor.rooms.reduce((a, r) => a + roomAreaSqFt(plan, r.polygon), 0), [plan, floor]);
  const strokeW = (ft: number) => Math.max(2 / view.k, ft * ppf);

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-full">
      {/* canvas */}
      <div className="flex-1 card overflow-hidden flex flex-col min-h-[480px]">
        <div className="flex flex-wrap items-center gap-1 p-2 border-b" style={{ borderColor: "var(--line)" }}>
          {TOOLS.map((t) => (
            <button key={t.id} className={`btn !py-1 !px-2.5 ${tool === t.id ? "btn-primary" : "btn-ghost"}`} onClick={() => { setTool(t.id); setDraft([]); }} title={`Shortcut: ${t.key}`}>
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          {plan.floors.length > 1 && (
            <select className="input !w-auto !py-1" value={floorIdx} onChange={(e) => { setFloorIdx(Number(e.target.value)); setSel(null); }}>
              {plan.floors.map((f, i) => <option key={f.id} value={i}>{f.name}</option>)}
            </select>
          )}
          {floor.imageUrl && <label className="chip cursor-pointer gap-2"><input type="checkbox" checked={showImage} onChange={(e) => setShowImage(e.target.checked)} /> Blueprint</label>}
          <button className="btn btn-ghost !py-1 !px-2.5" onClick={() => setView({ x: 0, y: 0, k: 1 })}>Fit</button>
          <button className="btn btn-ghost !py-1 !px-2.5" onClick={undo} title="Ctrl+Z">Undo</button>
        </div>
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="flex-1 w-full touch-none"
          style={{ background: "#0e1117", cursor: tool === "select" ? "default" : "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
          {floor.imageUrl && showImage && floor.imageWidth && floor.imageHeight && (
            <image href={floor.imageUrl} x={0} y={0} width={floor.imageWidth} height={floor.imageHeight} opacity={0.55} preserveAspectRatio="none" />
          )}
          {/* grid every 5 ft */}
          <defs>
            <pattern id="grid" width={ppf * 5} height={ppf * 5} patternUnits="userSpaceOnUse">
              <path d={`M ${ppf * 5} 0 L 0 0 0 ${ppf * 5}`} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1 / view.k} />
            </pattern>
          </defs>
          <rect x={fit.x - 5000} y={fit.y - 5000} width={10000 + fit.w} height={10000 + fit.h} fill="url(#grid)" pointerEvents="none" />

          {/* rooms */}
          {floor.rooms.map((r) => {
            const c = polygonCentroid(r.polygon);
            const isSel = sel?.kind === "room" && sel.id === r.id;
            return (
              <g key={r.id}>
                <polygon data-hit points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")} fill={isSel ? accent : "#3b82f6"} fillOpacity={isSel ? 0.3 : 0.12} stroke={isSel ? accent : "#3b82f6"} strokeOpacity={0.5} strokeWidth={1.5 / view.k}
                  onPointerDown={(e) => { if (tool === "select") { e.stopPropagation(); setSel({ kind: "room", id: r.id }); } }} />
                <text x={c.x} y={c.y} fontSize={13 / view.k} fill="#e8eaf0" textAnchor="middle" pointerEvents="none" fontWeight={600}>{r.name}</text>
                <text x={c.x} y={c.y + 15 / view.k} fontSize={10 / view.k} fill="#9aa3b5" textAnchor="middle" pointerEvents="none">{roomAreaSqFt(plan, r.polygon).toFixed(0)} sq ft</text>
                {isSel && r.polygon.map((p, i) => (
                  <circle key={i} data-hit cx={p.x} cy={p.y} r={6 / view.k} fill={accent} stroke="#000" strokeWidth={1 / view.k} style={{ cursor: "move" }}
                    onPointerDown={(e) => startDrag(e, { kind: "vertex", roomId: r.id, idx: i })} />
                ))}
              </g>
            );
          })}

          {/* walls */}
          {floor.walls.map((w) => {
            const isSel = sel?.kind === "wall" && sel.id === w.id;
            return (
              <g key={w.id}>
                <line data-hit x1={w.start.x} y1={w.start.y} x2={w.end.x} y2={w.end.y}
                  stroke={isSel ? accent : w.exterior ? "#e8eaf0" : "#b9c0cf"} strokeWidth={strokeW(w.thickness)} strokeLinecap="butt"
                  style={{ cursor: tool === "select" ? "move" : "crosshair" }}
                  onPointerDown={(e) => { if (tool === "select") { setSel({ kind: "wall", id: w.id }); startDrag(e, { kind: "wall", id: w.id, last: toPlan(e) }); } }} />
                {isSel && (["start", "end"] as const).map((end) => (
                  <circle key={end} data-hit cx={w[end].x} cy={w[end].y} r={7 / view.k} fill="#fff" stroke={accent} strokeWidth={2 / view.k} style={{ cursor: "move" }}
                    onPointerDown={(e) => startDrag(e, { kind: "wallEnd", id: w.id, end })} />
                ))}
              </g>
            );
          })}

          {/* openings */}
          {floor.openings.map((o) => {
            const w = floor.walls.find((x) => x.id === o.wallId);
            if (!w) return null;
            const c = lerp(w.start, w.end, o.t);
            const ang = (wallAngle(w) * 180) / Math.PI;
            const wpx = o.width * ppf, tpx = Math.max(4 / view.k, w.thickness * ppf + 4 / view.k);
            const isSel = sel?.kind === "opening" && sel.id === o.id;
            const color = o.type === "door" ? "#f59e0b" : o.type === "window" ? "#38bdf8" : "#a3a3a3";
            return (
              <g key={o.id} transform={`translate(${c.x} ${c.y}) rotate(${ang})`}>
                <rect data-hit x={-wpx / 2} y={-tpx / 2} width={wpx} height={tpx} fill={color} stroke={isSel ? "#fff" : "#000"} strokeWidth={(isSel ? 2 : 1) / view.k} style={{ cursor: "ew-resize" }}
                  onPointerDown={(e) => { if (tool === "select") { setSel({ kind: "opening", id: o.id }); startDrag(e, { kind: "opening", id: o.id }); } }} />
                {o.type === "door" && <path d={`M ${-wpx / 2} 0 A ${wpx} ${wpx} 0 0 1 ${wpx / 2} ${-wpx}`} fill="none" stroke={color} strokeWidth={1 / view.k} pointerEvents="none" />}
              </g>
            );
          })}

          {/* draft */}
          {draft.length > 0 && cursor && (tool === "wall" || tool === "scale") && (
            <line x1={draft[0].x} y1={draft[0].y} x2={(draft[1] ?? (tool === "wall" ? axisSnap(draft[0], snap(cursor)) : snap(cursor))).x} y2={(draft[1] ?? (tool === "wall" ? axisSnap(draft[0], snap(cursor)) : snap(cursor))).y} stroke={accent} strokeWidth={3 / view.k} strokeDasharray={`${6 / view.k} ${4 / view.k}`} pointerEvents="none" />
          )}
          {tool === "room" && draft.length > 0 && cursor && (
            <polyline points={[...draft, snap(cursor)].map((p) => `${p.x},${p.y}`).join(" ")} fill={accent} fillOpacity={0.15} stroke={accent} strokeWidth={2 / view.k} pointerEvents="none" />
          )}
          {draft.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={5 / view.k} fill={accent} pointerEvents="none" />)}
        </svg>
        <div className="flex flex-wrap gap-3 px-3 py-1.5 text-xs muted border-t" style={{ borderColor: "var(--line)" }}>
          <span>{toolHint(tool, draft.length)}</span>
          <span className="ml-auto">{floor.walls.length} walls · {floor.openings.length} openings · {floor.rooms.length} rooms · {sqft.toFixed(0)} sq ft</span>
        </div>
      </div>

      {/* side panel */}
      <aside className="w-full lg:w-80 space-y-3 overflow-y-auto">
        <div className="card p-3 space-y-2">
          <div className="font-semibold text-sm">Selection</div>
          {!sel && <div className="muted text-sm">Click a wall, door, window, or room to edit it. Drag endpoints to adjust. Press Delete to remove.</div>}
          {selWall && (
            <div className="space-y-2">
              <div className="chip">Wall · {(dist(selWall.start, selWall.end) / ppf).toFixed(1)} ft</div>
              <label className="label">Thickness (ft)</label>
              <input className="input" type="number" step="0.05" min="0.1" max="3" value={selWall.thickness} onChange={(e) => patchWall({ thickness: Number(e.target.value) })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selWall.exterior} onChange={(e) => patchWall({ exterior: e.target.checked })} /> Exterior wall</label>
              <button className="btn btn-ghost w-full" onClick={deleteSel}>Delete wall</button>
            </div>
          )}
          {selOpening && (
            <div className="space-y-2">
              <label className="label">Type</label>
              <select className="input" value={selOpening.type} onChange={(e) => {
                const type = e.target.value as Opening["type"];
                patchOpening(type === "window" ? { type, sill: 3, height: 4 } : type === "door" ? { type, sill: 0, height: 6.8 } : { type, sill: 0, height: 8 });
              }}>
                <option value="door">Door</option><option value="window">Window</option><option value="opening">Cased opening</option>
              </select>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="label">Width ft</label><input className="input" type="number" step="0.1" value={selOpening.width} onChange={(e) => patchOpening({ width: Number(e.target.value) })} /></div>
                <div><label className="label">Height ft</label><input className="input" type="number" step="0.1" value={selOpening.height} onChange={(e) => patchOpening({ height: Number(e.target.value) })} /></div>
                <div><label className="label">Sill ft</label><input className="input" type="number" step="0.1" value={selOpening.sill} onChange={(e) => patchOpening({ sill: Number(e.target.value) })} /></div>
              </div>
              <button className="btn btn-ghost w-full" onClick={deleteSel}>Delete</button>
            </div>
          )}
          {selRoom && (
            <div className="space-y-2">
              <label className="label">Room name</label>
              <input className="input" value={selRoom.name} onChange={(e) => patchRoom({ name: e.target.value })} />
              <label className="label">Flooring</label>
              <select className="input" value={selRoom.floorMaterial} onChange={(e) => patchRoom({ floorMaterial: e.target.value as Room["floorMaterial"] })}>
                <option value="wood">Hardwood</option><option value="tile">Tile</option><option value="carpet">Carpet</option><option value="stone">Stone</option><option value="concrete">Concrete</option>
              </select>
              <div className="muted text-xs">{roomAreaSqFt(plan, selRoom.polygon).toFixed(0)} sq ft · drag the corner handles to reshape</div>
              <button className="btn btn-ghost w-full" onClick={deleteSel}>Delete room</button>
            </div>
          )}
        </div>

        {tool === "scale" && (
          <div className="card p-3 space-y-2" style={{ borderColor: accent }}>
            <div className="font-semibold text-sm">Set scale</div>
            <div className="muted text-sm">Click two points on a known dimension, then enter the real distance.</div>
            <label className="label">Distance (ft)</label>
            <input className="input" type="number" value={scaleFeet} onChange={(e) => setScaleFeet(e.target.value)} />
            <button className="btn btn-primary w-full" disabled={draft.length !== 2} onClick={applyScale}>Apply scale</button>
          </div>
        )}

        <div className="card p-3 space-y-2">
          <div className="font-semibold text-sm">Floor: {floor.name}</div>
          <label className="label">Name</label>
          <input className="input" value={floor.name} onChange={(e) => updateFloor({ name: e.target.value })} />
          <label className="label">Ceiling height (ft)</label>
          <input className="input" type="number" step="0.5" min="7" max="20" value={floor.ceilingHeight} onChange={(e) => updateFloor({ ceilingHeight: Number(e.target.value) })} />
          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={addFloor}>Add story</button>
            <button className="btn btn-ghost flex-1" onClick={removeFloor} disabled={plan.floors.length <= 1}>Remove</button>
          </div>
        </div>

        <div className="card p-3 space-y-2">
          <div className="font-semibold text-sm">Home</div>
          <label className="label">Roof</label>
          <select className="input" value={plan.roof} onChange={(e) => commit({ ...plan, roof: e.target.value as FloorPlan["roof"] })}>
            <option value="gable">Gable</option><option value="hip">Hip</option><option value="flat">Flat</option><option value="none">None</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Interior walls</label><input type="color" className="input !p-1 h-9" value={plan.style.wallColor} onChange={(e) => commit({ ...plan, style: { ...plan.style, wallColor: e.target.value } })} /></div>
            <div><label className="label">Exterior</label><input type="color" className="input !p-1 h-9" value={plan.style.exteriorColor} onChange={(e) => commit({ ...plan, style: { ...plan.style, exteriorColor: e.target.value } })} /></div>
            <div><label className="label">Trim</label><input type="color" className="input !p-1 h-9" value={plan.style.trimColor} onChange={(e) => commit({ ...plan, style: { ...plan.style, trimColor: e.target.value } })} /></div>
            <div><label className="label">Roof color</label><input type="color" className="input !p-1 h-9" value={plan.style.roofColor} onChange={(e) => commit({ ...plan, style: { ...plan.style, roofColor: e.target.value } })} /></div>
          </div>
          <div className="muted text-xs">Scale: {ppf.toFixed(2)} px/ft. {plan.scaleNote}</div>
        </div>

        {plan.notes.length > 0 && (
          <div className="card p-3 space-y-1">
            <div className="font-semibold text-sm">Things to check</div>
            <ul className="text-xs muted list-disc pl-4 space-y-1">
              {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function toolHint(tool: Tool, n: number) {
  switch (tool) {
    case "select": return "Drag the background to pan, scroll to zoom. Alt-drag also pans.";
    case "wall": return n ? "Click to place the wall's end. Hold Shift to keep drawing." : "Click to start a wall. Ends snap to nearby walls.";
    case "door": case "window": case "opening": return "Click on a wall to place it.";
    case "room": return n >= 3 ? "Click the first point to close the room." : "Click the corners of the room in order.";
    case "scale": return n === 2 ? "Enter the distance on the right and apply." : "Click two points on a known dimension.";
  }
}
