import { NextRequest, NextResponse } from "next/server";
import { readLocalFile } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const f = await readLocalFile(name);
  if (!f) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(f.buffer), { headers: { "content-type": f.contentType, "cache-control": "public, max-age=31536000, immutable" } });
}
