import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// HTML から OGP + 本文テキストを抽出するユーティリティ
function extractTextFromHtml(html: string): string {
  // OGP メタタグを優先抽出
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const ogAddress = html.match(/<meta[^>]+property=["']og:street-address["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";

  // <script>, <style>, <nav>, <header>, <footer> を除去してから本文テキストを取得
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const ogSection = [ogTitle, ogDesc, ogAddress].filter(Boolean).join("\n");
  const combined = [ogSection, stripped].filter(Boolean).join("\n\n");

  // トークン節約のため 8000 文字に制限
  return combined.slice(0, 8000);
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url?.trim()) {
    return NextResponse.json({ error: "URL が指定されていません" }, { status: 400 });
  }

  // ── 1. URLのページを取得 ──────────────────────────
  let pageText = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept-Language": "ja,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    pageText = extractTextFromHtml(html);
  } catch (e) {
    return NextResponse.json(
      { error: `ページを取得できませんでした: ${e instanceof Error ? e.message : "不明なエラー"}` },
      { status: 422 }
    );
  }

  if (!pageText.trim()) {
    return NextResponse.json(
      { error: "ページの内容を読み取れませんでした" },
      { status: 422 }
    );
  }

  // ── 2. OpenAI で構造化抽出 ───────────────────────
  const systemPrompt = `あなたはWebページから店舗・スポット情報を抽出する専門家です。
与えられたテキストから以下のJSONスキーマで情報を抽出してください。
不明・記載なしの項目は null にしてください。

抽出ルール:
- categories: 日本語の配列（例: ["レストラン", "イタリアン"]）
- budget: 数値（円）で返す（例: "〜3,000円" → budget_max: 3000）
- address: 都道府県から始まる完全な日本語住所（例: 東京都港区芝公園4-2-8）。郵便番号・国名は含めない
- opening_hours_text: 全曜日を「月曜日: 11:00〜22:00」形式で改行区切りで返す。定休日は「月曜日: 定休日」、24時間は「月曜日: 24時間営業」、情報がなければ null

必ずJSON形式のみで返答し、マークダウンや説明文は一切含めないでください。`;

  const userPrompt = `以下のWebページのテキストから店舗・スポット情報を抽出してJSON形式で返してください。

JSONスキーマ:
{
  "name": string | null,
  "address": string | null,
  "budget_min": number | null,
  "budget_max": number | null,
  "categories": string[],
  "opening_hours_text": string | null,
  "note": string | null
}

Webページのテキスト:
${pageText}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 800,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const extracted = JSON.parse(raw);

    return NextResponse.json(extracted);
  } catch (e) {
    return NextResponse.json(
      { error: `AI 抽出に失敗しました: ${e instanceof Error ? e.message : "不明なエラー"}` },
      { status: 500 }
    );
  }
}
