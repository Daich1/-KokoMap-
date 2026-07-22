import { NextRequest, NextResponse } from "next/server";

const TRAVEL_MODES = ["DRIVE", "WALK", "BICYCLE", "TRANSIT"] as const;
type TravelMode = (typeof TRAVEL_MODES)[number];

type DirStep =
  | { type: "WALK"; durationSeconds: number; distanceMeters: number }
  | {
      type: "TRANSIT";
      durationSeconds: number;
      lineName: string;
      lineShortName?: string;
      color?: string;
      textColor?: string;
      vehicleType?: string;
      departureStop: string;
      arrivalStop: string;
      departureTime?: string;
      arrivalTime?: string;
      stopCount: number;
      headsign?: string;
    };

function parseDurationSeconds(value: unknown): number {
  // Routes API は "123s" 形式で返す
  if (typeof value === "string") return parseInt(value, 10) || 0;
  if (typeof value === "number") return value;
  return 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildTransitSteps(route: any): DirStep[] {
  const steps: DirStep[] = [];
  for (const leg of route?.legs ?? []) {
    for (const step of leg?.steps ?? []) {
      const td = step?.transitDetails;
      if (td) {
        const line = td.transitLine ?? {};
        steps.push({
          type: "TRANSIT",
          durationSeconds: parseDurationSeconds(step.staticDuration),
          lineName: line.name ?? line.nameShort ?? "路線",
          lineShortName: line.nameShort ?? undefined,
          color: line.color ?? undefined,
          textColor: line.textColor ?? undefined,
          vehicleType: line.vehicle?.type ?? undefined,
          departureStop: td.stopDetails?.departureStop?.name ?? "",
          arrivalStop: td.stopDetails?.arrivalStop?.name ?? "",
          departureTime: td.stopDetails?.departureTime ?? undefined,
          arrivalTime: td.stopDetails?.arrivalTime ?? undefined,
          stopCount: td.stopCount ?? 0,
          headsign: td.headsign ?? undefined,
        });
      } else if (step?.travelMode === "WALK") {
        const dur = parseDurationSeconds(step.staticDuration);
        // 距離ゼロ・時間ゼロの微小な徒歩ステップは省略
        if (dur > 0 || (step.distanceMeters ?? 0) > 0) {
          steps.push({
            type: "WALK",
            durationSeconds: dur,
            distanceMeters: step.distanceMeters ?? 0,
          });
        }
      }
    }
  }
  return steps;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { originLat, originLng, destLat, destLng, mode, timeMode, time } =
    body as {
      originLat?: number;
      originLng?: number;
      destLat?: number;
      destLng?: number;
      mode?: string;
      timeMode?: "departure" | "arrival";
      time?: string; // RFC3339
    };

  if (
    typeof originLat !== "number" ||
    typeof originLng !== "number" ||
    typeof destLat !== "number" ||
    typeof destLng !== "number" ||
    !TRAVEL_MODES.includes(mode as TravelMode)
  ) {
    return NextResponse.json(null, { status: 400 });
  }

  const isTransit = mode === "TRANSIT";

  const key =
    process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const fieldMask = isTransit
    ? "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline," +
      "routes.legs.steps.travelMode,routes.legs.steps.transitDetails," +
      "routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters"
    : "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline";

  const requestBody: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
    destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
    travelMode: mode,
  };

  if (isTransit) {
    // TRANSIT では routingPreference を付けない。時刻は片方のみ指定可。
    if (time) {
      if (timeMode === "arrival") requestBody.arrivalTime = time;
      else requestBody.departureTime = time;
    }
  }

  try {
    const res = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key ?? "",
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return NextResponse.json(null, { status: 404 });

    return NextResponse.json({
      durationSeconds: parseDurationSeconds(route.duration),
      distanceMeters: route.distanceMeters ?? 0,
      polyline: route.polyline?.encodedPolyline ?? null,
      ...(isTransit ? { steps: buildTransitSteps(route) } : {}),
    });
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
