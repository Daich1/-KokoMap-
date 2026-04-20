"use client";

import { ProfileSettingsContent } from "@/components/ProfileSettings";

interface MyPageTabProps {
  onLogout: () => void;
  onLeaveRoom: () => void;
  userId?: string;
  currentEmail?: string;
}

export function MyPageTab({ onLogout, onLeaveRoom, userId, currentEmail }: MyPageTabProps) {
  return (
    <div
      className="md:hidden fixed inset-x-0 top-0 z-[42] bg-background flex flex-col overflow-hidden"
      style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* ヘッダー */}
      <div
        className="shrink-0 bg-background border-b px-4 flex items-center"
        style={{ paddingTop: "calc(52px + 0.75rem)", paddingBottom: "0.75rem" }}
      >
        <h1 className="text-lg font-bold tracking-tight">マイページ</h1>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto">
        <ProfileSettingsContent
          onLogout={onLogout}
          onLeaveRoom={onLeaveRoom}
          userId={userId}
          currentEmail={currentEmail}
        />
      </div>
    </div>
  );
}
