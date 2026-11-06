import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { storeFile } from "@/lib/storage";
import { runExtraction } from "@/lib/ai/run";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const slug = String(fd.get("slug") ?? "");
  const mode = String(fd.get("mode") ?? "blueprint");
  if (!["blueprint", "photos", "text"].includes(mode)) return NextResponse.json({ error: "Bad mode" }, { status: 400 });
  const builder = await prisma.builder.findUnique({ where: { slug } });
  if (!builder) return NextResponse.json({ error: "Unknown builder" }, { status: 404 });
  if (builder.credits <= 0) return NextResponse.json({ error: "This builder has no model credits left." }, { status: 402 });

  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  if (mode !== "text" && files.length === 0) return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  if (files.length > 12) return NextResponse.json({ error: "Max 12 files per project" }, { status: 400 });
  let dims: Array<{ width: number; height: number }> = [];
  try { dims = JSON.parse(String(fd.get("dims") ?? "[]")); } catch { dims = []; }

  const stored: Array<{ url: string; width: number | null; height: number | null; order: number }> = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.size > 15 * 1024 * 1024) return NextResponse.json({ error: `${f.name} is over 15 MB` }, { status: 400 });
    const ext = f.type === "image/jpeg" ? "jpg" : f.type === "image/webp" ? "webp" : "png";
    const { url } = await storeFile(Buffer.from(await f.arrayBuffer()), f.type || "image/png", ext);
    stored.push({ url, width: dims[i]?.width ?? null, height: dims[i]?.height ?? null, order: i });
  }

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        shareId: nanoid(12),
        builderId: builder.id,
        name: String(fd.get("name") ?? "Untitled").slice(0, 120),
        mode,
        status: "extracting",
        prompt: String(fd.get("prompt") ?? "") || null,
        clientName: String(fd.get("clientName") ?? "") || null,
        clientEmail: String(fd.get("clientEmail") ?? "") || null,
        images: { create: stored.map((s) => ({ url: s.url, width: s.width, height: s.height, order: s.order, kind: mode === "photos" ? "photo" : "source" })) },
      },
    });
    await tx.builder.update({ where: { id: builder.id }, data: { credits: { decrement: 1 } } });
    return p;
  });

  // Run the model after the response is sent; the client polls for status.
  after(() => runExtraction(project.id));

  return NextResponse.json({ id: project.id });
}
