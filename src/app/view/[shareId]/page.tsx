import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PRODUCT_NAME } from "@/lib/config";
import { safeParseFloorPlan } from "@/lib/plan/schema";
import ViewerClient from "./ViewerClient";

export const dynamicParams = true;
export const revalidate = 0;

export default async function SharePage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const project = await prisma.project.findUnique({ where: { shareId }, include: { builder: true } });
  if (!project || !project.plan) notFound();
  const parsed = safeParseFloorPlan(JSON.parse(project.plan));
  if (!parsed.success) notFound();
  const b = project.builder;
  return (
    <div className="flex-1 flex flex-col" style={{ ["--brand" as string]: b.primaryColor, ["--accent" as string]: b.accentColor }}>
      <header className="px-4 py-3 flex items-center gap-3 border-b" style={{ borderColor: "var(--line)" }}>
        {b.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logoUrl} alt={b.name} className="h-8 w-auto" />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold" style={{ background: "var(--brand)" }}>{b.name.slice(0, 1)}</div>
        )}
        <div className="font-semibold">{b.name}</div>
        <div className="muted">·</div>
        <div className="muted text-sm">{project.name}</div>
        <div className="flex-1" />
        {b.website && <a className="btn btn-ghost !py-1" href={b.website} target="_blank" rel="noreferrer">Visit {b.name}</a>}
      </header>
      <div className="flex-1 min-h-[70vh]">
        <ViewerClient plan={parsed.data} accent={b.accentColor} />
      </div>
      <footer className="muted text-xs text-center py-3">Walkthrough by {b.name} · powered by {PRODUCT_NAME}</footer>
    </div>
  );
}
