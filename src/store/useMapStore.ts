import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { type Place, type Room, type SpotStatus, type RoomRole, type RoomMember, supabase } from "@/lib/supabase";

export interface CurrentUser {
  id: string;
  name: string;
}

interface MapStore {
  places: Place[];
  room: Room | null;
  currentUser: CurrentUser;
  myRole: RoomRole | null;
  roomMembers: RoomMember[];
  spotStatuses: Record<string, SpotStatus>;
  // 全メンバーのステータス: userId → placeId → status
  allMemberStatuses: Record<string, Record<string, SpotStatus>>;
  userLocation: { lat: number; lng: number } | null;

  setRoom: (room: Room) => void;
  clearRoom: () => void;
  setMyRole: (role: RoomRole | null) => void;
  setRoomMembers: (members: RoomMember[]) => void;
  upsertRoomMember: (member: RoomMember) => void;
  removeRoomMember: (userId: string) => void;
  setPlaces: (places: Place[]) => void;
  addPlace: (place: Place) => void;
  upsertPlace: (place: Place) => void;
  removePlace: (id: string) => void;
  setCurrentUser: (user: CurrentUser) => void;

  setSpotStatus: (placeId: string, status: SpotStatus) => void;
  removeSpotStatus: (placeId: string) => void;
  setMemberStatus: (userId: string, placeId: string, status: SpotStatus) => void;
  removeMemberStatus: (userId: string, placeId: string) => void;
  loadAllMemberStatuses: (placeIds: string[]) => Promise<void>;
  setUserLocation: (loc: { lat: number; lng: number } | null) => void;
  loadSpotStatuses: (userId: string) => Promise<void>;

  // 旅行設定（マップ単位でDB共有 / sql/10_trip_settings.sql）
  tripStartDate: string | null;
  tripDays: number | null;
  defaultTransportMode: TransportMode;
  setTripStartDate: (date: string | null) => void;
  setTripDays: (days: number | null) => void;
  setDefaultTransportMode: (mode: TransportMode) => void;
  // DBからの読み込み / Realtime 反映（再永続化しない）
  loadTripSettings: (roomId: string) => Promise<void>;
  applyTripSettings: (settings: Partial<TripSettings>) => void;
}

type TransportMode = "WALK" | "BICYCLE" | "DRIVE" | "TRANSIT";
type TripSettings = {
  tripStartDate: string | null;
  tripDays: number | null;
  defaultTransportMode: TransportMode;
};

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// 旅行設定をDBへ楽観的に反映。失敗時は rollback を呼んで元に戻す。
function persistTripSettings(
  roomId: string | undefined,
  patch: Partial<{
    trip_start_date: string | null;
    trip_days: number | null;
    default_transport_mode: TransportMode;
  }>,
  rollback: () => void,
) {
  if (!roomId) return;
  supabase
    .from("room_trip_settings")
    .upsert(
      { room_id: roomId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "room_id" },
    )
    .then(({ error }) => {
      if (error) {
        console.error("Failed to save trip settings:", error);
        toast.error("旅行設定の保存に失敗しました");
        rollback();
      }
    });
}

