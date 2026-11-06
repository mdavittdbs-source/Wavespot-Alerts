import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { FloorPlanSchema, type FloorPlan } from "@/lib/plan/schema";
import { snapWalls } from "@/lib/plan/geometry";
import { samplePlan } from "@/lib/plan/sample";
import { loadImageBase64 } from "@/lib/storage";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** What we ask the model for. Deliberately flat and free of defaults/constraints. */
const ExtractedFloor = z.object({
  name: z.string(),
  level: z.number(),
  ceilingHeightFeet: z.number(),
  walls: z.array(
    z.object({
      id: z.string(),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      thicknessFeet: z.number(),
      exterior: z.boolean(),
    }),
  ),
  openings: z.array(
    z.object({
      id: z.string(),
      wallId: z.string(),
      type: z.enum(["door", "window", "opening"]),
      positionAlongWall: z.number(),
      widthFeet: z.number(),
      heightFeet: z.number(),
      sillFeet: z.number(),
    }),
  ),
  rooms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      polygon: z.array(z.object({ x: z.number(), y: z.number() })),
      floorMaterial: z.enum(["wood", "tile", "carpet", "concrete", "stone"]),
    }),
  ),
});

const Extraction = z.object({
  pixelsPerFoot: z.number(),
  scaleNote: z.string(),
  roof: z.enum(["gable", "hip", "flat", "none"]),
  floors: z.array(ExtractedFloor),
  notes: z.array(z.string()),
});
type Extraction = z.infer<typeof Extraction>;

const SYSTEM = `You convert residential floor plans into precise structured geometry for a 3D home walkthrough.

Output rules:
- Coordinates are in image pixels. x runs right, y runs down. The image size is given in the request.
- Trace every wall as a straight segment from centerline start to centerline end. Walls that meet must share the exact same endpoint coordinates. Close every room: no gaps at corners.
- Mark the outer envelope walls exterior=true, with thicknessFeet about 0.75. Interior walls thicknessFeet about 0.45.
- For each door, window, or cased opening, reference the wall it sits in by id, give positionAlongWall as a fraction 0..1 measured from that wall's (x1,y1) end to its (x2,y2) end at the opening's center, and give real-world widthFeet. Doors: heightFeet 6.8, sillFeet 0. Windows: heightFeet 4, sillFeet 3 unless the drawing says otherwise. Cased openings between rooms: type "opening", heightFeet 8, sillFeet 0.
- Rooms: one polygon per labeled room, vertices in order, following the wall centerlines that enclose it. Use the drawing's room label as the name. Choose floorMaterial sensibly: tile for baths/kitchens/laundry/entry, carpet for bedrooms, wood elsewhere, concrete for garages.
- Scale: read dimension strings on the drawing (e.g. 12'-6") and compute pixelsPerFoot from the distance between the two points that dimension spans. Say which dimension you used in scaleNote. If no dimensions exist, assume a standard 3 ft wide exterior door and derive scale from it, and say so.
- Ceiling height: use what the drawing states, else 9 feet.
- notes: list anything you were unsure about or had to assume, one item each, so a human can check it.
- Be exhaustive. A typical house has 15 to 60 wall segments. Do not skip closets or small walls.`;

const TEXT_SYSTEM = `You design residential floor plans from a written description and output precise structured geometry for a 3D walkthrough.

Output rules:
- Use a virtual canvas at exactly 10 pixels per foot. Set pixelsPerFoot to 10 and scaleNote to "Generated at 10 px/ft". Put the plan's top-left corner near (50, 50).
- x runs right, y runs down. Make walls straight, axis-aligned unless the description calls for angles, and make walls that meet share identical endpoint coordinates. Every room must be fully enclosed.
- Exterior envelope walls exterior=true, thicknessFeet 0.75. Interior walls thicknessFeet 0.45.
- Realistic sizes: bedrooms 11x12 ft or larger, primary bedroom 14x16 or larger, bathrooms 5x8 to 10x12, kitchens 12x14 or larger, hallways 3.5 to 4 ft wide, doors 2.7 to 3 ft (6 ft for sliders/double doors), windows 3 to 6 ft wide with sillFeet 3 and heightFeet 4.
- Every room must have a door or opening connecting it to the rest of the house. Every bedroom and living space must have at least one window on an exterior wall.
- For multi-story homes output one floor per story with increasing level (0, 1, 2) and include a stair room named "Stairs" on each floor in the same position.
- Rooms: one polygon per room following the wall centerlines, named as a builder would label them. floorMaterial: tile for baths/kitchens/laundry/entry, carpet for bedrooms, wood elsewhere, concrete for garages.
- notes: list the design decisions you made that the description left open.
- Honor the square footage, bedroom/bath counts, garage, and any style requests in the description.`;

const PHOTO_SYSTEM = `You infer a plausible residential floor plan from photographs of a house (exterior and/or interior) plus any written notes, and output precise structured geometry for a 3D walkthrough. The result is an informed estimate, not a survey.

Output rules:
- Use a virtual canvas at exactly 10 pixels per foot. Set pixelsPerFoot to 10 and scaleNote to "Estimated from photos at 10 px/ft". Put the plan's top-left corner near (50, 50).
- Use the photos to estimate the footprint shape, number of stories, window and door positions on each facade, roof style, and which rooms are visible. Match window counts and positions on each exterior wall to what the photos show.
- x runs right, y runs down. Axis-aligned straight walls; walls that meet share identical endpoints; every room enclosed. Exterior walls exterior=true thicknessFeet 0.75; interior thicknessFeet 0.45.
- Standard sizes where the photos do not say: doors 3 ft, windows 3 to 5 ft wide with sillFeet 3 heightFeet 4, ceilings 9 ft (or what the interior photos suggest).
- One floor per story with level 0, 1, 2 and a "Stairs" room in the same position on each floor when there is more than one story.
- Rooms: one polygon per room following the wall centerlines; floorMaterial from the photos where visible, else tile for baths/kitchens, carpet for bedrooms, wood elsewhere, concrete for garages.
- notes: list every assumption, especially anything not visible in the photos.`;

