// retry-failures.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import OpenAI from "openai";

const envFile = readFileSync(".env.local", "utf-8");
const env = Object.fromEntries(
    envFile
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => {
            const idx = l.indexOf("=");
            const key = l.slice(0, idx).trim();
            const val = l.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
            return [key, val];
        })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const systemPrompt = `あなたは営業時間テキストをGoogle Places API形式のJSONに変換する専門家です。
必ずJSON形式のみで返答し、マークダウンや説明文は一切含めないでください。`;

async function parseHours(text) {
    const userPrompt = `以下の営業時間テキストを、Google Places APIのbusiness_hours形式のJSONに変換してください。

JSONスキーマ:
{
  "open_now": false,
  "periods": [
    { "open": { "day": 1, "time": "1100" }, "close": { "day": 1, "time": "2200" } }
  ],
  "weekday_text": [
    "日曜日: 定休日",
    "月曜日: 11:00〜22:00",
    "火曜日: 11:00〜22:00",
    "水曜日: 11:00〜22:00",
    "木曜日: 11:00〜22:00",
    "金曜日: 11:00〜22:00",
    "土曜日: 11:00〜22:00"
  ]
}

ルール:
- day は 0=日曜, 1=月曜, 2=火曜, 3=水曜, 4=木曜, 5=金曜, 6=土曜
- time は "HHMM" 形式（例: "1100", "2200"）
- 定休日・休業日の曜日は periods に含めない
- 24時間営業の場合は close を省略（フィールド自体を含めない）
- open_now は常に false にする
- weekday_text は日曜〜土曜の順で7要素必ず含める
- 営業時間が不明な曜日は "不明" と記載する

営業時間テキスト:
${text}`;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    return JSON.parse(raw);
}

async function main() {
    const { data: places, error } = await supabase
        .from("places")
        .select("id, name, opening_hours_text")
        .is("deleted_at", null)
        .filter("business_hours", "is", null);

    if (error) {
        console.error(error);
        return;
    }

    const targets = places.filter(p => p.opening_hours_text && p.opening_hours_text.trim());
    console.log(`Retrying ${targets.length} targets...`);

    for (const place of targets) {
        console.log(`Processing ${place.name}...`);
        try {
            const parsed = await parseHours(place.opening_hours_text);
            const normalizedText = parsed.weekday_text.join("\n");

            const { error: upErr } = await supabase
                .from("places")
                .update({
                    business_hours: parsed,
                    opening_hours_text: normalizedText,
                })
                .eq("id", place.id);

            if (upErr) throw new Error(upErr.message);
            console.log(`✅ Success: ${place.name}`);
        } catch (e) {
            console.error(`❌ Failed: ${place.name} (${e.message})`);
        }
    }
}

main();
