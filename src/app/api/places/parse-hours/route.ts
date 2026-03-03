import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // 遅延初期化: ビルド時に OPENAI_API_KEY が未設定でも落ちないようにする
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API キーが設定されていません" },
      { status: 503 }
    );
  }

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey });

  const { text } = await req.json();
  if (!text?.trim()) {
    return NextResponse.json(
      { error: "テキストが指定されていません" },
      { status: 400 }
    );
  }

  const systemPrompt = `あなたは営業時間テキストをGoogle Places API形式のJSONに変換する専門家です。
必ずJSON形式のみで返答し、マークダウンや説明文は一切含めないでください。`;

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

  try {
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
      return NextResponse.json({ error: "解析に失敗しました" }, { status: 422 });
    }

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(
      {
        error: `変換に失敗しました: ${e instanceof Error ? e.message : "不明なエラー"}`,
      },
      { status: 500 }
    );
  }
}
