import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { APP_URL } from "@/lib/config";
import { safeParseFloorPlan } from "@/lib/plan/schema";
import ProjectWorkspace from "@/components/ProjectWorkspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, include: { builder: true } });
  if (!project || project.builder.slug !== slug) notFound();
  const parsed = project.plan ? safeParseFloorPlan(JSON.parse(project.plan)) : null;
  return (
    <ProjectWorkspace
      initial={{
        id: project.id,
        slug,
        name: project.name,
        status: project.status,
        error: project.error,
        mode: project.mode,
        plan: parsed?.success ? parsed.data : null,
        shareUrl: `${APP_URL}/view/${project.shareId}`,
        accent: project.builder.accentColor,
      }}
    />
  );
}
