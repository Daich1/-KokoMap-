import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { token, message } = await request.json();

    if (!token || !message) {
      return NextResponse.json({ error: "token と message は必須です" }, { status: 400 });
    }

    const response = await fetch("https://notify-api.line.me/api/notify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ message }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: `LINE通知失敗: ${response.status} ${text}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
