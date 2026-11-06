import { prisma } from "@/lib/db";
import { DEMO_MODE } from "@/lib/config";
import StartProject from "@/components/StartProject";

export const dynamic = "force-dynamic";

export default async function BuilderHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const builder = (await prisma.builder.findUnique({ where: { slug } }))!;
  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
      <div className="max-w-2xl mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">See your future home in 3D</h1>
        <p className="muted mt-3">
          {builder.welcomeText || `Upload your floor plan, share photos of a house you love, or describe what you want. ${builder.name} will turn it into a 3D model you can walk through right here in your browser.`}
        </p>
        {DEMO_MODE && <div className="chip mt-3" style={{ color: "var(--accent)" }}>Demo mode: uploads produce a sample home until an API key is configured</div>}
      </div>
      <StartProject slug={slug} credits={builder.credits} />
    </main>
  );
}
