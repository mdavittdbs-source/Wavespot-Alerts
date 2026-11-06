"use client";
import { useState } from "react";

export default function BuyCredits({ slug, packs }: { slug: string; packs: Array<{ id: string; label: string; usd: number }> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const buy = async (pack: string) => {
    setBusy(pack);
    const r = await fetch("/api/stripe/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, pack }) });
    const d = await r.json();
    if (d.url) window.location.href = d.url; else { alert(d.error || "Checkout failed"); setBusy(null); }
  };
  return (
    <div className="space-y-2">
      {packs.map((p) => (
        <button key={p.id} className="btn btn-ghost w-full justify-between" disabled={!!busy} onClick={() => buy(p.id)}>
          <span>{p.label}</span><span>${p.usd}</span>
        </button>
      ))}
    </div>
  );
}
