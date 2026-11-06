import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PRODUCT_NAME } from "@/lib/config";

export default async function BuilderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const builder = await prisma.builder.findUnique({ where: { slug } });
  if (!builder) notFound();
  return (
    <div className="flex-1 flex flex-col" style={{ ["--brand" as string]: builder.primaryColor, ["--accent" as string]: builder.accentColor }}>
      <header className="border-b" style={{ borderColor: "var(--line)" }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/b/${slug}`} className="flex items-center gap-3">
            {builder.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={builder.logoUrl} alt={builder.name} className="h-9 w-auto" />
            ) : (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold" style={{ background: "var(--brand)" }}>{builder.name.slice(0, 1)}</div>
            )}
            <div>
              <div className="font-semibold leading-tight">{builder.name}</div>
              {builder.tagline && <div className="muted text-xs leading-tight">{builder.tagline}</div>}
            </div>
          </Link>
          <div className="flex-1" />
          {builder.phone && <a className="muted text-sm hidden sm:block" href={`tel:${builder.phone}`}>{builder.phone}</a>}
          {builder.website && <a className="btn btn-ghost !py-1" href={builder.website} target="_blank" rel="noreferrer">Website</a>}
        </div>
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
      <footer className="muted text-xs text-center py-4">
        {builder.name}{builder.email ? ` · ${builder.email}` : ""} · 3D walkthroughs powered by {PRODUCT_NAME}
      </footer>
    </div>
  );
}
