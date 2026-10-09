import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sefer Entry Prep",
  description: "Shipment documents in, NetCHB entry XML and broker findings out.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Loaded at runtime, so builds need no network; system fonts are the fallback. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
