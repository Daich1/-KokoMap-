"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, type Room } from "@/lib/supabase";
import { useMapStore } from "@/store/useMapStore";

// ── Supabase Auth セッション管理 + 所属マップの復元 ─────────────────────
// onRoomMissing: 所属マップがひとつも無いときに呼ばれる（参加ダイアログを開く用）
export function useAuthSession(onRoomMissing: () => void) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // DBからユーザーの所属マップを復元または検証
  const restoreUserRoom = useCallback(async (userId: string) => {
    try {
      // 現在のストアのマップが有効か確認
      const currentRoom = useMapStore.getState().room;
      let targetRoomId: string | null = null;

      if (currentRoom) {
        const { data: check } = await supabase
          .from("room_members")
          .select("room_id, role")
          .eq("user_id", userId)
          .eq("room_id", currentRoom.id)
          .maybeSingle();
        if (check) {
          targetRoomId = currentRoom.id;
          // ロールも復元
          if (check.role) useMapStore.getState().setMyRole(check.role);
        }
      }

      // 無効な場合は最新の所属マップを取得
      if (!targetRoomId) {
        const { data: latest } = await supabase
          .from("room_members")
          .select("room_id, role, rooms(*)")
          .eq("user_id", userId)
          .order("joined_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest && latest.rooms) {
          // Supabaseの型定義によっては配列になる場合があるための安全策
          const roomObj = Array.isArray(latest.rooms) ? latest.rooms[0] : latest.rooms;
          useMapStore.getState().setRoom(roomObj as unknown as Room);
          // ロールも復元
          if (latest.role) useMapStore.getState().setMyRole(latest.role);
          targetRoomId = latest.room_id;
        } else {
          // 所属マップなし
          useMapStore.getState().clearRoom();
          onRoomMissing();
        }
      }
    } catch (e) {
      console.error("Failed to restore room:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const applyUser = (user: User | null) => {
      setAuthUser(user);
      if (user) {
        const userName = user.user_metadata?.username ?? user.email?.split("@")[0] ?? "";
        useMapStore.getState().setCurrentUser({ id: user.id, name: userName });
        restoreUserRoom(user.id);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      applyUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [restoreUserRoom]);

  return { authUser, setAuthUser, authLoading, restoreUserRoom };
}
