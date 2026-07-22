-- ============================================================================
-- KokoMap: スポットごとのコメント機能
-- ============================================================================
-- 同じルームのメンバーが各スポットにコメントを投稿・閲覧できる。
-- 削除は投稿者本人のみ。Realtime で即時同期。
-- 前提: sql/01, sql/02 実行済み（is_room_member を使用）
-- ============================================================================

create table if not exists public.place_comments (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_place_comments_place_id on public.place_comments (place_id);

alter table public.place_comments enable row level security;

-- 閲覧: そのスポットが属するルームのメンバー
drop policy if exists place_comments_select on public.place_comments;
create policy place_comments_select on public.place_comments
  for select to authenticated
  using (
    exists (
      select 1 from public.places p
      where p.id = place_id and p.room_id is not null and public.is_room_member(p.room_id)
    )
  );

-- 投稿: 自分の user_id かつ 同室メンバー
drop policy if exists place_comments_insert on public.place_comments;
create policy place_comments_insert on public.place_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()::text
    and exists (
      select 1 from public.places p
      where p.id = place_id and p.room_id is not null and public.is_room_member(p.room_id)
    )
  );

-- 削除: 投稿者本人のみ
drop policy if exists place_comments_delete on public.place_comments;
create policy place_comments_delete on public.place_comments
  for delete to authenticated
  using (user_id = auth.uid()::text);

-- Realtime 配信の対象に追加（既に追加済みならスキップ）
do $$
begin
  alter publication supabase_realtime add table public.place_comments;
exception when duplicate_object then null;
end $$;
