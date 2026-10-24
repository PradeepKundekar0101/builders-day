import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";
import "./cinematic.css";

const inter = Inter({ variable: "--font-schibsted", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PROVN",
  description:
    "Tell us your idea, see what it costs before you spend a rupee, approve it, and we build and deploy it securely.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
