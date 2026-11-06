import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Top-Up Simulator",
  description: "Practice MRT top-up simulator for Grace Orchard School",
};

// No next/font/google here: it downloads at build time and the laptop may be offline.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full bg-neutral-900 antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
