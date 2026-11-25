import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "TradeMind AI · Stocks & Crypto Trading Intelligence",
  description:
    "Autonomous AI trading platform: 12 specialized agents, paper and live trading for stocks and crypto, strategy laboratory, and a voice assistant.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TradeMind",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/icon-512.png",
    icon: "/icons/icon-512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
