import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { APP_URL } from "@/lib/config";
import { safeParseFloorPlan } from "@/lib/plan/schema";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.project.findUnique({ where: { id }, include: { builder: true } });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = p.plan ? safeParseFloorPlan(JSON.parse(p.plan)) : null;
  return NextResponse.json({
    id: p.id, slug: p.builder.slug, name: p.name, status: p.status, error: p.error, mode: p.mode,
    plan: parsed?.success ? parsed.data : null,
    shareUrl: `${APP_URL}/view/${p.shareId}`, accent: p.builder.accentColor,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = safeParseFloorPlan(body?.plan);
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const p = await prisma.project.update({ where: { id }, data: { plan: JSON.stringify(parsed.data), status: "ready" } }).catch(() => null);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
