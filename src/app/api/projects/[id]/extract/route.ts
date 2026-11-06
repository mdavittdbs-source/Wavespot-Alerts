import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { runExtraction } from "@/lib/ai/run";

export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.project.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.project.update({ where: { id }, data: { status: "extracting", error: null } });
  after(() => runExtraction(id));
  return NextResponse.json({ ok: true });
}
