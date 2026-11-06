import Link from "next/link";
import { prisma } from "@/lib/db";
import { isAdmin, adminPassword } from "@/lib/auth";
import { APP_URL, PRODUCT_NAME } from "@/lib/config";
import { addCredits, adminLogin, adminLogout, createBuilder, deleteBuilder } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authed = await isAdmin();
  if (!authed) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <form action={adminLogin} className="card p-6 w-full max-w-sm space-y-3">
          <div className="font-semibold text-lg">{PRODUCT_NAME} admin</div>
          {!adminPassword() && <div className="text-sm" style={{ color: "#f87171" }}>ADMIN_PASSWORD is not set in the environment.</div>}
          <label className="label">Password</label>
          <input className="input" name="password" type="password" autoFocus />
          <button className="btn btn-primary w-full">Sign in</button>
          <Link href="/" className="muted text-xs block text-center">Back to site</Link>
        </form>
      </main>
    );
  }

  const builders = await prisma.builder.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { projects: true } } } });

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Builders</h1>
        <div className="flex gap-2">
          <Link href="/" className="btn btn-ghost">Site</Link>
          <form action={adminLogout}><button className="btn btn-ghost">Sign out</button></form>
        </div>
      </div>

      <form action={createBuilder} className="card p-5 grid md:grid-cols-6 gap-3 items-end">
        <div className="md:col-span-2"><label className="label">Company name</label><input className="input" name="name" required placeholder="Acme Custom Homes" /></div>
        <div><label className="label">Slug (URL)</label><input className="input" name="slug" placeholder="acme" /></div>
        <div><label className="label">Primary color</label><input className="input !p-1 h-9" type="color" name="primaryColor" defaultValue="#1d4ed8" /></div>
        <div><label className="label">Accent</label><input className="input !p-1 h-9" type="color" name="accentColor" defaultValue="#f59e0b" /></div>
        <div><label className="label">Starting credits</label><input className="input" type="number" name="credits" defaultValue={5} /></div>
        <div className="md:col-span-5"><label className="label">Tagline</label><input className="input" name="tagline" placeholder="Building dream homes in the Delaware Valley since 1998" /></div>
        <button className="btn btn-primary">Create builder</button>
      </form>

      <div className="space-y-3">
        {builders.length === 0 && <div className="muted">No builders yet. Create one above.</div>}
        {builders.map((b) => (
          <div key={b.id} className="card p-4 flex flex-wrap gap-4 items-center">
            <div className="w-3 h-10 rounded" style={{ background: b.primaryColor }} />
            <div className="min-w-48">
              <div className="font-semibold">{b.name}</div>
              <div className="muted text-xs">/b/{b.slug} · {b._count.projects} projects · {b.credits} credits</div>
            </div>
            <div className="text-xs space-y-1 flex-1 min-w-64">
              <div><span className="muted">Client page: </span><a className="underline" href={`/b/${b.slug}`} target="_blank">{APP_URL}/b/{b.slug}</a></div>
              <div><span className="muted">Builder dashboard (private link): </span><a className="underline break-all" href={`/b/${b.slug}/login?key=${b.adminKey}`} target="_blank">{APP_URL}/b/{b.slug}/login?key={b.adminKey}</a></div>
            </div>
            <form action={addCredits} className="flex gap-2 items-center">
              <input type="hidden" name="id" value={b.id} />
              <input className="input !w-20" type="number" name="credits" defaultValue={10} />
              <button className="btn btn-ghost">Add credits</button>
            </form>
            <form action={deleteBuilder}>
              <input type="hidden" name="id" value={b.id} />
              <button className="btn btn-ghost" style={{ color: "#f87171" }}>Delete</button>
            </form>
          </div>
        ))}
      </div>
    </main>
  );
}
