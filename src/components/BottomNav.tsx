"use client";

import { Map, List, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabId = "map" | "plan" | "group" | "mypage";

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS = [
  { id: "map" as TabId, icon: Map, label: "マップ" },
  { id: "plan" as TabId, icon: List, label: "プラン" },
  { id: "group" as TabId, icon: Users, label: "メンバー" },
  { id: "mypage" as TabId, icon: User, label: "マイページ" },
] as const;

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-[45] bg-background border-t flex"
      style={{
        height: "calc(60px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {TABS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors cursor-pointer",
            activeTab === id ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon
            className={cn(
              "size-5 transition-all",
              activeTab === id && "stroke-[2.5px]"
            )}
          />
          {label}
        </button>
      ))}
    </nav>
  );
}
