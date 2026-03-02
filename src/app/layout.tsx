import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://minimal-map.vercel.app"),
  title: "ココマップ (KokoMap) - みんなで作るスポットマップ",
  description:
    "URLを共有するだけで、仲間とリアルタイムにお気に入りの場所をマップにまとめられるアプリです。",
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "ココマップ (KokoMap)",
    title: "ココマップ (KokoMap) - みんなで作るスポットマップ",
    description:
      "URLを共有するだけで、仲間とリアルタイムにお気に入りの場所をマップにまとめられるアプリです。",
  },
  twitter: {
    card: "summary_large_image",
    title: "ココマップ (KokoMap) - みんなで作るスポットマップ",
    description:
      "URLを共有するだけで、仲間とリアルタイムにお気に入りの場所をマップにまとめられるアプリです。",
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
    shortcut: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ここマップ",
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
      </body>
    </html>
  );
}
