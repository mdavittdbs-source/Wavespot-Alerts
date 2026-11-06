"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FloorPlan } from "@/lib/plan/schema";
import { buildHouse, EYE_HEIGHT, type BuiltHouse } from "@/lib/three/buildHouse";

type Mode = "walk" | "orbit";

type Props = {
  plan: FloorPlan;
  /** show the builder's accent in UI chrome */
  accent?: string;
  shareUrl?: string | null;
  compact?: boolean;
};

const PLAYER_RADIUS = 0.9;

export default function Walkthrough({ plan, accent = "#f59e0b", shareUrl, compact }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("walk");
  const [floorId, setFloorId] = useState(plan.floors[0]?.id);
  const [showRoof, setShowRoof] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [locked, setLocked] = useState(false);
  const [hint, setHint] = useState(true);
  const [copied, setCopied] = useState(false);

  // mutable sim state lives in refs so the render loop never re-subscribes
  const sim = useRef({
    yaw: Math.PI,
    pitch: 0,
    keys: new Set<string>(),
    touchMove: { fwd: 0, strafe: 0 },
    pos: new THREE.Vector3(),
    built: null as BuiltHouse | null,
    floorId: plan.floors[0]?.id as string | undefined,
    mode: "walk" as Mode,
    renderer: null as THREE.WebGLRenderer | null,
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    orbit: null as OrbitControls | null,
    lastT: 0,
  });

  const sortedFloors = useMemo(() => [...plan.floors].sort((a, b) => a.level - b.level), [plan]);

  // --- scene setup once
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd8ee);
    scene.fog = new THREE.Fog(0xbfd8ee, 120, 300);
    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.1, 500);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xcfc6b8, 1.15);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -80; sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
    sun.shadow.camera.far = 250;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    // soft fill so interiors are not black
    const fill = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(fill);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enabled = false;
    orbit.enableDamping = true;
    orbit.maxPolarAngle = Math.PI / 2 - 0.02;

    const s = sim.current;
    s.renderer = renderer; s.scene = scene; s.camera = camera; s.orbit = orbit;

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // --- input
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "q", "e"].includes(k)) {
        if (down) s.keys.add(k); else s.keys.delete(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const kd = onKey(true), ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const el = renderer.domElement;
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el || s.mode !== "walk") return;
      s.yaw -= e.movementX * 0.0022;
      s.pitch = THREE.MathUtils.clamp(s.pitch - e.movementY * 0.0022, -1.2, 1.2);
    };
    const onLockChange = () => setLocked(document.pointerLockElement === el);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);

    // touch look
    let lastTouch: { x: number; y: number } | null = null;
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const onTouchMove = (e: TouchEvent) => {
      if (s.mode !== "walk" || !lastTouch || e.touches.length !== 1) return;
      const t = e.touches[0];
      s.yaw -= (t.clientX - lastTouch.x) * 0.005;
      s.pitch = THREE.MathUtils.clamp(s.pitch - (t.clientY - lastTouch.y) * 0.005, -1.2, 1.2);
      lastTouch = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    };
    const onTouchEnd = () => { lastTouch = null; };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    // --- loop
    let raf = 0;
    const tmpDir = new THREE.Vector3();
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (t - s.lastT) / 1000 || 0.016);
      s.lastT = t;
      if (s.mode === "walk" && s.built) {
        const speed = (s.keys.has("shift") ? 14 : 7) * dt;
        let fwd = 0, strafe = 0;
        if (s.keys.has("w") || s.keys.has("arrowup")) fwd += 1;
        if (s.keys.has("s") || s.keys.has("arrowdown")) fwd -= 1;
        if (s.keys.has("d") || s.keys.has("arrowright")) strafe += 1;
        if (s.keys.has("a") || s.keys.has("arrowleft")) strafe -= 1;
        if (s.keys.has("q")) s.yaw += 1.6 * dt;
        if (s.keys.has("e")) s.yaw -= 1.6 * dt;
        fwd += s.touchMove.fwd; strafe += s.touchMove.strafe;
        if (fwd || strafe) {
          const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw); // forward in XZ (yaw 0 looks toward +z)
          const mx = (fx * fwd + fz * strafe) * speed;
          const mz = (fz * fwd - fx * strafe) * speed;
          const fl = s.built.floors[s.floorId ?? ""];
          const segs = fl?.segs ?? [];
          const tryMove = (dx: number, dz: number) => {
            const nx = s.pos.x + dx, nz = s.pos.z + dz;
            for (const sg of segs) if (segDist(sg.a.x, sg.a.y, sg.b.x, sg.b.y, nx, nz) < PLAYER_RADIUS) return false;
            s.pos.x = nx; s.pos.z = nz; return true;
          };
          if (!tryMove(mx, mz)) { tryMove(mx, 0) || tryMove(0, mz); }
        }
        camera.position.copy(s.pos);
        tmpDir.set(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch));
        camera.lookAt(camera.position.clone().add(tmpDir));
      } else {
        orbit.update();
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      orbit.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // --- (re)build house when plan/options change
  useEffect(() => {
    const s = sim.current;
    if (!s.scene) return;
    if (s.built) { s.scene.remove(s.built.group); disposeGroup(s.built.group); }
    const built = buildHouse(plan, { showRoof, showCeilings: true, showLabels, showGround: true });
    s.scene.add(built.group);
    const wasFirst = !s.built;
    s.built = built;
    const fl = built.floors[s.floorId ?? ""] ?? Object.values(built.floors)[0];
    if (wasFirst && fl) { s.pos.copy(fl.spawn); }
    else if (fl) { s.pos.y = fl.base + EYE_HEIGHT; }
    // orbit target
    if (s.orbit && s.camera) {
      s.orbit.target.set(0, 4, 0);
      if (wasFirst) s.camera.position.set(built.size.w * 0.9, built.size.w * 0.7 + 12, built.size.d * 1.1);
    }
  }, [plan, showRoof, showLabels]);

  // floor visibility and teleport when the floor changes
  useEffect(() => {
    const s = sim.current;
    s.floorId = floorId;
    if (!s.built) return;
    for (const f of plan.floors) {
      const g = s.built.group.getObjectByName(`floor:${f.id}`);
      if (!g) continue;
      // walk mode: only current floor + floors below. orbit: all floors.
      const fl = plan.floors.find((x) => x.id === floorId);
      g.visible = s.mode === "orbit" ? true : !!fl && f.level <= fl.level;
    }
    const fl = s.built.floors[floorId ?? ""];
    if (fl) s.pos.copy(fl.spawn);
  }, [floorId, plan, mode]);

  // mode switching
  useEffect(() => {
    const s = sim.current;
    s.mode = mode;
    if (!s.orbit || !s.camera) return;
    s.orbit.enabled = mode === "orbit";
    if (mode === "orbit") {
      document.exitPointerLock?.();
      if (s.built) s.camera.position.set(s.built.size.w * 0.9, s.built.size.w * 0.7 + 12, s.built.size.d * 1.1);
      s.orbit.target.set(0, 4, 0);
      setRoofVisible(s, showRoof);
      setCeilingsVisible(s, false);
    } else {
      setRoofVisible(s, showRoof);
      setCeilingsVisible(s, true);
      const fl = s.built?.floors[s.floorId ?? ""];
      if (fl) s.pos.copy(fl.spawn);
    }
    // re-apply floor visibility rule
    if (s.built) {
      const cur = plan.floors.find((x) => x.id === s.floorId);
      for (const f of plan.floors) {
        const g = s.built.group.getObjectByName(`floor:${f.id}`);
        if (g) g.visible = mode === "orbit" ? true : !!cur && f.level <= cur.level;
      }
    }
  }, [mode, showRoof, plan]);

  const enterWalk = useCallback(() => {
    const s = sim.current;
    setHint(false);
    if (mode !== "walk") setMode("walk");
    if (s.renderer && !("ontouchstart" in window)) s.renderer.domElement.requestPointerLock?.();
  }, [mode]);

  const exportGlb = useCallback(async () => {
    const s = sim.current;
    if (!s.built) return;
    const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
    const exporter = new GLTFExporter();
    const clone = s.built.group.clone(true);
    clone.traverse((o) => { if (o.name === "ground" || o.name === "label") o.visible = false; });
    exporter.parse(
      clone,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
        download(blob, "home-model.glb");
      },
      (err) => console.error(err),
      { binary: true, onlyVisible: true },
    );
  }, []);

  const screenshot = useCallback(() => {
    const s = sim.current;
    if (!s.renderer || !s.scene || !s.camera) return;
    s.renderer.render(s.scene, s.camera);
    s.renderer.domElement.toBlob((b) => b && download(b, "home-view.png"), "image/png");
  }, []);

  const copyShare = useCallback(async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [shareUrl]);

  const touch = (fwd: number, strafe: number) => ({
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); sim.current.touchMove = { fwd, strafe }; },
    onTouchEnd: () => { sim.current.touchMove = { fwd: 0, strafe: 0 }; },
    onMouseDown: () => { sim.current.touchMove = { fwd, strafe }; },
    onMouseUp: () => { sim.current.touchMove = { fwd: 0, strafe: 0 }; },
    onMouseLeave: () => { sim.current.touchMove = { fwd: 0, strafe: 0 }; },
  });

  return (
    <div className="relative w-full h-full select-none" style={{ minHeight: compact ? 360 : 480 }}>
      <div ref={mountRef} className="absolute inset-0" onClick={mode === "walk" ? enterWalk : undefined} />

      {/* top bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="flex items-center gap-1 rounded-lg p-1 pointer-events-auto" style={{ background: "rgba(10,12,18,0.75)", backdropFilter: "blur(6px)" }}>
          <button className={`btn !py-1 !px-3 ${mode === "walk" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("walk")}>Walk</button>
          <button className={`btn !py-1 !px-3 ${mode === "orbit" ? "btn-primary" : "btn-ghost"}`} onClick={() => { setMode("orbit"); setShowRoof(false); }}>Dollhouse</button>
        </div>
        {sortedFloors.length > 1 && (
          <select className="input !w-auto pointer-events-auto" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
            {sortedFloors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <label className="chip pointer-events-auto cursor-pointer gap-2"><input type="checkbox" checked={showRoof} onChange={(e) => setShowRoof(e.target.checked)} /> Roof</label>
        <label className="chip pointer-events-auto cursor-pointer gap-2"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Room labels</label>
        <div className="flex-1" />
        <button className="btn btn-ghost !py-1 !px-3 pointer-events-auto" onClick={screenshot}>Screenshot</button>
        <button className="btn btn-ghost !py-1 !px-3 pointer-events-auto" onClick={exportGlb}>Download 3D (GLB)</button>
        {shareUrl && (
          <button className="btn !py-1 !px-3 pointer-events-auto" style={{ background: accent, color: "#111" }} onClick={copyShare}>
            {copied ? "Copied!" : "Copy share link"}
          </button>
        )}
      </div>

      {/* hint overlay */}
      {mode === "walk" && !locked && hint && (
        <button onClick={enterWalk} className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 cursor-pointer">
          <div className="card px-6 py-5 text-center max-w-sm">
            <div className="text-lg font-semibold mb-1">Click to walk through</div>
            <div className="muted text-sm">Move with W A S D or arrow keys. Look with the mouse. Hold Shift to run. Press Esc to release the cursor.</div>
          </div>
        </button>
      )}

      {/* touch controls */}
      {mode === "walk" && (
        <div className="absolute bottom-4 left-4 grid grid-cols-3 gap-1 md:hidden">
          <div />
          <button className="btn btn-ghost !w-12 !h-12" {...touch(1, 0)}>▲</button>
          <div />
          <button className="btn btn-ghost !w-12 !h-12" {...touch(0, -1)}>◀</button>
          <button className="btn btn-ghost !w-12 !h-12" {...touch(-1, 0)}>▼</button>
          <button className="btn btn-ghost !w-12 !h-12" {...touch(0, 1)}>▶</button>
        </div>
      )}

      {mode === "walk" && locked && (
        <div className="absolute bottom-3 right-3 chip">W A S D to move · Shift to run · Esc to exit</div>
      )}
      {mode === "orbit" && (
        <div className="absolute bottom-3 right-3 chip">Drag to rotate · Scroll to zoom · Right-drag to pan</div>
      )}
    </div>
  );
}

function setRoofVisible(s: { built: BuiltHouse | null }, v: boolean) {
  const r = s.built?.group.getObjectByName("roof"); if (r) r.visible = v;
}
function setCeilingsVisible(s: { built: BuiltHouse | null }, v: boolean) {
  s.built?.group.traverse((o) => { if (o.name === "ceiling") o.visible = v; });
}

function segDist(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
  });
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
