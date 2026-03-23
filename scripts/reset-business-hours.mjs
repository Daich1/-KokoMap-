// reset-business-hours.mjs
// 全スポットの business_hours を opening_hours_text から再パースし直す
// 実行: node scripts/reset-business-hours.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import OpenAI from "openai";

// .env.local を手動で読み込む
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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
    console.error("❌ 環境変数が不足しています。.env.local を確認してください。");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openaiKey });

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
        max_tokens: 512,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.periods) || !Array.isArray(parsed.weekday_text)) {
        throw new Error("periods または weekday_text が不正");
    }
    return parsed;
}

async function main() {
    // 全スポットを取得
    const { data: places, error } = await supabase
        .from("places")
        .select("id, name, opening_hours_text, business_hours")
        .is("deleted_at", null);

    if (error) {
        console.error("❌ Supabase 取得エラー:", error.message);
        process.exit(1);
    }

    console.log(`📋 スポット総数: ${places.length}`);

    const withHoursText = places.filter(
        (p) => p.opening_hours_text && p.opening_hours_text.trim()
    );
    const withoutHours = places.filter(
        (p) => !p.opening_hours_text || !p.opening_hours_text.trim()
    );

    console.log(`✅ 営業時間テキストあり: ${withHoursText.length}件 → 再パース対象`);
    console.log(`⬜ 営業時間テキストなし: ${withoutHours.length}件 → business_hours を null にリセット`);

    let successCount = 0;
    let failCount = 0;

    // business_hours テキストなし → null にリセット
    if (withoutHours.length > 0) {
        const ids = withoutHours.map((p) => p.id);
        // バッチで更新
        for (const id of ids) {
            const { error: upErr } = await supabase
                .from("places")
                .update({ business_hours: null })
                .eq("id", id);
            if (upErr) {
                console.error(`  ❌ [${id}] リセット失敗:`, upErr.message);
            }
        }
        console.log(`\n🔄 ${withoutHours.length}件の business_hours を null にリセット完了`);
    }

    // opening_hours_text あり → 再パース
    console.log("\n📝 再パース開始...\n");
    for (const place of withHoursText) {
        process.stdout.write(`  処理中: ${place.name} ... `);
        try {
            const parsed = await parseHours(place.opening_hours_text);

            // weekday_text を正規化して opening_hours_text も更新
            const normalizedText = parsed.weekday_text.join("\n");

            const { error: upErr } = await supabase
                .from("places")
                .update({
                    business_hours: parsed,
                    opening_hours_text: normalizedText,
                })
                .eq("id", place.id);

            if (upErr) {
                throw new Error(upErr.message);
            }

            console.log("✅ 完了");
            successCount++;
        } catch (e) {
            console.log(`❌ 失敗 (${e.message})`);
            failCount++;
        }

        // レート制限対策: 200ms 待機
        await new Promise((r) => setTimeout(r, 200));
    }

    console.log("\n==============================");
    console.log(`✅ 成功: ${successCount}件`);
    if (failCount > 0) console.log(`❌ 失敗: ${failCount}件`);
    console.log("==============================");
    console.log("完了！アプリをリロードして確認してください。");
}

main();
