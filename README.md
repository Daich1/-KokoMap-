# ココマップ (KokoMap)

仲間とリアルタイムにお気に入りの場所を地図にまとめ、旅行・おでかけを計画できる PWA です。

招待コード(または URL)を共有するだけでマップに参加でき、スポットの追加・「行きたい⭐/行った✅」リアクション・コメントが全員に即時同期されます。

## 主な機能

- **共有マップ**: 招待コード/URL で参加。リーダー / 管理者 / メンバー / 閲覧者の4段階ロール
- **スポット登録**: Google Places 検索、URL 貼り付けからの AI 自動抽出(店名・住所・予算・営業時間)、写真アップロード
- **リアルタイム同期**: スポット・メンバー・リアクションを Supabase Realtime で即時反映、Web Push 通知
- **検索・フィルター**: カテゴリ / 予算 / 営業中 / ステータス / 登録者、並び替え(距離・新着・予算)
- **プランニング**: スポットを「◯日目」に割り当て。ドラッグ&ドロップ並べ替え、スポット間の徒歩時間と1日の移動・滞在時間サマリー表示
- **経路検索**: 車 / 徒歩 / 自転車 / 公共交通(Google Routes API)
- **公開リンク**: ログイン不要の閲覧専用ページ(`/view/<token>`)をリーダーが発行可能
- **PWA**: ホーム画面インストール、オフラインページ、ダークモード対応

## 技術スタック

- Next.js 16 (App Router) / React 19 / TypeScript
- Tailwind CSS 4 + shadcn/ui
- Mapbox GL JS(地図)+ supercluster(クラスタリング)
- Supabase(Auth / Postgres + RLS / Realtime / Storage)
- Google Places・Routes API、OpenAI(URL からの情報抽出・営業時間の構造化)
- web-push(通知)、Resend(認証メール)

## セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. 環境変数(`.env.local`)

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon キー |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー用 service role キー(通知 API 等) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox アクセストークン |
| `GOOGLE_MAPS_API_KEY` | Places / Routes API(サーバー) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 上記のフォールバック(任意) |
| `OPENAI_API_KEY` | URL 取り込み・営業時間パース |
| `RESEND_API_KEY` | 認証メール送信 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push(`npx web-push generate-vapid-keys` で生成) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push 公開鍵(クライアント) |

### 3. データベース(Supabase SQL Editor で順番に実行)

```
sql/01_rls_functions.sql   -- RLS ヘルパー関数
sql/02_enable_rls.sql      -- RLS ポリシー
sql/03_room_management.sql -- マップ削除 RPC
sql/04_storage.sql         -- 写真用 Storage バケット
sql/05_plan.sql            -- プラン(日程)用カラム
sql/06_comments.sql        -- スポットコメント
sql/07_push.sql            -- Push 購読テーブル
sql/08_public_share.sql    -- 閲覧専用公開リンク
sql/09_plan_enhancements.sql -- スポット別の予定時刻(plan_time)
sql/10_trip_settings.sql   -- 旅行設定(開始日・日数・既定移動手段)のマップ共有
```

### 4. 起動

```bash
npm run dev    # 開発サーバー (http://localhost:3000)
npm run build  # プロダクションビルド
npm run lint   # ESLint
```

## API ルートと認証

`/api/notify`(Push 送信)、`/api/extract`(URL 取り込み)、`/api/places/parse-hours`(営業時間パース)は Supabase のアクセストークン(`Authorization: Bearer`)必須です。`/api/extract` は SSRF 対策としてプライベート IP 帯への fetch を拒否します。

### 既知の制限

- `/api/places/photo` は `<img src>` から参照されるためヘッダー認証を付けられず、認証なしで到達可能です(Google フォト参照のプロキシ)。
- 旧ローカル生成 ID のデータは RLS 上どのユーザーにも紐付きません(詳細は `sql/02_enable_rls.sql` のコメント参照)。

## ディレクトリ構成

```
src/
  app/           # ページ + API ルート(/view/[token] は公開閲覧ページ)
  components/    # UI コンポーネント(tabs/ はモバイルタブ + PC サイドパネル共用)
  hooks/         # マップ・認証・Realtime・フィルター等のロジック
  lib/           # Supabase クライアント、定数、ユーティリティ
  store/         # Zustand ストア
sql/             # Supabase 適用用 SQL(番号順に実行)
```
