import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { SiteHeader } from "@/app/components/SiteHeader";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tryb Studios — Outbound",
  description:
    "B2B outbound for e-commerce, F&B, and hospitality: search, AI pitches, email, and logged results in one dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${manrope.variable}`}>
      <body>
        <SiteHeader />
        {children}
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            paddingBlock: "2rem",
            marginTop: "2rem",
          }}
        >
          <div className="container muted" style={{ fontSize: "0.88rem" }}>
            Tryb Studios
          </div>
        </footer>
      </body>
    </html>
  );
}
