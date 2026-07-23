"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { supabase, type Place, type RoomMember, type SpotStatus } from "@/lib/supabase";
import { useMapStore } from "@/store/useMapStore";
import { ROLE_LABELS } from "@/lib/constants";

interface UseRealtimeRoomArgs {
  roomId: string | undefined;
  currentUserId: string;
  addMarkerRef: React.RefObject<(place: Place) => void>;
  removeMarkerRef: React.RefObject<(placeId: string) => void>;
}

// ── Supabase Realtime 購読（places / room_members / user_spot_status）──
export function useRealtimeRoom({
  roomId,
  currentUserId,
  addMarkerRef,
  removeMarkerRef,
}: UseRealtimeRoomArgs) {
  useEffect(() => {
    if (!roomId) return;
    const myId = currentUserId;

    // ── places チャンネル ──
    const placesChannel = supabase
      .channel(`room-places-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "places", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const store = useMapStore.getState();
          if (payload.eventType === "INSERT") {
            const place = payload.new as Place;
            if (place.deleted_at) return;
            store.addPlace(place);
            addMarkerRef.current?.(place);
            // 他のユーザーが追加したスポットを通知
            if (place.created_by_id !== myId) {
              toast.info(`📍 ${place.created_by_name ?? "誰か"}さんが「${place.name}」を追加しました`);
            }
          } else if (payload.eventType === "UPDATE") {
            const place = payload.new as Place;
            if (place.deleted_at) {
              store.removePlace(place.id);
              removeMarkerRef.current?.(place.id);
            } else {
              store.upsertPlace(place);
              addMarkerRef.current?.(place);
            }
          }
        }
      )
      .subscribe();

    // ── room_members チャンネル ──
    const membersChannel = supabase
      .channel(`room-members-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const store = useMapStore.getState();
          if (payload.eventType === "INSERT") {
            const member = payload.new as RoomMember;
            store.upsertRoomMember(member);
            // リーダーに参加通知
            if (store.myRole === "leader" && member.user_id !== myId) {
              toast.success(`👋 ${member.user_name}さんが参加しました`);
            }
          } else if (payload.eventType === "UPDATE") {
            const member = payload.new as RoomMember;
            store.upsertRoomMember(member);
            // 自分のロールが変わったら即時反映
            if (member.user_id === myId) {
              store.setMyRole(member.role);
              toast.info(`ロールが「${ROLE_LABELS[member.role]}」に変更されました`);
            }
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { user_id: string };
            store.removeRoomMember(old.user_id);
          }
        }
      )
      .subscribe();

    // ── user_spot_status チャンネル（全メンバーのリアクション同期）──
    // channel filter は付けない: place_id リストが動的なため貼り替えが多発する。
    // RLS 有効化後は SELECT ポリシー（同室スポットのみ可視）で WALRUS が
    // サーバー側配信を絞るため、実質「自分の所属ルーム分」だけが届く。
    // 下の store.places チェックは複数ルーム跨ぎのための二重防御。
    const statusesChannel = supabase
      .channel(`room-statuses-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_spot_status" },
        (payload) => {
          const store = useMapStore.getState();
          if (payload.eventType === "DELETE") {
            const old = payload.old as { user_id: string; place_id: string };
            store.removeMemberStatus(old.user_id, old.place_id);
          } else {
            const r = payload.new as { user_id: string; place_id: string; status: string };
            if (store.places.some((p) => p.id === r.place_id)) {
              store.setMemberStatus(r.user_id, r.place_id, r.status as SpotStatus);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(placesChannel);
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(statusesChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
}
