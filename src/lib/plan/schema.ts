import { z } from "zod";

/**
 * FloorPlan is the single source of truth for a home.
 * All coordinates are in plan units (px). `pixelsPerFoot` converts to real feet.
 * X runs right, Y runs DOWN (image convention). The 3D builder maps X->X, Y->Z.
 */
export const PointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof PointSchema>;

export const WallSchema = z.object({
  id: z.string(),
  start: PointSchema,
  end: PointSchema,
  /** thickness in feet */
  thickness: z.number().min(0.1).max(3).default(0.5),
  exterior: z.boolean().default(false),
});
export type Wall = z.infer<typeof WallSchema>;

export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  type: z.enum(["door", "window", "opening"]),
  /** 0..1 position of the opening center along the wall from start to end */
  t: z.number().min(0).max(1),
  /** width in feet */
  width: z.number().min(1).max(20),
  /** height in feet */
  height: z.number().min(1).max(14).default(6.8),
  /** bottom of opening above floor, in feet (0 for doors) */
  sill: z.number().min(0).max(8).default(0),
});
export type Opening = z.infer<typeof OpeningSchema>;

export const FloorMaterialSchema = z.enum(["wood", "tile", "carpet", "concrete", "stone"]);
export type FloorMaterial = z.infer<typeof FloorMaterialSchema>;

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  polygon: z.array(PointSchema).min(3),
  floorMaterial: FloorMaterialSchema.default("wood"),
});
export type Room = z.infer<typeof RoomSchema>;

export const FloorSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int(),
  /** ceiling height in feet */
  ceilingHeight: z.number().min(7).max(20).default(9),
  /** optional source image for overlay in the editor */
  imageUrl: z.string().nullable().default(null),
  imageWidth: z.number().nullable().default(null),
  imageHeight: z.number().nullable().default(null),
  walls: z.array(WallSchema),
  openings: z.array(OpeningSchema),
  rooms: z.array(RoomSchema),
});
export type Floor = z.infer<typeof FloorSchema>;

export const RoofStyleSchema = z.enum(["gable", "hip", "flat", "none"]);

export const FloorPlanSchema = z.object({
  version: z.literal(1).default(1),
  units: z.literal("ft").default("ft"),
  /** plan px per real foot */
  pixelsPerFoot: z.number().positive(),
  /** how pixelsPerFoot was determined, for the UI */
  scaleNote: z.string().default(""),
  roof: RoofStyleSchema.default("gable"),
  style: z
    .object({
      wallColor: z.string().default("#f4f1ea"),
      exteriorColor: z.string().default("#d9d2c5"),
      trimColor: z.string().default("#ffffff"),
      roofColor: z.string().default("#5b5248"),
    })
    .default({ wallColor: "#f4f1ea", exteriorColor: "#d9d2c5", trimColor: "#ffffff", roofColor: "#5b5248" }),
  floors: z.array(FloorSchema).min(1),
  /** free-text notes from the extractor: assumptions, low-confidence items */
  notes: z.array(z.string()).default([]),
});
export type FloorPlan = z.infer<typeof FloorPlanSchema>;

export function parseFloorPlan(json: unknown): FloorPlan {
  return FloorPlanSchema.parse(json);
}

export function safeParseFloorPlan(json: unknown) {
  return FloorPlanSchema.safeParse(json);
}

/** Convert plan px to feet */
export const toFeet = (plan: Pick<FloorPlan, "pixelsPerFoot">, px: number) => px / plan.pixelsPerFoot;
