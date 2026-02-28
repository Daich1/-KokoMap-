"use client";

import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import { type BusinessHours } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface BusinessHoursBadgeProps {
  businessHours?: BusinessHours | null;
  openingHoursText?: string | null;
  className?: string;
}

const DAY_NAMES = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

function parseFromText(
  text: string,
  day: number,
  currentTime: string
): { isOpen: boolean; nextChangeLabel: string } | null {
  const todayName = DAY_NAMES[day];
  const lines = text.split("\n");
  const todayLine = lines.find((l) => l.trimStart().startsWith(todayName));
  if (!todayLine) return null;

  const hoursStr = todayLine.replace(/^[^:]+:\s*/, "");

  if (/休業日|定休/.test(hoursStr)) {
    return { isOpen: false, nextChangeLabel: "定休日" };
  }
  if (/24\s*時間営業/.test(hoursStr)) {
    return { isOpen: true, nextChangeLabel: "24h" };
  }

  // "11:00〜22:00" or "11:00–22:00" or "11:00-22:00"
  const timeRegex = /(\d{1,2}):(\d{2})\s*[〜–\-]\s*(\d{1,2}):(\d{2})/g;
  let match;
  while ((match = timeRegex.exec(hoursStr)) !== null) {
    const openTime = match[1].padStart(2, "0") + match[2];
    const closeTime = match[3].padStart(2, "0") + match[4];

    if (currentTime >= openTime && currentTime < closeTime) {
      return {
        isOpen: true,
        nextChangeLabel: `〜${closeTime.slice(0, 2)}:${closeTime.slice(2)}`,
      };
    }
    if (currentTime < openTime) {
      return {
        isOpen: false,
        nextChangeLabel: `${openTime.slice(0, 2)}:${openTime.slice(2)}〜`,
      };
    }
  }

  return { isOpen: false, nextChangeLabel: "" };
}

export function BusinessHoursBadge({
  businessHours,
  openingHoursText,
  className,
}: BusinessHoursBadgeProps) {
  const now = dayjs();
  const day = now.day(); // 0 = 日曜
  const currentTime = now.format("HHmm"); // "1430" など

  let isOpen = false;
  let nextChangeLabel = "";

  if (businessHours) {
    const todayPeriods = businessHours.periods.filter(
      (p) => p.open.day === day
    );

    for (const period of todayPeriods) {
      const openTime = period.open.time;
      const closeTime = period.close?.time;

      if (!closeTime) {
        isOpen = true;
        nextChangeLabel = "24h";
        break;
      }

      if (currentTime >= openTime && currentTime < closeTime) {
        isOpen = true;
        nextChangeLabel = `〜${closeTime.slice(0, 2)}:${closeTime.slice(2)}`;
        break;
      }
    }

    if (!isOpen && todayPeriods.length > 0) {
      const nextPeriod = todayPeriods.find((p) => p.open.time > currentTime);
      if (nextPeriod) {
        const t = nextPeriod.open.time;
        nextChangeLabel = `${t.slice(0, 2)}:${t.slice(2)}〜`;
      }
    }
  } else if (openingHoursText) {
    const result = parseFromText(openingHoursText, day, currentTime);
    if (!result) return null;
    isOpen = result.isOpen;
    nextChangeLabel = result.nextChangeLabel;
  } else {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium gap-1 shrink-0",
        isOpen
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-red-50 text-red-600 border-red-200",
        className
      )}
    >
      {isOpen ? "🟢 営業中" : "🔴 営業時間外"}
      {nextChangeLabel && (
        <span className="opacity-75">{nextChangeLabel}</span>
      )}
    </Badge>
  );
}
