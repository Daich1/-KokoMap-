import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  setUserLocation: (loc: { lat: number; lng: number } | null) => void;
  loadSpotStatuses: (userId: string) => Promise<void>;
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
      userLocation: null,

      setRoom: (room) => set({ room }),
      clearRoom: () => set({ room: null, places: [], myRole: null, roomMembers: [] }),
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
            if (error) console.error("Failed to save spot status:", error);
          });
      },

      removeSpotStatus: (placeId) => {
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
            if (error) console.error("Failed to remove spot status:", error);
          });
      },

      setUserLocation: (loc) => set({ userLocation: loc }),

      loadSpotStatuses: async (userId) => {
        const { data, error } = await supabase
          .from("user_spot_status")
          .select("place_id, status")
          .eq("user_id", userId);
        if (error) {
          console.error("Failed to load spot statuses:", error);
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
