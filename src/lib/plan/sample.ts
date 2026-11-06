import type { FloorPlan } from "./schema";

/**
 * A realistic 3-bed / 1-bath single-story plan (~50 x 36 ft) used in demo mode
 * and as a fixture for the viewer. 10 px per foot.
 */
export function samplePlan(imageUrl: string | null = null, imageWidth?: number | null, imageHeight?: number | null): FloorPlan {
  const P = 10;
  return {
    version: 1,
    units: "ft",
    pixelsPerFoot: P,
    scaleNote: "Demo plan: 10 px per foot",
    roof: "gable",
    style: { wallColor: "#f4f1ea", exteriorColor: "#d9d2c5", trimColor: "#ffffff", roofColor: "#5b5248" },
    notes: [
      "This is the built-in demo plan. Add an Anthropic API key to extract real blueprints.",
    ],
    floors: [
      {
        id: "f1",
        name: "Main Floor",
        level: 0,
        ceilingHeight: 9,
        imageUrl,
        imageWidth: imageUrl ? imageWidth ?? 560 : null,
        imageHeight: imageUrl ? imageHeight ?? 420 : null,
        walls: [
          { id: "w_n", start: { x: 20, y: 20 }, end: { x: 520, y: 20 }, thickness: 0.75, exterior: true },
          { id: "w_e", start: { x: 520, y: 20 }, end: { x: 520, y: 380 }, thickness: 0.75, exterior: true },
          { id: "w_s", start: { x: 520, y: 380 }, end: { x: 20, y: 380 }, thickness: 0.75, exterior: true },
          { id: "w_w", start: { x: 20, y: 380 }, end: { x: 20, y: 20 }, thickness: 0.75, exterior: true },
          { id: "w_mid", start: { x: 260, y: 20 }, end: { x: 260, y: 380 }, thickness: 0.5, exterior: false },
          { id: "w_lk", start: { x: 20, y: 200 }, end: { x: 260, y: 200 }, thickness: 0.5, exterior: false },
          { id: "w_b1", start: { x: 260, y: 160 }, end: { x: 520, y: 160 }, thickness: 0.5, exterior: false },
          { id: "w_b2", start: { x: 390, y: 160 }, end: { x: 390, y: 380 }, thickness: 0.5, exterior: false },
          { id: "w_bath", start: { x: 390, y: 260 }, end: { x: 520, y: 260 }, thickness: 0.5, exterior: false },
        ],
        openings: [
          { id: "o_front", wallId: "w_n", type: "door", t: 0.24, width: 3, height: 6.8, sill: 0 },
          { id: "o_win1", wallId: "w_n", type: "window", t: 0.1, width: 4, height: 4, sill: 3 },
          { id: "o_win2", wallId: "w_n", type: "window", t: 0.4, width: 4, height: 4, sill: 3 },
          { id: "o_win3", wallId: "w_n", type: "window", t: 0.78, width: 5, height: 4, sill: 3 },
          { id: "o_win4", wallId: "w_e", type: "window", t: 0.2, width: 4, height: 4, sill: 3 },
          { id: "o_win5", wallId: "w_e", type: "window", t: 0.85, width: 4, height: 4, sill: 3 },
          { id: "o_win6", wallId: "w_s", type: "window", t: 0.15, width: 4, height: 4, sill: 3 },
          { id: "o_win7", wallId: "w_s", type: "window", t: 0.4, width: 4, height: 4, sill: 3 },
          { id: "o_back", wallId: "w_s", type: "door", t: 0.7, width: 6, height: 6.8, sill: 0 },
          { id: "o_win8", wallId: "w_w", type: "window", t: 0.3, width: 5, height: 4, sill: 3 },
          { id: "o_win9", wallId: "w_w", type: "window", t: 0.75, width: 5, height: 4, sill: 3 },
          { id: "o_lb1", wallId: "w_mid", type: "door", t: 0.25, width: 2.7, height: 6.8, sill: 0 },
          { id: "o_lk", wallId: "w_lk", type: "opening", t: 0.5, width: 8, height: 8, sill: 0 },
          { id: "o_kb2", wallId: "w_mid", type: "door", t: 0.75, width: 2.7, height: 6.8, sill: 0 },
          { id: "o_bath", wallId: "w_b2", type: "door", t: 0.2, width: 2.5, height: 6.8, sill: 0 },
          { id: "o_b3", wallId: "w_b2", type: "door", t: 0.75, width: 2.7, height: 6.8, sill: 0 },
        ],
        rooms: [
          { id: "r_living", name: "Living Room", floorMaterial: "wood", polygon: [{ x: 20, y: 20 }, { x: 260, y: 20 }, { x: 260, y: 200 }, { x: 20, y: 200 }] },
          { id: "r_kitchen", name: "Kitchen & Dining", floorMaterial: "tile", polygon: [{ x: 20, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 380 }, { x: 20, y: 380 }] },
          { id: "r_bed1", name: "Primary Bedroom", floorMaterial: "carpet", polygon: [{ x: 260, y: 20 }, { x: 520, y: 20 }, { x: 520, y: 160 }, { x: 260, y: 160 }] },
          { id: "r_bed2", name: "Bedroom 2", floorMaterial: "carpet", polygon: [{ x: 260, y: 160 }, { x: 390, y: 160 }, { x: 390, y: 380 }, { x: 260, y: 380 }] },
          { id: "r_bath", name: "Bathroom", floorMaterial: "tile", polygon: [{ x: 390, y: 160 }, { x: 520, y: 160 }, { x: 520, y: 260 }, { x: 390, y: 260 }] },
          { id: "r_bed3", name: "Bedroom 3", floorMaterial: "carpet", polygon: [{ x: 390, y: 260 }, { x: 520, y: 260 }, { x: 520, y: 380 }, { x: 390, y: 380 }] },
        ],
      },
    ],
  };
}
