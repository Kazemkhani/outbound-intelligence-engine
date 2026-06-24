import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { NavSidebar } from "@/components/nav-sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Huscribe Revenue OS",
  description:
    "The Huscribe Revenue OS control plane: discover, enrich, qualify by voice, score, and close, governed end to end by a human approval gate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body className="flex min-h-screen font-sans">
        <NavSidebar />
        <main id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
