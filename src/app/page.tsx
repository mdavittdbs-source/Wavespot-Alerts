import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const demo = await prisma.builder.findUnique({ where: { slug: "demo" } });
  return (
    <main className="flex-1">
      <header className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between">
        <div className="font-bold text-lg tracking-tight">{PRODUCT_NAME}</div>
        <nav className="flex gap-2">
          {demo && <Link href="/b/demo" className="btn btn-ghost">Live demo</Link>}
          <Link href="/admin" className="btn btn-primary">Builder admin</Link>
        </nav>
      </header>

      <section className="max-w-6xl mx-auto px-5 pt-16 pb-20 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="chip mb-4" style={{ color: "var(--accent)" }}>For custom home builders</div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight">
            Your clients upload a blueprint. They walk through their new home in minutes.
          </h1>
          <p className="muted mt-5 text-lg">
            {PRODUCT_NAME} reads floor plans, photos, or a written description, builds a 3D model of the house, and lets
            buyers explore it first-person in the browser. White-labeled with your logo, colors, and domain.
          </p>
          <div className="flex gap-3 mt-8">
            {demo && <Link href="/b/demo" className="btn btn-primary !px-6 !py-3">Try the demo</Link>}
            <Link href="/admin" className="btn btn-ghost !px-6 !py-3">Set up your brand</Link>
          </div>
        </div>
        <div className="card p-6 space-y-4">
          {[
            ["1", "Upload", "Blueprint pages (PDF or image), house photos, or a description of the home you want."],
            ["2", "Review", "AI extracts walls, doors, windows, and rooms. Your client fixes anything it missed in a simple editor."],
            ["3", "Walk through", "First-person walkthrough, dollhouse view, materials, room labels, shareable link, and a downloadable 3D file."],
          ].map(([n, t, d]) => (
            <div key={n} className="flex gap-4">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0" style={{ background: "var(--brand)" }}>{n}</div>
              <div><div className="font-semibold">{t}</div><div className="muted text-sm">{d}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-20 grid md:grid-cols-3 gap-4">
        {[
          ["White-label", "Each builder gets a branded page at /b/your-name or on your own subdomain, with logo, colors, and contact details."],
          ["Credits, not seats", "Builders buy model credits. Each generated home uses one credit. Stripe checkout is built in."],
          ["Owned output", "Every model exports as a standard GLB file that opens in Blender, Unreal, Unity, or any 3D viewer."],
        ].map(([t, d]) => (
          <div key={t} className="card p-5"><div className="font-semibold mb-1">{t}</div><div className="muted text-sm">{d}</div></div>
        ))}
      </section>
      <footer className="muted text-xs text-center py-6">{PRODUCT_NAME}</footer>
    </main>
  );
}
