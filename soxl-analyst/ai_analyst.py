import anthropic
import json
from typing import Dict, Any
from datetime import datetime
from rich.console import Console
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, SOXL_HOLDINGS, ALERT_RSI_OVERSOLD, ALERT_RSI_OVERBOUGHT

console = Console()


SYSTEM_PROMPT = """あなたはプロのテクニカルアナリストかつ米国ETF専門家です。
SOXL（Direxion デイリー半導体株ブル3倍ETF）の投資家に向けて、データに基づいた客観的な分析と推奨を行います。

以下の点を踏まえて分析してください：
1. SOXLは3倍レバレッジETFであり、通常のETFよりも大きな値動きをします
2. レバレッジETFは長期保有するとコンタンゴ減衰（日次リバランスコスト）が発生します
3. 半導体セクターは景気敏感・金利敏感であり、米国の経済指標・FRB政策の影響を強く受けます
4. 投資家は楽天証券で取引を行う日本の個人投資家です

分析結果は必ず以下の形式のJSONで返してください：
{
  "overall_signal": "強い買い" | "買い" | "中立（様子見）" | "売り" | "強い売り",
  "confidence": 0〜100（確信度）,
  "summary": "3〜4文の総合判断サマリー（日本語）",
  "bullish_factors": ["強気要因1", "強気要因2", ...],
  "bearish_factors": ["弱気要因1", "弱気要因2", ...],
  "key_levels": {
    "support1": 価格,
    "support2": 価格,
    "resistance1": 価格,
    "resistance2": 価格
  },
  "action_plan": {
    "entry_condition": "エントリー条件の説明",
    "exit_condition": "利確条件の説明",
    "stop_loss": "損切り条件の説明",
    "position_sizing": "ポジションサイズの推奨"
  },
  "risk_level": "低" | "中" | "高" | "極高",
  "time_horizon": "短期（数日）" | "中期（数週間）" | "長期（数ヶ月）",
  "additional_notes": "その他重要な注意事項・市場環境コメント"
}"""


def build_analysis_prompt(
    soxl_analysis: Dict[str, Any],
    related_data: Dict[str, Any],
    current_holdings: float,
) -> str:
    today = datetime.now().strftime("%Y年%m月%d日")
    
    prompt = f"""本日（{today}）のSOXL投資分析を行ってください。

## 投資家プロフィール
- 現在の保有/投資予定額: ¥{current_holdings:,.0f}
- 取引所: 楽天証券（米国ETF）

## SOXL テクニカルデータ
```json
{json.dumps(soxl_analysis, ensure_ascii=False, indent=2)}
```

## 関連銘柄・指標データ
```json
{json.dumps(related_data, ensure_ascii=False, indent=2)}
```

上記のデータを総合的に分析し、本日の投資判断を提供してください。
特に以下の点に注目してください：
- SOXLの現在のトレンドと勢い
- 半導体セクター全体（SOX, SOXX, SMH）の状況
- 市場全体（QQQ, SPY）との相関
- VIXが示すリスク環境
- 支持線・抵抗線の位置
- レバレッジETF特有のリスク

日本の個人投資家向けに、具体的かつ実践的な投資判断を提供してください。"""
    
    return prompt


def run_ai_analysis(
    soxl_analysis: Dict[str, Any],
    related_data: Dict[str, Any],
    holdings: float = SOXL_HOLDINGS,
) -> Dict[str, Any]:
    """Claude APIを呼び出してAI分析を実行"""
    
    if not ANTHROPIC_API_KEY:
        console.print("[yellow]⚠️  ANTHROPIC_API_KEY が設定されていません。モックデータを使用します。[/yellow]")
        return _mock_analysis(soxl_analysis)

    console.print(f"[bold blue]AI分析中... (モデル: {CLAUDE_MODEL})[/bold blue]")
    
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    prompt = build_analysis_prompt(soxl_analysis, related_data, holdings)

    try:
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        
        raw_text = message.content[0].text
        
        # JSONを抽出（コードブロック内の場合も考慮）
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()
        
        result = json.loads(raw_text)
        result["model_used"] = CLAUDE_MODEL
        result["tokens_used"] = {
            "input": message.usage.input_tokens,
            "output": message.usage.output_tokens,
        }
        console.print(f"[green]✓ AI分析完了（使用トークン: 入力{message.usage.input_tokens} / 出力{message.usage.output_tokens}）[/green]")
        return result
        
    except json.JSONDecodeError as e:
        console.print(f"[red]JSONパースエラー: {e}[/red]")
        return {"error": str(e), "raw": raw_text}
    except anthropic.APIError as e:
        console.print(f"[red]Claude APIエラー: {e}[/red]")
        return {"error": str(e)}


def _mock_analysis(soxl_analysis: Dict[str, Any]) -> Dict[str, Any]:
    """APIキーなしのデモ用モック分析"""
    rsi = soxl_analysis.get("rsi", {}).get("value", 50)
    trend = soxl_analysis.get("trend", "不明")
    price = soxl_analysis.get("price", {}).get("current", 0)
    
    if rsi < 35:
        signal = "買い"
        summary = f"RSI({rsi:.1f})が売られすぎ水準。テクニカルリバウンドの可能性。ただしAPIキー設定後に詳細分析を推奨。"
    elif rsi > 70:
        signal = "売り"
        summary = f"RSI({rsi:.1f})が買われすぎ水準。利確または新規買い控えを推奨。APIキー設定後に詳細分析を推奨。"
    else:
        signal = "中立（様子見）"
        summary = f"RSI({rsi:.1f})は中立域。{trend}。APIキーを設定するとClaude AIによる詳細分析が利用できます。"

    return {
        "overall_signal": signal,
        "confidence": 50,
        "summary": summary,
        "bullish_factors": ["テクニカルリバウンド余地あり" if rsi < 50 else "上昇トレンド継続"],
        "bearish_factors": ["APIキー未設定のため簡易分析のみ"],
        "key_levels": {
            "support1": round(price * 0.95, 2),
            "support2": round(price * 0.90, 2),
            "resistance1": round(price * 1.05, 2),
            "resistance2": round(price * 1.10, 2),
        },
        "action_plan": {
            "entry_condition": "ANTHROPIC_API_KEY を設定して詳細分析を確認してください",
            "exit_condition": "ANTHROPIC_API_KEY を設定して詳細分析を確認してください",
            "stop_loss": "ANTHROPIC_API_KEY を設定して詳細分析を確認してください",
            "position_sizing": "ANTHROPIC_API_KEY を設定して詳細分析を確認してください",
        },
        "risk_level": "中",
        "time_horizon": "中期（数週間）",
        "additional_notes": "⚠️ これはデモ分析です。.envファイルにANTHROPIC_API_KEYを設定してください。",
        "model_used": "mock",
    }
