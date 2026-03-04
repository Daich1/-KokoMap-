import dayjs from "dayjs";
import { type BusinessHours } from "@/lib/supabase";

const DAY_NAMES = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

function parseOpenFromText(
  text: string,
  day: number,
  currentTime: string
): boolean | null {
  const todayName = DAY_NAMES[day];
  const lines = text.split("\n");
  const todayLine = lines.find((l) => l.trimStart().startsWith(todayName));
  if (!todayLine) return null;

  const hoursStr = todayLine.replace(/^[^:]+:\s*/, "");

  if (/休業日|定休/.test(hoursStr)) return false;
  if (/24\s*時間営業/.test(hoursStr)) return true;

  const timeRegex = /(\d{1,2}):(\d{2})\s*[〜–\-]\s*(\d{1,2}):(\d{2})/g;
  let match;
  while ((match = timeRegex.exec(hoursStr)) !== null) {
    const openTime = match[1].padStart(2, "0") + match[2];
    const closeTime = match[3].padStart(2, "0") + match[4];
    // 日付をまたぐ深夜営業（例: 22:00〜02:00）の判定
    const isOvernight = closeTime < openTime;
    if (isOvernight) {
      if (currentTime >= openTime || currentTime < closeTime) return true;
    } else {
      if (currentTime >= openTime && currentTime < closeTime) return true;
    }
  }
  return false;
}

/**
 * 現在時刻にスポットが営業中かどうかを返す。
 * - true  : 営業中
 * - false : 営業時間外
 * - null  : 営業時間情報なし（フィルター対象外）
 */
export function isPlaceOpenNow(
  businessHours: BusinessHours | null | undefined,
  openingHoursText: string | null | undefined
): boolean | null {
  const now = dayjs();
  const day = now.day(); // 0 = 日曜
  const currentTime = now.format("HHmm"); // "1430" 形式

  if (businessHours) {
    // 前日から日付をまたいで営業中の期間をチェック（例: 土 22:00〜日 02:00）
    const yesterdayDay = (day + 6) % 7;
    for (const period of businessHours.periods) {
      if (period.open.day === yesterdayDay && period.close?.day === day) {
        const closeTime = period.close.time;
        if (currentTime < closeTime) return true;
      }
    }

    const todayPeriods = businessHours.periods.filter(
      (p) => p.open.day === day
    );
    if (todayPeriods.length === 0) return false;

    for (const period of todayPeriods) {
      const openTime = period.open.time;
      const closeTime = period.close?.time;
      if (!closeTime) return true; // 24h 営業
      if (currentTime >= openTime && currentTime < closeTime) return true;
    }
    return false;
  }

  if (openingHoursText) {
    return parseOpenFromText(openingHoursText, day, currentTime);
  }

  return null;
}
