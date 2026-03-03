import json
import os
from datetime import datetime
from typing import Dict, Any
from jinja2 import Template
from rich.console import Console

console = Console()

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SOXL 投資分析レポート - {{ report_date }}</title>
<style>
  :root {
    --bg: #0f1117; --card: #1a1d2e; --border: #2d3148;
    --text: #e8eaf6; --muted: #8892b0; --accent: #7c83fd;
    --green: #4ade80; --red: #f87171; --yellow: #fbbf24; --orange: #fb923c;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 1.5rem; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
  .subtitle { color: var(--muted); font-size: 0.875rem; margin-bottom: 24px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
  @media (max-width: 900px) { .grid-4, .grid-3 { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 600px) { .grid-2, .grid-4, .grid-3 { grid-template-columns: 1fr; } }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .card h2 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 12px; }
  .big-number { font-size: 2rem; font-weight: 700; }
  .change { font-size: 0.875rem; margin-top: 4px; }
  .up { color: var(--green); }
  .down { color: var(--red); }
  .neutral { color: var(--yellow); }
  .signal-badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 20px; border-radius: 999px; font-size: 1.1rem; font-weight: 700;
    margin-bottom: 12px;
  }
  .signal-strong-buy { background: #064e3b; color: var(--green); border: 2px solid var(--green); }
  .signal-buy { background: #14532d; color: #86efac; border: 2px solid #86efac; }
  .signal-neutral { background: #451a03; color: var(--yellow); border: 2px solid var(--yellow); }
  .signal-sell { background: #450a0a; color: #fca5a5; border: 2px solid #fca5a5; }
  .signal-strong-sell { background: #3f0000; color: var(--red); border: 2px solid var(--red); }
  .confidence-bar { background: var(--border); border-radius: 999px; height: 8px; margin-top: 8px; }
  .confidence-fill { height: 8px; border-radius: 999px; background: var(--accent); }
  .factor-list { list-style: none; }
  .factor-list li { padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
  .factor-list li:last-child { border-bottom: none; }
  .factor-list li::before { content: ""; margin-right: 8px; }
  .bull li::before { content: "↑"; color: var(--green); }
  .bear li::before { content: "↓"; color: var(--red); }
  .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
  .metric-row:last-child { border-bottom: none; }
  .metric-label { color: var(--muted); }
  .gauge { position: relative; text-align: center; padding: 8px 0; }
  .gauge-value { font-size: 1.75rem; font-weight: 700; }
  .gauge-label { font-size: 0.75rem; color: var(--muted); }
  .rsi-bar { height: 12px; border-radius: 6px; margin: 8px 0; position: relative;
    background: linear-gradient(to right, #ef4444 0%, #f97316 20%, #facc15 35%, #4ade80 50%, #facc15 65%, #f97316 80%, #ef4444 100%); }
  .rsi-marker { position: absolute; top: -4px; width: 20px; height: 20px; background: white; border-radius: 50%; transform: translateX(-50%); border: 3px solid var(--accent); }
  .action-item { background: #1e2235; border-left: 3px solid var(--accent); padding: 10px 14px; border-radius: 0 8px 8px 0; margin-bottom: 8px; font-size: 0.875rem; }
  .action-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  .level-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .level-item { background: #1e2235; padding: 10px; border-radius: 8px; text-align: center; }
  .level-price { font-size: 1.1rem; font-weight: 700; }
  .level-type { font-size: 0.7rem; color: var(--muted); }
  .related-grid { display: grid; gap: 8px; }
  .related-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .related-item:last-child { border-bottom: none; }
  .ticker-name { font-size: 0.75rem; color: var(--muted); }
  .risk-badge { padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 700; }
  .risk-low { background: #14532d; color: #86efac; }
  .risk-mid { background: #451a03; color: var(--yellow); }
  .risk-high { background: #450a0a; color: #fca5a5; }
  .risk-extreme { background: #3f0000; color: var(--red); }
  .summary-text { font-size: 0.95rem; line-height: 1.7; color: var(--text); }
  .note-box { background: #1e1e35; border: 1px solid #3d3d6b; border-radius: 8px; padding: 14px; font-size: 0.8rem; color: var(--muted); margin-top: 16px; }
  .footer { text-align: center; color: var(--muted); font-size: 0.75rem; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { text-align: left; padding: 8px; color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--border); }
  td { padding: 8px; border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }
</style>
</head>
<body>

<h1>📊 SOXL 投資分析レポート</h1>
<p class="subtitle">{{ report_date }} 生成 ｜ モデル: {{ ai.model_used }}</p>

<!-- シグナル & サマリー -->
<div class="card" style="margin-bottom: 16px;">
  <h2>AI 総合判断</h2>
  <div class="signal-badge signal-{{ signal_class }}">
    {{ signal_icon }} {{ ai.overall_signal }}
  </div>
  <p style="font-size: 0.75rem; color: var(--muted); margin-bottom: 8px;">確信度: {{ ai.confidence }}%</p>
  <div class="confidence-bar"><div class="confidence-fill" style="width: {{ ai.confidence }}%;"></div></div>
  <p class="summary-text" style="margin-top: 16px;">{{ ai.summary }}</p>
  <div style="display: flex; gap: 12px; margin-top: 12px; align-items: center; flex-wrap: wrap;">
    <span>リスクレベル: <span class="risk-badge risk-{{ risk_class }}">{{ ai.risk_level }}</span></span>
    <span style="color: var(--muted); font-size: 0.875rem;">投資期間: {{ ai.time_horizon }}</span>
  </div>
</div>

<!-- 価格情報 -->
<div class="grid-4">
  <div class="card">
    <h2>現在値</h2>
    <div class="big-number">${{ "%.2f"|format(soxl.price.current) }}</div>
    <div class="change {% if soxl_latest.change_pct >= 0 %}up{% else %}down{% endif %}">
      {% if soxl_latest.change_pct >= 0 %}▲{% else %}▼{% endif %}
      ${{ "%.2f"|format(soxl_latest.change|abs) }} ({{ "%.2f"|format(soxl_latest.change_pct|abs) }}%)
    </div>
  </div>
  <div class="card">
    <h2>52週高値/安値</h2>
    <div class="big-number up" style="font-size: 1.3rem;">${{ "%.2f"|format(soxl.price["52w_high"]) }}</div>
    <div class="big-number down" style="font-size: 1.3rem;">${{ "%.2f"|format(soxl.price["52w_low"]) }}</div>
    <div style="font-size: 0.75rem; color: var(--muted); margin-top: 4px;">高値比: {{ "%.1f"|format(soxl.price.from_52w_high) }}%</div>
  </div>
  <div class="card">
    <h2>出来高</h2>
    <div class="big-number" style="font-size: 1.4rem;">{{ "{:,}".format(soxl.volume.latest) }}</div>
    <div class="change {% if soxl.volume.ratio >= 1.5 %}up{% elif soxl.volume.ratio < 0.7 %}down{% else %}neutral{% endif %}">
      MA比: {{ "%.2f"|format(soxl.volume.ratio) }}倍 ｜ {{ soxl.volume.signal }}
    </div>
  </div>
  <div class="card">
    <h2>トレンド</h2>
    <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">{{ soxl.trend }}</div>
    <div style="font-size: 0.8rem; color: var(--muted);">ATR: ${{ "%.2f"|format(soxl.atr.value) }} ({{ "%.1f"|format(soxl.atr.atr_pct) }}%)</div>
    {% if soxl.drawdown.current < -5 %}
    <div class="change down" style="font-size: 0.8rem;">現在DD: {{ "%.1f"|format(soxl.drawdown.current) }}%</div>
    {% endif %}
  </div>
</div>

<!-- RSI & MACD & BB -->
<div class="grid-3">
  <div class="card">
    <h2>RSI ({{ rsi_period }}日)</h2>
    <div class="gauge">
      <div class="gauge-value {% if soxl.rsi.value <= 30 %}up{% elif soxl.rsi.value >= 70 %}down{% else %}neutral{% endif %}">
        {{ "%.1f"|format(soxl.rsi.value) }}
      </div>
      <div class="gauge-label">{{ soxl.rsi.signal }}</div>
    </div>
    <div class="rsi-bar">
      <div class="rsi-marker" style="left: {{ soxl.rsi.value | round(1) }}%;"></div>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--muted);">
      <span>0 売られすぎ</span><span>50</span><span>買われすぎ 100</span>
    </div>
  </div>
  <div class="card">
    <h2>MACD</h2>
    <div class="metric-row">
      <span class="metric-label">MACD</span>
      <span class="{% if soxl.macd.macd >= 0 %}up{% else %}down{% endif %}">{{ "%.3f"|format(soxl.macd.macd) }}</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">シグナル</span>
      <span>{{ "%.3f"|format(soxl.macd.signal) }}</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">ヒストグラム</span>
      <span class="{% if soxl.macd.histogram >= 0 %}up{% else %}down{% endif %}">{{ "%.3f"|format(soxl.macd.histogram) }}</span>
    </div>
    <div style="margin-top: 8px; font-size: 0.8rem; font-weight: 700; color: var(--accent);">{{ soxl.macd.cross }}</div>
  </div>
  <div class="card">
    <h2>ボリンジャーバンド ({{ bb_period }}日)</h2>
    <div class="metric-row">
      <span class="metric-label">上限</span>
      <span class="up">${{ "%.2f"|format(soxl.bollinger.upper) }}</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">中心</span>
      <span>${{ "%.2f"|format(soxl.bollinger.middle) }}</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">下限</span>
      <span class="down">${{ "%.2f"|format(soxl.bollinger.lower) }}</span>
    </div>
    <div style="margin-top: 8px; font-size: 0.8rem; font-weight: 700; color: var(--accent);">%B: {{ "%.1f"|format(soxl.bollinger.percent_b) }}% ｜ {{ soxl.bollinger.signal }}</div>
  </div>
</div>

<!-- 移動平均 & リターン -->
<div class="grid-2">
  <div class="card">
    <h2>移動平均線</h2>
    {% for key, val in soxl.moving_averages.ma_values.items() %}
    <div class="metric-row">
      <span class="metric-label">{{ key|upper }}</span>
      <span>${{ "%.2f"|format(val) }}</span>
      <span class="{% if soxl.moving_averages.deviations[key] >= 0 %}up{% else %}down{% endif %}" style="font-size: 0.8rem;">
        {{ "%+.1f"|format(soxl.moving_averages.deviations[key]) }}%
      </span>
    </div>
    {% endfor %}
  </div>
  <div class="card">
    <h2>パフォーマンス</h2>
    {% for key, val in soxl.returns.items() %}
    <div class="metric-row">
      <span class="metric-label">{{ key }}</span>
      <span class="{% if val >= 0 %}up{% else %}down{% endif %}">{{ "%+.1f"|format(val) }}%</span>
    </div>
    {% endfor %}
    <div class="metric-row">
      <span class="metric-label">最大ドローダウン（1年）</span>
      <span class="down">{{ "%.1f"|format(soxl.drawdown.max) }}%</span>
    </div>
  </div>
</div>

<!-- 強気/弱気要因 -->
<div class="grid-2">
  <div class="card">
    <h2>強気要因（ブル）</h2>
    <ul class="factor-list bull">
      {% for f in ai.bullish_factors %}
      <li>{{ f }}</li>
      {% endfor %}
    </ul>
  </div>
  <div class="card">
    <h2>弱気要因（ベア）</h2>
    <ul class="factor-list bear">
      {% for f in ai.bearish_factors %}
      <li>{{ f }}</li>
      {% endfor %}
    </ul>
  </div>
</div>

<!-- アクションプランと支持線/抵抗線 -->
<div class="grid-2">
  <div class="card">
    <h2>アクションプラン</h2>
    <div class="action-item">
      <div class="action-label">エントリー条件</div>
      {{ ai.action_plan.entry_condition }}
    </div>
    <div class="action-item">
      <div class="action-label">利確条件</div>
      {{ ai.action_plan.exit_condition }}
    </div>
    <div class="action-item" style="border-left-color: var(--red);">
      <div class="action-label">損切り条件</div>
      {{ ai.action_plan.stop_loss }}
    </div>
    <div class="action-item" style="border-left-color: var(--yellow);">
      <div class="action-label">ポジションサイズ</div>
      {{ ai.action_plan.position_sizing }}
    </div>
  </div>
  <div class="card">
    <h2>サポート / レジスタンス</h2>
    <div class="level-grid">
      <div class="level-item" style="border: 1px solid var(--red);">
        <div class="level-price up">${{ ai.key_levels.resistance2 }}</div>
        <div class="level-type">抵抗線②</div>
      </div>
      <div class="level-item" style="border: 1px solid var(--orange);">
        <div class="level-price up">${{ ai.key_levels.resistance1 }}</div>
        <div class="level-type">抵抗線①</div>
      </div>
      <div class="level-item" style="border: 1px solid #22c55e;">
        <div class="level-price down">${{ ai.key_levels.support1 }}</div>
        <div class="level-type">支持線①</div>
      </div>
      <div class="level-item" style="border: 1px solid #16a34a;">
        <div class="level-price down">${{ ai.key_levels.support2 }}</div>
        <div class="level-type">支持線②</div>
      </div>
    </div>
    <div style="margin-top: 12px; text-align: center; font-size: 1.1rem; font-weight: 700; color: var(--accent);">
      現在値: ${{ "%.2f"|format(soxl.price.current) }}
    </div>
  </div>
</div>

<!-- 関連銘柄 -->
<div class="card" style="margin-bottom: 16px;">
  <h2>関連銘柄・指標</h2>
  <div class="related-grid">
    {% for ticker, data in related.items() %}
    <div class="related-item">
      <div>
        <div style="font-weight: 700;">{{ ticker }}</div>
        <div class="ticker-name">{{ data.description }}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 700;">${{ "%.2f"|format(data.close) if data.close is defined else "N/A" }}</div>
        <div class="change {% if data.change_pct >= 0 %}up{% else %}down{% endif %}" style="font-size: 0.8rem;">
          {{ "%+.2f"|format(data.change_pct) if data.change_pct is defined else "" }}%
        </div>
      </div>
    </div>
    {% endfor %}
  </div>
</div>

<!-- 追記事項 -->
{% if ai.additional_notes %}
<div class="card" style="margin-bottom: 16px;">
  <h2>AI アナリストメモ</h2>
  <p class="summary-text">{{ ai.additional_notes }}</p>
</div>
{% endif %}

<div class="note-box">
  ⚠️ <strong>免責事項:</strong> 本レポートは情報提供のみを目的としており、投資助言ではありません。
  投資の最終判断はご自身の責任で行ってください。SOXLは3倍レバレッジETFであり、
  元本を大きく超える損失が発生する可能性があります。
</div>

<div class="footer">
  生成日時: {{ report_date }} ｜ SOXL Analyst by Claude AI ｜ データ提供: Yahoo Finance
</div>

</body>
</html>"""


SIGNAL_MAP = {
    "強い買い": ("strong-buy", "🚀"),
    "買い": ("buy", "📈"),
    "中立（様子見）": ("neutral", "⏸"),
    "売り": ("sell", "📉"),
    "強い売り": ("strong-sell", "🔻"),
}

RISK_MAP = {
    "低": "low",
    "中": "mid",
    "高": "high",
    "極高": "extreme",
}

TICKER_DESCRIPTIONS = {
    "SOXX": "iShares 半導体 ETF",
    "SMH": "VanEck 半導体 ETF",
    "QQQ": "Nasdaq 100",
    "SPY": "S&P 500",
    "^VIX": "恐怖指数 VIX",
    "^SOX": "PHLX 半導体指数",
}


def generate_report(
    soxl_analysis: Dict[str, Any],
    soxl_latest: Dict[str, Any],
    related_data: Dict[str, Any],
    ai_result: Dict[str, Any],
    output_dir: str = ".",
) -> str:
    """HTMLレポートを生成してファイルに保存"""

    report_date = datetime.now().strftime("%Y年%m月%d日 %H:%M")
    signal = ai_result.get("overall_signal", "中立（様子見）")
    signal_class, signal_icon = SIGNAL_MAP.get(signal, ("neutral", "⏸"))
    risk_class = RISK_MAP.get(ai_result.get("risk_level", "中"), "mid")

    # 関連銘柄データを整理
    related_display = {}
    for ticker, df in related_data.items():
        if df is not None and not df.empty:
            latest = df.iloc[-1]
            prev = df.iloc[-2] if len(df) > 1 else latest
            change_pct = (float(latest["Close"]) - float(prev["Close"])) / float(prev["Close"]) * 100
            related_display[ticker] = {
                "close": float(latest["Close"]),
                "change_pct": change_pct,
                "description": TICKER_DESCRIPTIONS.get(ticker, ticker),
            }

    template = Template(HTML_TEMPLATE)
    html = template.render(
        report_date=report_date,
        soxl=soxl_analysis,
        soxl_latest=soxl_latest,
        related=related_display,
        ai=ai_result,
        signal_class=signal_class,
        signal_icon=signal_icon,
        risk_class=risk_class,
        rsi_period=14,
        bb_period=20,
    )

    os.makedirs(output_dir, exist_ok=True)
    filename = f"soxl_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    filepath = os.path.join(output_dir, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)

    latest_path = os.path.join(output_dir, "latest_report.html")
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(html)

    return filepath
