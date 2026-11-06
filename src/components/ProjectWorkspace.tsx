"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FloorPlan } from "@/lib/plan/schema";
import PlanEditor from "./PlanEditor";

const Walkthrough = dynamic(() => import("./Walkthrough"), { ssr: false });

type ProjectDTO = {
  id: string;
  slug: string;
  name: string;
  status: string;
  error: string | null;
  plan: FloorPlan | null;
  shareUrl: string;
  accent: string;
  mode: string;
};

export default function ProjectWorkspace({ initial }: { initial: ProjectDTO }) {
  const [project, setProject] = useState(initial);
  const [plan, setPlan] = useState<FloorPlan | null>(initial.plan);
  const [tab, setTab] = useState<"review" | "walk">(initial.status === "ready" ? "walk" : "review");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewerPlan, setViewerPlan] = useState<FloorPlan | null>(initial.plan);

  // poll while extracting
  useEffect(() => {
    if (project.status !== "extracting") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/projects/${project.id}`, { cache: "no-store" });
      if (!r.ok) return;
      const d: ProjectDTO = await r.json();
      if (d.status !== "extracting") {
        setProject(d); setPlan(d.plan); setViewerPlan(d.plan);
        if (d.status === "ready") setTab("walk");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [project.status, project.id]);

  const onChange = useCallback((p: FloorPlan) => { setPlan(p); setDirty(true); }, []);

  const save = async () => {
    if (!plan) return;
    setSaving(true);
    const r = await fetch(`/api/projects/${project.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    setSaving(false);
    if (r.ok) { setDirty(false); setViewerPlan(plan); }
    else alert("Could not save: " + (await r.text()));
  };

  const retry = async () => {
    setProject({ ...project, status: "extracting", error: null });
    await fetch(`/api/projects/${project.id}/extract`, { method: "POST" });
  };

  const switchTab = (t: "review" | "walk") => {
    if (t === "walk" && dirty && plan) setViewerPlan(plan); // live preview of unsaved edits
    setTab(t);
  };

  return (
    <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 py-4 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/b/${project.slug}`} className="btn btn-ghost !py-1">← New project</Link>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <span className="chip">{project.status}</span>
        <div className="flex-1" />
        {project.status === "ready" && (
          <>
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: "var(--panel-2)" }}>
              <button className={`btn !py-1 !px-3 ${tab === "review" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchTab("review")}>Review plan</button>
              <button className={`btn !py-1 !px-3 ${tab === "walk" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchTab("walk")}>3D walkthrough</button>
            </div>
            <button className="btn btn-accent !py-1" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
          </>
        )}
      </div>

      {project.status === "extracting" && (
        <div className="card p-10 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: "var(--brand)", borderTopColor: "transparent" }} />
          <div className="font-semibold">Reading your {project.mode === "text" ? "description" : project.mode === "photos" ? "photos" : "blueprint"} and building the home…</div>
          <div className="muted text-sm">This usually takes 1 to 3 minutes. You can leave this page open; it updates automatically.</div>
        </div>
      )}

      {project.status === "failed" && (
        <div className="card p-8 text-center space-y-3">
          <div className="font-semibold" style={{ color: "#f87171" }}>We could not build this plan.</div>
          <div className="muted text-sm max-w-xl mx-auto">{project.error}</div>
          <button className="btn btn-primary" onClick={retry}>Try again</button>
        </div>
      )}

      {project.status === "ready" && plan && (
        tab === "review"
          ? <div className="flex-1 min-h-[600px]"><PlanEditor plan={plan} onChange={onChange} accent={project.accent} /></div>
          : <div className="flex-1 card overflow-hidden min-h-[600px]"><Walkthrough plan={viewerPlan ?? plan} accent={project.accent} shareUrl={project.shareUrl} /></div>
      )}
    </main>
  );
}
