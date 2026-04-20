"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Check, Plus, Loader2, Map } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase, type Room, type RoomRole } from "@/lib/supabase";
import { useMapStore } from "@/store/useMapStore";
import { cn } from "@/lib/utils";

interface UserRoom {
  room: Room;
  role: RoomRole;
}

interface RoomSwitcherProps {
  onAddRoom: () => void;
  className?: string;
}

export function RoomSwitcher({ onAddRoom, className }: RoomSwitcherProps) {
  const { room, currentUser, setRoom, setMyRole, setRoomMembers, setPlaces } = useMapStore();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<UserRoom[]>([]);
  const [loading, setLoading] = useState(false);

  // ポップアップが開いた時だけフェッチ
  useEffect(() => {
    if (!open || !currentUser.id) return;
    setLoading(true);
    supabase
      .from("room_members")
      .select("role, rooms(*)")
      .eq("user_id", currentUser.id)
      .then(({ data }) => {
        if (data) {
          const result = data
            .map((row) => {
              const r = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms;
              return r ? { room: r as Room, role: row.role as RoomRole } : null;
            })
            .filter(Boolean) as UserRoom[];
          // 新しい順
          result.sort(
            (a, b) =>
              new Date(b.room.created_at).getTime() -
              new Date(a.room.created_at).getTime()
          );
          setRooms(result);
        }
        setLoading(false);
      });
  }, [open, currentUser.id]);

  function switchRoom(target: UserRoom) {
    if (target.room.id === room?.id) {
      setOpen(false);
      return;
    }
    // 古いデータをクリア → 既存のuseEffectが新ルームのデータを再フェッチ
    setPlaces([]);
    setRoomMembers([]);
    setRoom(target.room);
    setMyRole(target.role);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 cursor-pointer transition-colors group",
            className
          )}
        >
          <span className="truncate font-semibold group-hover:text-primary transition-colors">
            {room?.name ?? room?.share_code ?? "マップを選択"}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50 group-hover:opacity-100 transition-all" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0 overflow-hidden" align="start" sideOffset={6}>
        <div className="px-3 pt-3 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          マイマップ
        </div>

        {loading ? (
          <div className="flex justify-center py-5">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto">
            {rooms.map(({ room: r, role }) => {
              const isActive = r.id === room?.id;
              return (
                <button
                  key={r.id}
                  onClick={() => switchRoom({ room: r, role })}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors cursor-pointer text-left",
                    isActive ? "bg-primary/5" : "hover:bg-muted"
                  )}
                >
                  <Map
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium truncate",
                        isActive && "text-primary"
                      )}
                    >
                      {r.name ?? r.share_code}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {r.share_code}
                    </p>
                  </div>
                  {isActive && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
            {rooms.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground text-center py-4">
                マップがありません
              </p>
            )}
          </div>
        )}

        <div className="border-t p-1">
          <button
            onClick={() => {
              setOpen(false);
              onAddRoom();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5 rounded-md cursor-pointer transition-colors"
          >
            <Plus className="size-4" />
            新しいマップ
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
