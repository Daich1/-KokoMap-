# SOXL 分析ダッシュボード

SOXL（Direxion Daily Semiconductor Bull 3X ETF）のテクニカル分析ダッシュボード。
KOKOMAP から SOXL 分析機能を分離した独立プロジェクトです。

## 機能

- **価格分析**: Yahoo Finance から OHLCV 取得、MA・BB・RSI・MACD・ストキャスティクス・ADX 等
- **シグナル**: 買い/売り/様子見のスコア化、ENTER / WAIT / AVOID 推奨
- **マクロ環境**: VIX、Fear & Greed、SOX、NDX、米10年金利、NVDA 相対強度
- **イベントカレンダー**: NVDA/AMD/MU 決算、NFP・CPI・FOMC 等
- **リスク管理**: ATR ベースの損切り・利確価格、発注シミュレーター
- **LINE 通知**: シグナル変更時の自動通知（LINE Notify トークン設定で）

## セットアップ

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
npm start
```

## 技術スタック

- Next.js 16 (App Router)
- React 19
- Recharts
- Tailwind CSS
- Yahoo Finance API
