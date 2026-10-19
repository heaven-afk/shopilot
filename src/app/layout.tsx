import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Shopilot — Your business, in view",
  description: "Inventory, sales and useful insights for growing shops.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#123c32" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
