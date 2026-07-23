import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// SSRF 対策: プライベート/ループバック/リンクローカル/メタデータ帯へのアクセスを拒否する。

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // ループバック
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGN)
    (a === 169 && b === 254) || // リンクローカル + クラウドメタデータ
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) || // ベンチマーク帯
    a >= 224 // マルチキャスト/予約
  );
}

function isPrivateIP(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    // IPv4射影 (::ffff:a.b.c.d)
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return (
      lower === "::" ||
      lower === "::1" || // ループバック
      lower.startsWith("fc") || // fc00::/7 ULA
      lower.startsWith("fd") ||
      lower.startsWith("fe8") || // fe80::/10 リンクローカル
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    );
  }
  return true; // 不明な形式は拒否
}

async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL の形式が不正です");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("http/https 以外のURLは指定できません");
  }
  const host = url.hostname;
  if (isIP(host)) {
    if (isPrivateIP(host)) throw new Error("このURLへはアクセスできません");
    return url;
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIP(a.address))) {
    throw new Error("このURLへはアクセスできません");
  }
  return url;
}

// 検証付き fetch。リダイレクトは手動追跡し、リダイレクト先も毎回検証する。
export async function fetchPublicUrl(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 3
): Promise<Response> {
  let current = rawUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new Error("リダイレクトが多すぎます");
}
