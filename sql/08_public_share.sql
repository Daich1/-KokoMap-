-- ============================================================================
-- KokoMap: ログイン不要の閲覧専用公開リンク
-- ============================================================================
-- rooms.public_token が設定されているマップは、トークンを知っている人なら
-- 誰でも（未ログインでも）閲覧できる。RLS は変更せず、anon に grant した
-- SECURITY DEFINER RPC 経由でのみ読み取りを許可する。
-- 前提: sql/01〜03 実行済み（get_my_role を使用）
-- ============================================================================

alter table public.rooms add column if not exists public_token uuid;

create index if not exists idx_rooms_public_token on public.rooms (public_token);

-- ── 公開リンクの有効化/無効化（リーダーのみ）────────────────────────────
-- 有効化: 既存トークンがあれば再利用、無ければ生成して返す
-- 無効化: トークンを削除して null を返す
create or replace function public.set_room_public(p_room_id uuid, p_enabled boolean)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_token uuid;
begin
  if public.get_my_role(p_room_id) <> 'leader' then
    raise exception 'permission denied: only the room leader can change public sharing';
  end if;

  if p_enabled then
    select public_token into v_token from rooms where id = p_room_id;
    if v_token is null then
      v_token := gen_random_uuid();
      update rooms set public_token = v_token where id = p_room_id;
    end if;
    return v_token;
  else
    update rooms set public_token = null where id = p_room_id;
    return null;
  end if;
end;
$$;

revoke execute on function public.set_room_public(uuid, boolean) from anon, public;
grant  execute on function public.set_room_public(uuid, boolean) to authenticated;

-- ── 公開マップの情報取得（未ログイン可・トークン必須）──────────────────
-- share_code や内部IDは返さない（招待コードの漏洩防止）
create or replace function public.get_public_room(p_token uuid)
returns table (name text)
language sql stable security definer set search_path = public
as $$
  select r.name from rooms r where r.public_token = p_token;
$$;

grant execute on function public.get_public_room(uuid) to anon, authenticated;

-- ── 公開マップのスポット一覧（未ログイン可・トークン必須）──────────────
-- 表示に必要な列だけを返す（room_id や登録者IDは含めない）
create or replace function public.get_public_places(p_token uuid)
returns table (
  id uuid,
  name text,
  address text,
  note text,
  categories text[],
  budget_min integer,
  budget_max integer,
  duration text,
  image_urls text[],
  lat double precision,
  lng double precision,
  created_by_name text,
  opening_hours_text text,
  plan_day integer,
  plan_order integer,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.address, p.note, p.categories::text[],
         p.budget_min::integer, p.budget_max::integer, p.duration, p.image_urls::text[],
         p.lat::double precision, p.lng::double precision,
         p.created_by_name, p.opening_hours_text,
         p.plan_day::integer, p.plan_order::integer, p.created_at
  from places p
  join rooms r on r.id = p.room_id
  where r.public_token = p_token
    and p.deleted_at is null;
$$;

grant execute on function public.get_public_places(uuid) to anon, authenticated;
