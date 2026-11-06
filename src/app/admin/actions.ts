"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { ADMIN_COOKIE, adminPassword, isAdmin } from "@/lib/auth";

export async function adminLogin(formData: FormData) {
  const pw = String(formData.get("password") ?? "");
  if (adminPassword() && pw === adminPassword()) {
    const c = await cookies();
    c.set(ADMIN_COOKIE, pw, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  revalidatePath("/admin");
}

export async function adminLogout() {
  const c = await cookies();
  c.delete(ADMIN_COOKIE);
  revalidatePath("/admin");
}

export async function createBuilder(formData: FormData) {
  if (!(await isAdmin())) throw new Error("Not authorized");
  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim() || name;
  const slug = slugRaw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!name || !slug) throw new Error("Name and slug are required");
  await prisma.builder.create({
    data: {
      name,
      slug,
      tagline: String(formData.get("tagline") ?? "") || null,
      primaryColor: String(formData.get("primaryColor") ?? "#1d4ed8"),
      accentColor: String(formData.get("accentColor") ?? "#f59e0b"),
      credits: Number(formData.get("credits") ?? 5),
      adminKey: nanoid(24),
    },
  });
  revalidatePath("/admin");
}

export async function addCredits(formData: FormData) {
  if (!(await isAdmin())) throw new Error("Not authorized");
  const id = String(formData.get("id"));
  const n = Number(formData.get("credits") ?? 0);
  await prisma.builder.update({ where: { id }, data: { credits: { increment: n } } });
  revalidatePath("/admin");
}

export async function deleteBuilder(formData: FormData) {
  if (!(await isAdmin())) throw new Error("Not authorized");
  await prisma.builder.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/admin");
}
