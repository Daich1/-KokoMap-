import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 認証必須の自前 API ルート呼び出し用: Authorization ヘッダーを組み立てる
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type SpotStatus = "want_to_go" | "visited";
export type RoomRole = "leader" | "admin" | "member" | "viewer";
export type TransportMode = "WALK" | "BICYCLE" | "DRIVE" | "TRANSIT";

// マップ単位で共有される旅行設定（sql/10_trip_settings.sql）
export type RoomTripSettings = {
  room_id: string;
  trip_start_date: string | null;
  trip_days: number | null;
  default_transport_mode: TransportMode;
  updated_at?: string;
};

export type RoomMember = {
  room_id: string;
  user_id: string;
  user_name: string;
  role: RoomRole;
  joined_at: string;
};

export type PlaceComment = {
  id: string;
  place_id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
};

export type UserSpotStatus = {
  id: string;
  user_id: string;
  place_id: string;
  status: SpotStatus;
  updated_at: string;
};

export type BusinessHourPeriod = {
  open: { day: number; time: string };
  close: { day: number; time: string };
};

export type BusinessHours = {
  open_now: boolean;
  periods: BusinessHourPeriod[];
  weekday_text: string[];
};

export type Room = {
  id: string;
  share_code: string;
  name: string | null;
  is_open: boolean;
  created_at: string;
  // 公開閲覧リンク用トークン（sql/08 適用後に存在。null = 非公開）
  public_token?: string | null;
};

export type Place = {
  id: string;
  name: string;
  address: string | null;
  note: string | null;
  tags: string[] | null;
  categories: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  duration: string | null;
  image_urls: string[] | null;
  lat: number;
  lng: number;
  created_at: string;
  room_id: string | null;
  deleted_at: string | null;
  created_by_name: string | null;
  created_by_id: string | null;
  business_hours: BusinessHours | null;
  opening_hours_text: string | null;
  plan_day: number | null;
  plan_order: number | null;
  plan_time: string | null;
};
