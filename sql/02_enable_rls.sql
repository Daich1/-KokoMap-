-- ============================================================================
-- KokoMap RLS 有効化 (2/2): ポリシー定義
-- ============================================================================
-- 前提: sql/01_rls_functions.sql 実行済み + RPC対応クライアントがデプロイ済み
--
-- 既知の許容ギャップ（今回は対応しない・低リスク）:
--   - 自分の place の UPDATE で created_by_id 等も書き換え可能（トリガー無しでは
--     OLD/NEW 比較ができないため）。メンバー間の悪意は運用上想定しない
--   - 旧ローカル生成ID（非UUID）の行はどの auth ユーザーにも紐付かないため
--     変更・削除不可のまま残る（表示には影響なし）。掃除する場合は末尾参照
-- ============================================================================

-- ── インデックス（ポリシー評価で多用するため） ─────────────────────────────
create index if not exists idx_room_members_user_id  on public.room_members (user_id);
create index if not exists idx_room_members_room_id  on public.room_members (room_id);
create index if not exists idx_places_room_id        on public.places (room_id);
create index if not exists idx_user_spot_status_place_id on public.user_spot_status (place_id);

-- ── RLS 有効化 ─────────────────────────────────────────────────────────────
alter table public.rooms            enable row level security;
alter table public.room_members     enable row level security;
alter table public.places           enable row level security;
alter table public.user_spot_status enable row level security;

-- ── 既存ポリシーを全削除 ────────────────────────────────────────────────────
-- 過去に作られた「誰でも許可(using true)」等の緩いポリシーが別名で残っていると、
-- ポリシーは OR で合成されるため匿名アクセスが素通りする。対象4テーブルの
-- 既存ポリシーを一旦すべて削除してから、下で正しいものだけを作り直す。
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('rooms', 'room_members', 'places', 'user_spot_status')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── rooms ──────────────────────────────────────────────────────────────────
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated
  using (public.is_room_member(id));

drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms
  for update to authenticated
  using (public.get_my_role(id) = 'leader')
  with check (public.get_my_role(id) = 'leader');

-- DELETE ポリシーなし = 削除不可

-- ── room_members ───────────────────────────────────────────────────────────
drop policy if exists room_members_select on public.room_members;
create policy room_members_select on public.room_members
  for select to authenticated
  using (public.is_room_member(room_id));

-- 参加: 自分の行のみ。leader は「まだ誰もいないルーム」（=作成直後）、
-- member は「参加受付中(is_open)のルーム」のみ
drop policy if exists room_members_insert_self on public.room_members;
create policy room_members_insert_self on public.room_members
  for insert to authenticated
  with check (
    user_id = auth.uid()::text
    and (
      (role = 'leader' and not public.room_has_members(room_id))
      or (role = 'member' and public.is_room_open(room_id))
    )
  );

-- 自分の行の更新: 名前は変更可、ロールは現在値に固定（upsert の競合パス対応）
drop policy if exists room_members_update_self on public.room_members;
create policy room_members_update_self on public.room_members
  for update to authenticated
  using (user_id = auth.uid()::text)
  with check (
    user_id = auth.uid()::text
    and role = public.get_my_role(room_id)
  );

-- leader による他メンバーのロール変更（leader への昇格＝二人目のleaderは不可）
drop policy if exists room_members_update_by_leader on public.room_members;
create policy room_members_update_by_leader on public.room_members
  for update to authenticated
  using (
    public.get_my_role(room_id) = 'leader'
    and user_id <> auth.uid()::text
  )
  with check (
    public.get_my_role(room_id) = 'leader'
    and user_id <> auth.uid()::text
    and role in ('admin', 'member', 'viewer')
  );

-- 退出（自分）/ 追放（leader が他人を）
drop policy if exists room_members_delete on public.room_members;
create policy room_members_delete on public.room_members
  for delete to authenticated
  using (
    user_id = auth.uid()::text
    or (public.get_my_role(room_id) = 'leader' and user_id <> auth.uid()::text)
  );

-- ── places ─────────────────────────────────────────────────────────────────
drop policy if exists places_select on public.places;
create policy places_select on public.places
  for select to authenticated
  using (room_id is not null and public.is_room_member(room_id));

-- 追加: メンバーかつ viewer 以外、created_by_id は自分
drop policy if exists places_insert on public.places;
create policy places_insert on public.places
  for insert to authenticated
  with check (
    room_id is not null
    and public.is_room_member(room_id)
    and coalesce(public.get_my_role(room_id), 'viewer') <> 'viewer'
    and created_by_id = auth.uid()::text
  );

-- 編集・ソフト削除(deleted_at更新): 作成者本人 または leader/admin
drop policy if exists places_update on public.places;
create policy places_update on public.places
  for update to authenticated
  using (
    room_id is not null
    and public.is_room_member(room_id)
    and (
      created_by_id = auth.uid()::text
      or public.get_my_role(room_id) in ('leader', 'admin')
    )
  )
  with check (room_id is not null and public.is_room_member(room_id));

-- DELETE ポリシーなし = 物理削除は不可（ソフト削除のみ）

-- ── user_spot_status ───────────────────────────────────────────────────────
-- 読み取り: 自分の行 + 同じルームのスポットに対する他メンバーの行
-- （Realtime の INSERT/UPDATE 配信もこの SELECT ポリシーで絞られる）
drop policy if exists user_spot_status_select on public.user_spot_status;
create policy user_spot_status_select on public.user_spot_status
  for select to authenticated
  using (
    user_id = auth.uid()::text
    or exists (
      select 1 from places p
      where p.id = place_id
        and p.room_id is not null
        and public.is_room_member(p.room_id)
    )
  );

drop policy if exists user_spot_status_insert on public.user_spot_status;
create policy user_spot_status_insert on public.user_spot_status
  for insert to authenticated
  with check (user_id = auth.uid()::text);

drop policy if exists user_spot_status_update on public.user_spot_status;
create policy user_spot_status_update on public.user_spot_status
  for update to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

drop policy if exists user_spot_status_delete on public.user_spot_status;
create policy user_spot_status_delete on public.user_spot_status
  for delete to authenticated
  using (user_id = auth.uid()::text);

-- ============================================================================
-- ロールバック（問題発生時にこのブロックだけ実行）
-- ============================================================================
-- alter table public.rooms            disable row level security;
-- alter table public.room_members     disable row level security;
-- alter table public.places           disable row level security;
-- alter table public.user_spot_status disable row level security;

-- ============================================================================
-- 任意: 旧ローカル生成ID（非UUID）行の掃除。実行前に内容を確認すること
-- ============================================================================
-- select * from user_spot_status where user_id !~ '^[0-9a-f-]{36}$';
-- select * from room_members     where user_id !~ '^[0-9a-f-]{36}$';
-- delete from user_spot_status where user_id !~ '^[0-9a-f-]{36}$';
-- delete from room_members     where user_id !~ '^[0-9a-f-]{36}$';
