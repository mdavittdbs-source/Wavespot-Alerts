"use client";
import dynamic from "next/dynamic";
import type { FloorPlan } from "@/lib/plan/schema";
const Walkthrough = dynamic(() => import("@/components/Walkthrough"), { ssr: false });
export default function ViewerClient({ plan, accent }: { plan: FloorPlan; accent: string }) {
  return <div className="w-full h-full min-h-[70vh]"><Walkthrough plan={plan} accent={accent} /></div>;
}
