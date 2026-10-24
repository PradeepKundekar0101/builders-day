import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./provn-theme.css";
import "./style.css";
const inter = Inter({ variable: "--font-studio", subsets: ["latin"], style: ["normal", "italic"] });
export const metadata = { title: "PROVN | Cost workspace" };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
