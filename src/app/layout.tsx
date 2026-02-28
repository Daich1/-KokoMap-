import type { Metadata } from "next";
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
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
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
