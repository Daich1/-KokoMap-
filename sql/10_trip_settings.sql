-- ============================================================================
-- KokoMap: 旅行設定（開始日・日数・既定の移動手段）をマップ単位で共有
-- ============================================================================
-- これまで tripStartDate / tripDays / defaultTransportMode はクライアントの
-- localStorage にのみ保存されており、メンバーごとに日程・日数がバラバラに
-- 見えていた。共同編集の日程アプリとして破綻するため rooms 1:1 の設定テーブルへ移す。
--
-- rooms 本体は RLS で更新が leader 限定だが、プラン編集は leader/admin に
-- 許可している（places の plan_* と揃える）。rooms のセキュリティ面を変えずに
-- leader/admin 双方が書けるよう専用テーブルに分離する。
-- ============================================================================

create table if not exists public.room_trip_settings (
  room_id                 uuid primary key references public.rooms(id) on delete cascade,
  trip_start_date         date,
  trip_days               integer,
  default_transport_mode  text not null default 'WALK',
  updated_at              timestamptz not null default now()
);

alter table public.room_trip_settings enable row level security;

-- SELECT: マップメンバー（閲覧者含む）は読める
drop policy if exists rts_select on public.room_trip_settings;
create policy rts_select on public.room_trip_settings
  for select to authenticated
  using (public.is_room_member(room_id));

-- INSERT/UPDATE/DELETE: leader / admin のみ（プラン編集権限と一致）
drop policy if exists rts_write on public.room_trip_settings;
create policy rts_write on public.room_trip_settings
  for all to authenticated
  using (public.get_my_role(room_id) in ('leader', 'admin'))
  with check (public.get_my_role(room_id) in ('leader', 'admin'));

-- Realtime 配信対象に追加（既に追加済みなら無視される）
do $$
begin
  begin
    alter publication supabase_realtime add table public.room_trip_settings;
  exception when duplicate_object then null;
  end;
end $$;
