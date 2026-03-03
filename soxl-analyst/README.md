# SOXL 投資分析システム

Claude AI × テクニカル分析による **SOXL 売買タイミング支援ツール**。

実際の発注は楽天証券で手動実行、AIが判断材料を提供します。

---

## 分析内容

| 項目 | 詳細 |
|------|------|
| **データ取得** | SOXL, SOXX, SMH, QQQ, SPY, VIX, ^SOX（Yahoo Finance） |
| **テクニカル指標** | RSI(14), MACD(12/26/9), ボリンジャーバンド(20日), 移動平均(5/20/50/200日), ATR |
| **AI分析** | Claude Sonnet/Opus による総合判断・強気/弱気要因・アクションプラン |
| **出力** | ターミナル表示 + HTMLダッシュボードレポート |

---

## セットアップ

### 1. 依存関係のインストール

```bash
cd soxl-analyst
pip3 install yfinance pandas numpy anthropic python-dotenv jinja2 rich requests pandas-ta
```

### 2. APIキーの設定

```bash
cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY を入力
```

Anthropic APIキーは https://console.anthropic.com/ で取得（無料枠あり）。

### 3. 設定（任意）

`.env` ファイルで以下をカスタマイズ可能：

```env
# モデル選択
CLAUDE_MODEL=claude-3-5-sonnet-20241022   # コスパ優秀（推奨）
# CLAUDE_MODEL=claude-opus-4-5            # 最高精度
# CLAUDE_MODEL=claude-3-5-haiku-20241022  # 超高速・低コスト

# 投資情報
SOXL_HOLDINGS=200000    # 保有/投資予定額（円）
```

---

## 使い方

```bash
# 分析実行（HTMLレポートも生成）
python3 main.py

# HTMLレポートなしでターミナルのみ
python3 main.py --no-html

# 生成後にブラウザで自動表示
python3 main.py --open

# レポート出力先を変更
python3 main.py --output-dir ~/Desktop/soxl-reports
```

最新レポートは `reports/latest_report.html` に常に上書き保存されます。

---

## 定期実行（毎朝自動分析）

毎朝 8:00 に自動実行する場合（crontab）：

```bash
# crontab -e で以下を追加
0 8 * * 1-5 cd /workspace/soxl-analyst && python3 main.py >> logs/daily.log 2>&1
```

---

## ファイル構成

```
soxl-analyst/
├── main.py              # エントリポイント
├── config.py            # 設定管理
├── data_fetcher.py      # Yahoo Finance データ取得
├── technical_analysis.py # RSI/MACD/BB/MA 計算
├── ai_analyst.py        # Claude API 分析
├── report_generator.py  # HTML レポート生成
├── requirements.txt     # 依存パッケージ
├── .env.example         # 環境変数テンプレート
└── reports/             # 生成レポート保存先
```

---

## 免責事項

本ツールは情報提供のみを目的とし、投資助言ではありません。
SOXLは3倍レバレッジETFであり、元本を大きく超える損失が発生する可能性があります。
投資の最終判断はご自身の責任で行ってください。
