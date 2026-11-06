import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BUILDER_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const builder = await prisma.builder.findUnique({ where: { slug } });
  const res = NextResponse.redirect(new URL(`/b/${slug}/dashboard`, req.url));
  if (builder && key === builder.adminKey) {
    res.cookies.set(`${BUILDER_COOKIE}_${slug}`, key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  }
  return res;
}
