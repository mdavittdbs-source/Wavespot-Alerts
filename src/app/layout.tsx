import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} · 3D home walkthroughs from blueprints`,
  description: "Turn blueprints, photos, or a description into a walkable 3D model of a home.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
