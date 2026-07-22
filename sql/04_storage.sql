-- ============================================================================
-- KokoMap: スポット写真アップロード用の Storage バケット + ポリシー
-- ============================================================================
-- これを実行すると public バケット place-images が作成され、
-- ログイン済みユーザーはアップロード可・誰でも閲覧可・自分の分は削除可 になる。
-- （ダッシュボードで手動作成する代わりにこの1ファイルでOK）
-- ============================================================================

-- バケット作成（既にあれば public 設定だけ更新）
insert into storage.buckets (id, name, public)
values ('place-images', 'place-images', true)
on conflict (id) do update set public = true;

-- 既存ポリシーを消してから作り直す（冪等）
drop policy if exists "place_images_read"   on storage.objects;
drop policy if exists "place_images_insert" on storage.objects;
drop policy if exists "place_images_delete" on storage.objects;

-- 閲覧: 誰でも（public バケット）
create policy "place_images_read" on storage.objects
  for select to public
  using (bucket_id = 'place-images');

-- アップロード: ログイン済みユーザー
create policy "place_images_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'place-images');

-- 削除: 自分がアップロードした分のみ
create policy "place_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'place-images' and owner = auth.uid());