function client() {
  return new Anthropic();
}

type ImageInput = { url: string; width?: number | null; height?: number | null };

async function imageBlock(img: ImageInput) {
  const { data, mediaType } = await loadImageBase64(img.url);
  return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data } };
}

async function runExtraction(system: string, content: Anthropic.Beta.BetaContentBlockParam[]): Promise<Extraction> {
  const response = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 32000,
    system,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(Extraction) },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this request. Try a clearer image or description.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The plan was too large to extract in one pass. Try uploading one floor at a time.");
  }
  if (!response.parsed_output) throw new Error("The model returned an unreadable plan. Please try again.");
  return response.parsed_output;
}

/** Turn the model's flat output into our canonical FloorPlan and clean it. */
function toFloorPlan(ex: Extraction, images: ImageInput[] = []): FloorPlan {
  const floors = ex.floors.map((f, i) => {
    const img = images[i];
    const walls = f.walls.map((w) => ({
      id: w.id,
      start: { x: w.x1, y: w.y1 },
      end: { x: w.x2, y: w.y2 },
      thickness: clamp(w.thicknessFeet, 0.1, 3),
      exterior: w.exterior,
    }));
    const wallIds = new Set(walls.map((w) => w.id));
    const openings = f.openings
      .filter((o) => wallIds.has(o.wallId))
      .map((o) => ({
        id: o.id,
        wallId: o.wallId,
        type: o.type,
        t: clamp(o.positionAlongWall, 0, 1),
        width: clamp(o.widthFeet, 1, 20),
        height: clamp(o.heightFeet, 1, 14),
        sill: clamp(o.sillFeet, 0, 8),
      }));
    const rooms = f.rooms.filter((r) => r.polygon.length >= 3);
    const floor = {
      id: `f${i + 1}`,
      name: f.name || `Floor ${i + 1}`,
      level: Number.isFinite(f.level) ? Math.round(f.level) : i,
      ceilingHeight: clamp(f.ceilingHeightFeet || 9, 7, 20),
      imageUrl: img?.url ?? null,
      imageWidth: img?.width ?? null,
      imageHeight: img?.height ?? null,
      walls,
      openings,
      rooms,
    };
    return snapWalls(floor, Math.max(2, ex.pixelsPerFoot * 0.4));
  });
  return FloorPlanSchema.parse({
    version: 1,
    units: "ft",
    pixelsPerFoot: ex.pixelsPerFoot > 0 ? ex.pixelsPerFoot : 10,
    scaleNote: ex.scaleNote,
    roof: ex.roof,
    floors,
    notes: ex.notes,
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export function demoMode() {
  return !process.env.ANTHROPIC_API_KEY;
}

/** One image per floor. Each image is extracted separately so large homes fit comfortably. */
export async function extractFromBlueprints(images: ImageInput[], userNotes?: string | null): Promise<FloorPlan> {
  if (demoMode()) return samplePlan(images[0]?.url ?? null, images[0]?.width, images[0]?.height);
  const merged: Extraction = { pixelsPerFoot: 0, scaleNote: "", roof: "gable", floors: [], notes: [] };
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      await imageBlock(img),
      {
        type: "text",
        text: [
          `Image size: ${img.width ?? "unknown"} x ${img.height ?? "unknown"} pixels.`,
          `This is floor plan sheet ${i + 1} of ${images.length}. Output exactly one floor for it with level ${i}.`,
          userNotes ? `Notes from the homeowner/builder: ${userNotes}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];
    const ex = await runExtraction(SYSTEM, content);
    if (i === 0) {
      merged.pixelsPerFoot = ex.pixelsPerFoot;
      merged.scaleNote = ex.scaleNote;
      merged.roof = ex.roof;
    }
    merged.floors.push(...ex.floors.map((f) => ({ ...f, level: i })));
    merged.notes.push(...ex.notes.map((n) => (images.length > 1 ? `Sheet ${i + 1}: ${n}` : n)));
  }
  return toFloorPlan(merged, images);
}

export async function extractFromText(prompt: string): Promise<FloorPlan> {
  if (demoMode()) return samplePlan(null);
  const ex = await runExtraction(TEXT_SYSTEM, [{ type: "text", text: `Design this home:\n\n${prompt}` }]);
  return toFloorPlan(ex);
}

export async function extractFromPhotos(images: ImageInput[], prompt?: string | null): Promise<FloorPlan> {
  if (demoMode()) return samplePlan(null);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of images) content.push(await imageBlock(img));
  content.push({
    type: "text",
    text: `These are ${images.length} photo(s) of the house.${prompt ? `\n\nNotes: ${prompt}` : ""}\n\nProduce the floor plan.`,
  });
  const ex = await runExtraction(PHOTO_SYSTEM, content);
  return toFloorPlan(ex);
}
