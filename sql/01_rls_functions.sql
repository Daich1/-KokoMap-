-- ============================================================================
-- KokoMap RLS 準備 (1/2): ヘルパー関数 + Realtime 用設定
-- ============================================================================
-- 実行順序:
--   1. このファイルを Supabase SQL Editor で実行
--   2. クライアント（get_room_by_code RPC 対応版）をデプロイして動作確認
--   3. sql/02_enable_rls.sql を実行して RLS を有効化
--
-- スキーマ前提（2026-07-22 に本番DBで確認済み）:
--   rooms.id / places.id / places.room_id / room_members.room_id /
--   user_spot_status.place_id ... uuid
--   room_members.user_id / user_spot_status.user_id / places.created_by_id
--     ... text（旧ローカル生成ID "j89hoapbplmm9e3ovl" 等の混在あり）
--   → ユーザー比較はすべて auth.uid()::text
-- ============================================================================

-- ── ヘルパー関数（SECURITY DEFINER で RLS を迂回し自己再帰を防ぐ） ──────────

-- 自分がルームのメンバーか
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from room_members
    where room_id = p_room_id and user_id = auth.uid()::text
  );
$$;

-- 自分のロール（非メンバーなら null）
create or replace function public.get_my_role(p_room_id uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select role from room_members
  where room_id = p_room_id and user_id = auth.uid()::text;
$$;

-- ルームにメンバーがいるか（作成直後の leader 自己登録判定用）
create or replace function public.room_has_members(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from room_members where room_id = p_room_id);
$$;

-- ルームが参加受付中か（rooms の RLS を迂回して判定）
create or replace function public.is_room_open(p_room_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select is_open from rooms where id = p_room_id), false);
$$;

-- 参加前の share_code 検索用 RPC（RLS 有効化後も非メンバーが使える唯一の入口）
-- is_open も返すので「参加を受け付けていません」の UX 分岐が維持できる
create or replace function public.get_room_by_code(p_code text)
returns setof rooms
language sql stable security definer
set search_path = public
as $$
  select * from rooms where share_code = upper(trim(p_code));
$$;

-- 実行権限: ログイン済みユーザーのみ
revoke execute on function public.is_room_member(uuid)    from anon, public;
revoke execute on function public.get_my_role(uuid)       from anon, public;
revoke execute on function public.room_has_members(uuid)  from anon, public;
revoke execute on function public.is_room_open(uuid)      from anon, public;
revoke execute on function public.get_room_by_code(text)  from anon, public;
grant  execute on function public.is_room_member(uuid)    to authenticated;
grant  execute on function public.get_my_role(uuid)       to authenticated;
grant  execute on function public.room_has_members(uuid)  to authenticated;
grant  execute on function public.is_room_open(uuid)      to authenticated;
grant  execute on function public.get_room_by_code(text)  to authenticated;

-- ── Realtime の DELETE イベントに全カラムを含める ───────────────────────────
-- （クライアントが payload.old.user_id / place_id を参照しているため。
--   デフォルトの replica identity は PK のみで id しか届かない）
alter table public.user_spot_status replica identity full;
alter table public.room_members     replica identity full;

-- ── 動作確認 ───────────────────────────────────────────────────────────────
-- select * from public.get_room_by_code('7DCCUN');  -- 既知のコードで1行返ればOK
