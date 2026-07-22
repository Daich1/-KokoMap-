import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
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
  themeColor: "#008f81",
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
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* テーマを描画前に適用して FOUC を防ぐ */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <InstallPrompt />
        <ServiceWorkerRegister />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
