import { NextRequest, NextResponse } from "next/server";

/**
 * Optional subdomain white-labeling: with NEXT_PUBLIC_ROOT_DOMAIN=planwalk.example.com,
 * acme.planwalk.example.com/... is served from /b/acme/...
 */
export function middleware(req: NextRequest) {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!root) return NextResponse.next();
  const host = req.headers.get("host")?.split(":")[0] ?? "";
  if (!host.endsWith(`.${root}`)) return NextResponse.next();
  const sub = host.slice(0, -(root.length + 1));
  if (!sub || sub === "www" || sub === "app") return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/b/") || pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.startsWith("/view")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/b/${sub}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
