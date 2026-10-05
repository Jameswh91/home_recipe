import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Home recipe", description: "Recipe import and meal plan" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="topnav" aria-label="Main">
          <Link href="/">Import</Link>
          <Link href="/plan">Plan</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
