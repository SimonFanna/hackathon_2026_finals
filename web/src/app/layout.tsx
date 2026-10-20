import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";

// Museo Sans (KBC's typeface) is commercial and never shipped; Nunito Sans is the closest free match.
const nunito = Nunito_Sans({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "KBC · From intent to done",
  description: "Kate spots a life moment and turns it into one guided journey across KBC and its partners. You approve every step.",
};

export const viewport: Viewport = { themeColor: "#021e43" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
