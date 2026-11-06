import * as THREE from "three";
import type { FloorMaterial } from "@/lib/plan/schema";

const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1) {
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, size: number, alpha: number) {
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * alpha;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Textures are authored at 1 texture tile = 4 feet. */
export const TILE_FEET = 4;

export function floorTexture(mat: FloorMaterial): THREE.Texture {
  switch (mat) {
    case "wood":
      return canvasTexture("wood", (ctx, s) => {
        ctx.fillStyle = "#b8864f"; ctx.fillRect(0, 0, s, s);
        const plank = s / 6;
        for (let i = 0; i < 6; i++) {
          const shade = 0.85 + Math.random() * 0.3;
          ctx.fillStyle = `rgb(${184 * shade | 0},${134 * shade | 0},${79 * shade | 0})`;
          ctx.fillRect(0, i * plank, s, plank - 2);
          ctx.strokeStyle = "rgba(60,30,10,0.35)"; ctx.lineWidth = 1;
          for (let g = 0; g < 8; g++) {
            ctx.beginPath(); const y = i * plank + Math.random() * plank;
            ctx.moveTo(0, y); ctx.bezierCurveTo(s / 3, y + 3, (2 * s) / 3, y - 3, s, y); ctx.stroke();
          }
          ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect((i * 97) % s, i * plank, 2, plank);
        }
        noise(ctx, s, 0.08);
      });
    case "tile":
      return canvasTexture("tile", (ctx, s) => {
        ctx.fillStyle = "#cfcac0"; ctx.fillRect(0, 0, s, s);
        const n = 4, t = s / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const sh = 0.92 + Math.random() * 0.12;
          ctx.fillStyle = `rgb(${215 * sh | 0},${210 * sh | 0},${200 * sh | 0})`;
          ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
        }
        noise(ctx, s, 0.05);
      });
    case "carpet":
      return canvasTexture("carpet", (ctx, s) => {
        ctx.fillStyle = "#a8a39a"; ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 0.25);
      });
    case "concrete":
      return canvasTexture("concrete", (ctx, s) => {
        ctx.fillStyle = "#9a9a98"; ctx.fillRect(0, 0, s, s);
        noise(ctx, s, 0.18);
        ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, s / 2, s / 2); ctx.strokeRect(s / 2, s / 2, s / 2, s / 2);
      });
    case "stone":
      return canvasTexture("stone", (ctx, s) => {
        ctx.fillStyle = "#8d8378"; ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(${120 + Math.random() * 60 | 0},${110 + Math.random() * 50 | 0},${95 + Math.random() * 40 | 0},0.9)`;
          ctx.beginPath(); ctx.ellipse(Math.random() * s, Math.random() * s, 20 + Math.random() * 30, 14 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2); ctx.fill();
        }
        noise(ctx, s, 0.1);
      });
  }
}

export function wallTexture(color: string) {
  return canvasTexture(`wall_${color}`, (ctx, s) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.04);
  }, 1);
}

export function grassTexture() {
  return canvasTexture("grass", (ctx, s) => {
    ctx.fillStyle = "#6f8f4f"; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.2);
  }, 1);
}

export function roofTexture(color: string) {
  return canvasTexture(`roof_${color}`, (ctx, s) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, s, s);
    const row = s / 8;
    for (let r = 0; r < 8; r++) {
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, r * row + row - 3, s, 3);
      const off = (r % 2) * (s / 12);
      for (let c = 0; c < 6; c++) { ctx.fillRect(off + c * (s / 6), r * row, 2, row); }
    }
    noise(ctx, s, 0.08);
  }, 1);
}
