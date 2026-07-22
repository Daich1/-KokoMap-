-- ============================================================================
-- KokoMap: マップ（ルーム）削除用の関数
-- ============================================================================
-- 前提: sql/01, sql/02 実行済み
--
-- ルーム削除は RLS で禁止している（rooms に DELETE ポリシー無し）ため、
-- リーダー確認 + 関連データの後始末をまとめて行う SECURITY DEFINER 関数を使う。
-- 「抜ける」(自分の room_members 削除) は RLS の self-delete ポリシーで
-- クライアントから直接できるので、この関数は不要。
-- ============================================================================

create or replace function public.delete_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- 呼び出し元がそのルームのリーダーであることを確認
  if public.get_my_role(p_room_id) <> 'leader' then
    raise exception 'permission denied: only the room leader can delete the room';
  end if;

  -- 関連データを順に削除（FK/RLS を迂回して後始末）
  delete from user_spot_status
    where place_id in (select id from places where room_id = p_room_id);
  delete from places       where room_id = p_room_id;
  delete from room_members where room_id = p_room_id;
  delete from rooms         where id = p_room_id;
end;
$$;

revoke execute on function public.delete_room(uuid) from anon, public;
grant  execute on function public.delete_room(uuid) to authenticated;
