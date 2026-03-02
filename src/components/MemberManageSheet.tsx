"use client";

import { Crown, Shield, Pencil, Eye, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase, type RoomMember, type RoomRole } from "@/lib/supabase";

interface MemberManageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  myUserId: string;
  members: RoomMember[];
  onRoleChanged: (member: RoomMember) => void;
}

const ROLE_CONFIG: Record<RoomRole, { label: string; icon: React.ReactNode; color: string }> = {
  leader: { label: "リーダー", icon: <Crown className="size-3.5" />, color: "text-yellow-600" },
  admin:  { label: "管理者",   icon: <Shield className="size-3.5" />, color: "text-blue-600" },
  member: { label: "メンバー", icon: <Pencil className="size-3.5" />, color: "text-green-600" },
  viewer: { label: "閲覧者",   icon: <Eye className="size-3.5" />,    color: "text-gray-500" },
};

function RoleBadge({ role }: { role: RoomRole }) {
  const cfg = ROLE_CONFIG[role];
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function UserAvatar({ name }: { name: string }) {
  return (
    <div className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function MemberManageSheet({
  open,
  onOpenChange,
  roomId,
  myUserId,
  members,
  onRoleChanged,
}: MemberManageSheetProps) {
  async function handleRoleChange(userId: string, newRole: RoomRole) {
    const { data, error } = await supabase
      .from("room_members")
      .update({ role: newRole })
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) {
      console.error("Failed to update role:", error);
      return;
    }
    onRoleChanged(data as RoomMember);
  }

  const sorted = [...members].sort((a, b) => {
    const order: Record<RoomRole, number> = { leader: 0, admin: 1, member: 2, viewer: 3 };
    return order[a.role] - order[b.role];
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Users className="size-4" />
            メンバー管理
            <span className="text-sm font-normal text-muted-foreground">（{members.length}人）</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 pb-8">
          {sorted.map((member) => {
            const isMe = member.user_id === myUserId;
            const isLeader = member.role === "leader";
            return (
              <div key={member.user_id} className="flex items-center gap-3">
                <UserAvatar name={member.user_name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{member.user_name}</span>
                    {isMe && <span className="text-[10px] text-muted-foreground">（自分）</span>}
                  </div>
                  <RoleBadge role={member.role} />
                </div>
                {/* リーダーは変更不可、自分自身も変更不可 */}
                {!isLeader && !isMe && (
                  <Select
                    value={member.role}
                    onValueChange={(v) => handleRoleChange(member.user_id, v as RoomRole)}
                  >
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">管理者</SelectItem>
                      <SelectItem value="member">メンバー</SelectItem>
                      <SelectItem value="viewer">閲覧者</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">まだメンバーがいません</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
