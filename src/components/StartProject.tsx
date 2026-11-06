"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "blueprint" | "photos" | "text";
type Prepared = { blob: Blob; name: string; width: number; height: number; preview: string };

const MODES: Array<{ id: Mode; title: string; desc: string }> = [
  { id: "blueprint", title: "Upload a blueprint", desc: "PDF or photos of floor plans. One page per story." },
  { id: "photos", title: "Upload house photos", desc: "Exterior and interior photos of a home you like." },
  { id: "text", title: "Describe your home", desc: "Bedrooms, baths, square footage, style, must-haves." },
];

export default function StartProject({ slug, credits }: { slug: string; credits: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("blueprint");
  const [files, setFiles] = useState<Prepared[]>([]);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function onFiles(list: FileList | null) {
    if (!list) return;
    setBusy("Preparing files…");
    setError(null);
    try {
      const out: Prepared[] = [];
      for (const f of Array.from(list)) {
        if (f.type === "application/pdf") out.push(...(await pdfToImages(f)));
        else if (f.type.startsWith("image/")) out.push(await prepareImage(f));
      }
      setFiles((prev) => [...prev, ...out]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setError(null);
    if (mode !== "text" && files.length === 0) return setError("Add at least one file.");
    if (mode === "text" && prompt.trim().length < 10) return setError("Describe the home in a sentence or two.");
    setBusy("Uploading…");
    try {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("mode", mode);
      fd.set("name", name || defaultName(mode));
      fd.set("clientName", clientName);
      fd.set("clientEmail", clientEmail);
      fd.set("prompt", prompt);
      fd.set("dims", JSON.stringify(files.map((f) => ({ width: f.width, height: f.height }))));
      files.forEach((f, i) => fd.append("files", f.blob, f.name || `page-${i + 1}.png`));
      const res = await fetch("/api/projects", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      router.push(`/b/${slug}/p/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => { setMode(m.id); setFiles([]); }} className="card p-4 text-left transition" style={{ borderColor: mode === m.id ? "var(--brand)" : undefined, boxShadow: mode === m.id ? "0 0 0 1px var(--brand)" : undefined }}>
              <div className="font-semibold">{m.title}</div>
              <div className="muted text-sm mt-1">{m.desc}</div>
            </button>
          ))}
        </div>

        {mode !== "text" && (
          <label className="card p-6 flex flex-col items-center justify-center text-center cursor-pointer" style={{ borderStyle: "dashed", borderColor: dragOver ? "var(--brand)" : undefined }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}>
            <input type="file" multiple accept={mode === "blueprint" ? "image/*,application/pdf" : "image/*"} className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <div className="font-medium">{mode === "blueprint" ? "Drop floor plan pages here or click to browse" : "Drop house photos here or click to browse"}</div>
            <div className="muted text-sm mt-1">{mode === "blueprint" ? "PDF, PNG, or JPG. Multi-page PDFs are split into one image per page." : "PNG or JPG. Exterior shots from several sides help the most."}</div>
          </label>
        )}

        {files.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative card overflow-hidden aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.preview} alt="" className="w-full h-full object-cover" />
                <div className="absolute bottom-1 left-1 chip !text-[10px]">{mode === "blueprint" ? `Story ${i + 1}` : `Photo ${i + 1}`}</div>
                <button className="absolute top-1 right-1 chip hover:text-white" onClick={() => setFiles(files.filter((_, k) => k !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="label">{mode === "text" ? "Describe the home" : "Notes for the model (optional)"}</label>
          <textarea className="input min-h-28" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder={mode === "text"
              ? "Example: 2,400 sq ft single-story ranch, 4 bedrooms, 2.5 baths, open kitchen to great room, primary suite on the east side with a walk-in closet, 2-car garage, covered back porch."
              : mode === "blueprint" ? "Example: Ceilings are 10 ft on the main floor. The garage is on page 1, lower left." : "Example: Two-story colonial, about 2,800 sq ft, 4 bed 3 bath."} />
        </div>
      </div>

      <div className="card p-5 space-y-3 h-fit">
        <div className="font-semibold">Project details</div>
        <div><label className="label">Project name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName(mode)} /></div>
        <div><label className="label">Your name</label><input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} /></div>
        <div><label className="label">Email (to send you the link)</label><input className="input" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} /></div>
        {error && <div className="text-sm rounded-lg p-2" style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>{error}</div>}
        <button className="btn btn-primary w-full !py-3" disabled={!!busy || credits <= 0} onClick={submit}>
          {busy ?? "Build my 3D home"}
        </button>
        {credits <= 0 && <div className="muted text-xs">This builder has no model credits left. Ask them to top up.</div>}
        <div className="muted text-xs">Generation usually takes 1 to 3 minutes. You can review and correct the plan before walking through it.</div>
      </div>
    </div>
  );
}

function defaultName(mode: Mode) {
  return mode === "blueprint" ? "My blueprint" : mode === "photos" ? "Home from photos" : "Designed home";
}

async function prepareImage(file: File): Promise<Prepared> {
  const bmp = await createImageBitmap(file);
  // downscale very large images so uploads and model calls stay fast
  const max = 2400;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
  return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".png", width: w, height: h, preview: URL.createObjectURL(blob) };
}

async function pdfToImages(file: File): Promise<Prepared[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: Prepared[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 8); p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 2200 / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
    out.push({ blob, name: `${file.name.replace(/\.pdf$/i, "")}-p${p}.png`, width: c.width, height: c.height, preview: URL.createObjectURL(blob) });
  }
  return out;
}
