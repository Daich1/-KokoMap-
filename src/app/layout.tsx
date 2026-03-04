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
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://minimal-map.vercel.app"),
  title: "繧ｳ繧ｳ繝槭ャ繝・(KokoMap) - 縺ｿ繧薙↑縺ｧ菴懊ｋ繧ｹ繝昴ャ繝医・繝・・",
  description:
    "URL繧貞・譛峨☆繧九□縺代〒縲∽ｻｲ髢薙→繝ｪ繧｢繝ｫ繧ｿ繧､繝縺ｫ縺頑ｰ励↓蜈･繧翫・蝣ｴ謇繧偵・繝・・縺ｫ縺ｾ縺ｨ繧√ｉ繧後ｋ繧｢繝励Μ縺ｧ縺吶・,
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "繧ｳ繧ｳ繝槭ャ繝・(KokoMap)",
    title: "繧ｳ繧ｳ繝槭ャ繝・(KokoMap) - 縺ｿ繧薙↑縺ｧ菴懊ｋ繧ｹ繝昴ャ繝医・繝・・",
    description:
      "URL繧貞・譛峨☆繧九□縺代〒縲∽ｻｲ髢薙→繝ｪ繧｢繝ｫ繧ｿ繧､繝縺ｫ縺頑ｰ励↓蜈･繧翫・蝣ｴ謇繧偵・繝・・縺ｫ縺ｾ縺ｨ繧√ｉ繧後ｋ繧｢繝励Μ縺ｧ縺吶・,
  },
  twitter: {
    card: "summary_large_image",
    title: "繧ｳ繧ｳ繝槭ャ繝・(KokoMap) - 縺ｿ繧薙↑縺ｧ菴懊ｋ繧ｹ繝昴ャ繝医・繝・・",
    description:
      "URL繧貞・譛峨☆繧九□縺代〒縲∽ｻｲ髢薙→繝ｪ繧｢繝ｫ繧ｿ繧､繝縺ｫ縺頑ｰ励↓蜈･繧翫・蝣ｴ謇繧偵・繝・・縺ｫ縺ｾ縺ｨ繧√ｉ繧後ｋ繧｢繝励Μ縺ｧ縺吶・,
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
    title: "縺薙％繝槭ャ繝・,
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
