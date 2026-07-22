-- ============================================================================
-- KokoMap: プラン（日程・訪問順）用の列を places に追加
-- ============================================================================
-- plan_day   : 何日目か（1,2,3... / 未定は null）
-- plan_order : その日の中での並び順（小さいほど先。未設定は null）
-- 既存の places の RLS UPDATE ポリシー（作成者 or leader/admin）で更新される。
-- アプリ上ではプラン編集を leader/admin に限定している。
-- ============================================================================

alter table public.places add column if not exists plan_day   integer;
alter table public.places add column if not exists plan_order integer;
