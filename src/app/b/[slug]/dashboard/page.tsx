import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAuthedBuilder } from "@/lib/auth";
import { APP_URL, CREDIT_PACKS } from "@/lib/config";
import { stripeEnabled } from "@/lib/billing";
import { deleteProject, updateBranding } from "./actions";
import BuyCredits from "./BuyCredits";

export const dynamic = "force-dynamic";

export default async function Dashboard({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ purchased?: string }> }) {
  const { slug } = await params;
  const { purchased } = await searchParams;
  const builder = await getAuthedBuilder(slug);
  if (!builder) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="card p-6 max-w-md text-center space-y-2">
          <div className="font-semibold">Builder dashboard</div>
          <div className="muted text-sm">Open this page using the private dashboard link you were given. It contains your access key.</div>
        </div>
      </main>
    );
  }
  const projects = await prisma.project.findMany({ where: { builderId: builder.id }, orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="chip">{builder.credits} credits left</span>
        {purchased && <span className="chip" style={{ color: "var(--accent)" }}>Thanks, credits will appear as soon as payment confirms.</span>}
        <div className="flex-1" />
        <Link href={`/b/${slug}`} className="btn btn-primary">Open client page</Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 space-y-3">
          <h2 className="font-semibold">Client projects</h2>
          {projects.length === 0 && <div className="card p-6 muted text-sm">No projects yet. Share your client page link: <span className="underline">{APP_URL}/b/{slug}</span></div>}
          {projects.map((p) => (
            <div key={p.id} className="card p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-40">
                <div className="font-medium">{p.name}</div>
                <div className="muted text-xs">{p.clientName || "Anonymous"}{p.clientEmail ? ` · ${p.clientEmail}` : ""} · {p.mode} · {new Date(p.createdAt).toLocaleDateString()}</div>
              </div>
              <span className="chip">{p.status}</span>
              <div className="flex-1" />
              <Link className="btn btn-ghost !py-1" href={`/b/${slug}/p/${p.id}`}>Open</Link>
              {p.status === "ready" && <a className="btn btn-ghost !py-1" href={`/view/${p.shareId}`} target="_blank">Share link</a>}
              <form action={deleteProject}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={p.id} /><button className="btn btn-ghost !py-1" style={{ color: "#f87171" }}>Delete</button></form>
            </div>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="card p-4 space-y-2">
            <h2 className="font-semibold">Model credits</h2>
            <div className="muted text-sm">Each generated home uses one credit. Edits and walkthroughs are free.</div>
            {stripeEnabled() ? <BuyCredits slug={slug} packs={CREDIT_PACKS.map((p) => ({ id: p.id, label: p.label, usd: p.usd }))} /> : <div className="muted text-xs">Contact us to add credits.</div>}
          </div>

          <form action={updateBranding} className="card p-4 space-y-2">
            <h2 className="font-semibold">Branding</h2>
            <input type="hidden" name="slug" value={slug} />
            <div><label className="label">Company name</label><input className="input" name="name" defaultValue={builder.name} /></div>
            <div><label className="label">Tagline</label><input className="input" name="tagline" defaultValue={builder.tagline ?? ""} /></div>
            <div><label className="label">Welcome text on client page</label><textarea className="input" name="welcomeText" defaultValue={builder.welcomeText ?? ""} rows={3} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Primary</label><input className="input !p-1 h-9" type="color" name="primaryColor" defaultValue={builder.primaryColor} /></div>
              <div><label className="label">Accent</label><input className="input !p-1 h-9" type="color" name="accentColor" defaultValue={builder.accentColor} /></div>
            </div>
            <div><label className="label">Logo (PNG/SVG)</label><input className="input" type="file" name="logo" accept="image/*" /></div>
            <div><label className="label">Website</label><input className="input" name="website" defaultValue={builder.website ?? ""} placeholder="https://" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Phone</label><input className="input" name="phone" defaultValue={builder.phone ?? ""} /></div>
              <div><label className="label">Email</label><input className="input" name="email" defaultValue={builder.email ?? ""} /></div>
            </div>
            <button className="btn btn-primary w-full">Save branding</button>
          </form>
        </aside>
      </div>
    </main>
  );
}
