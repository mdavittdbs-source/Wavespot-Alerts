"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getAuthedBuilder } from "@/lib/auth";
import { storeFile } from "@/lib/storage";

export async function updateBranding(formData: FormData) {
  const slug = String(formData.get("slug"));
  const builder = await getAuthedBuilder(slug);
  if (!builder) throw new Error("Not authorized");
  const logo = formData.get("logo");
  let logoUrl = builder.logoUrl;
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 2 * 1024 * 1024) throw new Error("Logo must be under 2 MB");
    const ext = logo.type === "image/svg+xml" ? "svg" : logo.type === "image/jpeg" ? "jpg" : logo.type === "image/webp" ? "webp" : "png";
    logoUrl = (await storeFile(Buffer.from(await logo.arrayBuffer()), logo.type, ext)).url;
  }
  const str = (k: string) => (String(formData.get(k) ?? "").trim() || null);
  await prisma.builder.update({
    where: { id: builder.id },
    data: {
      name: str("name") ?? builder.name,
      tagline: str("tagline"),
      website: str("website"),
      phone: str("phone"),
      email: str("email"),
      welcomeText: str("welcomeText"),
      primaryColor: String(formData.get("primaryColor") || builder.primaryColor),
      accentColor: String(formData.get("accentColor") || builder.accentColor),
      logoUrl,
    },
  });
  revalidatePath(`/b/${slug}`, "layout");
}

export async function deleteProject(formData: FormData) {
  const slug = String(formData.get("slug"));
  const builder = await getAuthedBuilder(slug);
  if (!builder) throw new Error("Not authorized");
  await prisma.project.deleteMany({ where: { id: String(formData.get("id")), builderId: builder.id } });
  revalidatePath(`/b/${slug}/dashboard`);
}
