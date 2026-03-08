import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import RootLayoutContent from "./layout_content";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Harvest 2026 | RPA Control",
  description: "Analytical dashboard for harvest load validation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-br" className="dark">
      <body className={`${inter.className} bg-black text-white antialiased`}>
        <RootLayoutContent>{children}</RootLayoutContent>
      </body>
    </html>
  );
}