export const useMapStore = create<MapStore>()(
  persist(
    (set, get) => ({
      places: [],
      room: null,
      currentUser: { id: generateId(), name: "" },
      myRole: null,
      roomMembers: [],
      spotStatuses: {},
      allMemberStatuses: {},
      userLocation: null,
      tripStartDate: null,
      tripDays: null,
      defaultTransportMode: "WALK" as const,

      setRoom: (room) => set({ room }),
      clearRoom: () => set({ room: null, places: [], myRole: null, roomMembers: [], allMemberStatuses: {} }),
      setMyRole: (role) => set({ myRole: role }),
      setRoomMembers: (members) => set({ roomMembers: members }),
      upsertRoomMember: (member) =>
        set((state) => {
          const exists = state.roomMembers.some((m) => m.user_id === member.user_id);
          return {
            roomMembers: exists
              ? state.roomMembers.map((m) => (m.user_id === member.user_id ? member : m))
              : [...state.roomMembers, member],
          };
        }),
      removeRoomMember: (userId) =>
        set((state) => ({
          roomMembers: state.roomMembers.filter((m) => m.user_id !== userId),
        })),

      setPlaces: (places) => set({ places }),

      // 重複チェック付き追加
      addPlace: (place) =>
        set((state) => {
          if (state.places.some((p) => p.id === place.id)) return state;
          return { places: [place, ...state.places] };
        }),

      upsertPlace: (place) =>
        set((state) => ({
          places: state.places.map((p) => (p.id === place.id ? place : p)),
        })),

      removePlace: (id) =>
        set((state) => ({
          places: state.places.filter((p) => p.id !== id),
        })),

      setCurrentUser: (user) => set({ currentUser: user }),

      // ── ステータス管理 ──────────────────────────────────────────
      setSpotStatus: (placeId, status) => {
        // 楽観更新：失敗時に戻せるよう元の値を保持
        const prev = get().spotStatuses[placeId] ?? null;
        set((state) => ({
          spotStatuses: { ...state.spotStatuses, [placeId]: status },
        }));
        const { currentUser } = get();
        supabase
          .from("user_spot_status")
          .upsert(
            {
              user_id: currentUser.id,
              place_id: placeId,
              status,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,place_id" }
          )
          .then(({ error }) => {
            if (error) {
              console.error("Failed to save spot status:", error);
              toast.error("ステータスの保存に失敗しました");
              // ロールバック
              set((state) => {
                const next = { ...state.spotStatuses };
                if (prev) next[placeId] = prev;
                else delete next[placeId];
                return { spotStatuses: next };
              });
            }
          });
      },

      removeSpotStatus: (placeId) => {
        // 楽観更新：失敗時に戻せるよう元の値を保持
        const prev = get().spotStatuses[placeId] ?? null;
        set((state) => {
          const next = { ...state.spotStatuses };
          delete next[placeId];
          return { spotStatuses: next };
        });
        const { currentUser } = get();
        supabase
          .from("user_spot_status")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("place_id", placeId)
          .then(({ error }) => {
            if (error) {
              console.error("Failed to remove spot status:", error);
              toast.error("ステータスの解除に失敗しました");
              // ロールバック
              if (prev) {
                set((state) => ({
                  spotStatuses: { ...state.spotStatuses, [placeId]: prev },
                }));
              }
            }
          });
      },

      setMemberStatus: (userId, placeId, status) =>
        set((state) => ({
          allMemberStatuses: {
            ...state.allMemberStatuses,
            [userId]: { ...state.allMemberStatuses[userId], [placeId]: status },
          },
        })),

      removeMemberStatus: (userId, placeId) =>
        set((state) => {
          const next = { ...state.allMemberStatuses[userId] };
          delete next[placeId];
          return { allMemberStatuses: { ...state.allMemberStatuses, [userId]: next } };
        }),

      loadAllMemberStatuses: async (placeIds) => {
        if (placeIds.length === 0) return;
        const { data, error } = await supabase
          .from("user_spot_status")
          .select("user_id, place_id, status")
          .in("place_id", placeIds);
        if (error) {
          console.error("Failed to load all member statuses:", error);
          toast.error("メンバーのステータス読み込みに失敗しました");
          return;
        }
        const grouped: Record<string, Record<string, SpotStatus>> = {};
        data?.forEach((r: { user_id: string; place_id: string; status: string }) => {
          grouped[r.user_id] ??= {};
          grouped[r.user_id][r.place_id] = r.status as SpotStatus;
        });
        set({ allMemberStatuses: grouped });
      },

      setUserLocation: (loc) => set({ userLocation: loc }),

      // ── 旅行設定（DB共有・楽観更新）─────────────────────────────
      setTripStartDate: (date) => {
        const prev = get().tripStartDate;
        set({ tripStartDate: date });
        persistTripSettings(get().room?.id, { trip_start_date: date }, () =>
          set({ tripStartDate: prev }),
        );
      },
      setTripDays: (days) => {
        const prev = get().tripDays;
        set({ tripDays: days });
        persistTripSettings(get().room?.id, { trip_days: days }, () =>
          set({ tripDays: prev }),
        );
      },
      setDefaultTransportMode: (mode) => {
        const prev = get().defaultTransportMode;
        set({ defaultTransportMode: mode });
        persistTripSettings(get().room?.id, { default_transport_mode: mode }, () =>
          set({ defaultTransportMode: prev }),
        );
      },

      applyTripSettings: (settings) => set(settings),

      loadTripSettings: async (roomId) => {
        const { data, error } = await supabase
          .from("room_trip_settings")
          .select("trip_start_date, trip_days, default_transport_mode")
          .eq("room_id", roomId)
          .maybeSingle();
        if (error) {
          console.error("Failed to load trip settings:", error);
          return;
        }
        set({
          tripStartDate: data?.trip_start_date ?? null,
          tripDays: data?.trip_days ?? null,
          defaultTransportMode: (data?.default_transport_mode as TransportMode) ?? "WALK",
        });
      },

      loadSpotStatuses: async (userId) => {
        const { data, error } = await supabase
          .from("user_spot_status")
          .select("place_id, status")
          .eq("user_id", userId);
        if (error) {
          console.error("Failed to load spot statuses:", error);
          toast.error("ステータスの読み込みに失敗しました");
          return;
        }
        if (data) {
          const statuses: Record<string, SpotStatus> = {};
          data.forEach((row: { place_id: string; status: string }) => {
            statuses[row.place_id] = row.status as SpotStatus;
          });
          set({ spotStatuses: statuses });
        }
      },
    }),
    {
      name: "minimal-map-store",
      partialize: (state) => ({
        room: state.room,
        currentUser: state.currentUser,
        myRole: state.myRole,
        spotStatuses: state.spotStatuses,
      }),
    }
  )
);
