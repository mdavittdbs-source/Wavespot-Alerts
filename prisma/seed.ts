import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
const prisma = new PrismaClient();
async function main() {
  const demo = await prisma.builder.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "Demo Custom Homes",
      tagline: "See it before we build it",
      primaryColor: "#1d4ed8",
      accentColor: "#f59e0b",
      credits: 100,
      adminKey: nanoid(24),
    },
  });
  console.log(`Demo builder ready: /b/demo  (dashboard: /b/demo/login?key=${demo.adminKey})`);
}
main().finally(() => prisma.$disconnect());
