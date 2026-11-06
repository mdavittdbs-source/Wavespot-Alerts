import { cookies } from "next/headers";
import { prisma } from "./db";

export const ADMIN_COOKIE = "pw_admin";
export const BUILDER_COOKIE = "pw_builder";

export function adminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

export async function isAdmin() {
  const c = await cookies();
  return adminPassword() !== "" && c.get(ADMIN_COOKIE)?.value === adminPassword();
}

/** A builder is authenticated by their adminKey, either in the cookie or ?key= */
export async function getAuthedBuilder(slug: string, keyFromQuery?: string | null) {
  const builder = await prisma.builder.findUnique({ where: { slug } });
  if (!builder) return null;
  const c = await cookies();
  const key = keyFromQuery || c.get(`${BUILDER_COOKIE}_${slug}`)?.value;
  if (key && key === builder.adminKey) return builder;
  return null;
}
