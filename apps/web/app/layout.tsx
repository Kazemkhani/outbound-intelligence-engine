import type { Metadata } from "next";
import "./globals.css";
import { NavSidebar } from "@/components/nav-sidebar";

export const metadata: Metadata = {
  title: "OIE — Outbound Intelligence Engine",
  description:
    "Operator control plane for the Outbound Intelligence Engine. Ranked leads, signal feed, ICP editor, approval queue and analytics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="flex min-h-screen bg-gray-50">
        <NavSidebar />
        <main id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
