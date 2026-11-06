import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";

/**
 * File storage adapter. Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set,
 * otherwise writes to ./data/uploads and serves through /api/files/[name].
 */
export type StoredFile = { url: string };

const LOCAL_DIR = path.join(process.cwd(), "data", "uploads");

export async function storeFile(buffer: Buffer, contentType: string, ext: string): Promise<StoredFile> {
  const name = `${Date.now()}-${nanoid(10)}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const res = await put(`uploads/${name}`, buffer, { access: "public", contentType });
    return { url: res.url };
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, name), buffer);
  return { url: `/api/files/${name}` };
}

export async function readLocalFile(name: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!/^[\w.-]+$/.test(name)) return null;
  try {
    const buffer = await fs.readFile(path.join(LOCAL_DIR, name));
    const ext = name.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "application/octet-stream";
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/** Fetch a stored image back as base64 for the model, whichever backend holds it. */
export async function loadImageBase64(url: string): Promise<{ data: string; mediaType: "image/png" | "image/jpeg" | "image/webp" }> {
  if (url.startsWith("/api/files/")) {
    const f = await readLocalFile(url.replace("/api/files/", ""));
    if (!f) throw new Error("Stored file not found");
    return { data: f.buffer.toString("base64"), mediaType: f.contentType as "image/png" | "image/jpeg" | "image/webp" };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image: ${res.status}`);
  const ct = (res.headers.get("content-type") ?? "image/png").split(";")[0] as "image/png" | "image/jpeg" | "image/webp";
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString("base64"), mediaType: ct };
}
