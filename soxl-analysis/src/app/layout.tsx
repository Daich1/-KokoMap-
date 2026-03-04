import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://soxl-analysis.vercel.app"),
  title: "SOXL 分析ダッシュボード",
  description:
    "SOXL（Direxion Daily Semiconductor Bull 3X ETF）のテクニカル分析。RSI・MACD・ボリンジャーバンド・決算・経済イベントを考慮したエントリー/回避判断。",
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "SOXL 分析",
    title: "SOXL 分析ダッシュボード",
    description:
      "SOXLのテクニカル分析とエントリー/回避判断。決算・経済イベント考慮済み。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
