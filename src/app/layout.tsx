import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Great_Vibes } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const sans = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be",
  display: "swap",
});

const script = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-script",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MoMo Vinh danh",
  description: "Booth vinh danh nhân sự gắn bó cùng MoMo",
};

export const viewport: Viewport = {
  themeColor: "#e21878",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${sans.variable} ${script.variable}`}>{children}</body>
    </html>
  );
}
