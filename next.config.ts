import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "yxrvesnqmetogkmupkls.supabase.co",
      },
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
      {
        // Google Photos / Google User Content (lh3, fife, 等すべてのサブドメイン)
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "streetviewpixels-pa.googleapis.com",
      },
    ],
  },
};

export default nextConfig;
