import { prisma } from "@/lib/db";
import { extractFromBlueprints, extractFromPhotos, extractFromText } from "./extract";

/** Runs extraction for a project and stores the result. Safe to call again on failure. */
export async function runExtraction(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { images: { orderBy: { order: "asc" } } } });
  if (!project) return;
  try {
    const plan =
      project.mode === "text"
        ? await extractFromText(project.prompt ?? "")
        : project.mode === "photos"
          ? await extractFromPhotos(project.images, project.prompt)
          : await extractFromBlueprints(project.images, project.prompt);
    await prisma.project.update({ where: { id: projectId }, data: { status: "ready", plan: JSON.stringify(plan), error: null } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[extract ${projectId}]`, msg);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed", error: msg } });
  }
}
