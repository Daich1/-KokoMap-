#!/usr/bin/env python3
"""
SOXL 投資分析システム
Claude AI × テクニカル分析による売買タイミング支援ツール
"""
import sys
import os
import argparse
from datetime import datetime
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

from data_fetcher import fetch_all_data, get_latest_price
from technical_analysis import analyze
from ai_analyst import run_ai_analysis
from report_generator import generate_report
from config import SOXL_HOLDINGS, CLAUDE_MODEL, ANTHROPIC_API_KEY

console = Console()


def print_banner():
    console.print(Panel.fit(
        "[bold cyan]SOXL 投資分析システム[/bold cyan]\n"
        "[dim]Claude AI × テクニカル分析 | 売買タイミング支援[/dim]",
        border_style="cyan",
    ))
    console.print(f"[dim]実行日時: {datetime.now().strftime('%Y年%m月%d日 %H:%M:%S')}[/dim]")
    console.print(f"[dim]AIモデル: {CLAUDE_MODEL}[/dim]")
    if not ANTHROPIC_API_KEY:
        console.print("[yellow]⚠️  ANTHROPIC_API_KEY未設定 → デモモードで実行します[/yellow]")
    console.print()


def print_summary(soxl_analysis, soxl_latest, ai_result):
    """コンソールにサマリーを表示"""
    signal = ai_result.get("overall_signal", "不明")
    confidence = ai_result.get("confidence", 0)
    risk = ai_result.get("risk_level", "不明")

    signal_colors = {
        "強い買い": "bold green",
        "買い": "green",
        "中立（様子見）": "yellow",
        "売り": "red",
        "強い売り": "bold red",
    }
    color = signal_colors.get(signal, "white")

    console.print(Panel(
        f"[{color}]シグナル: {signal}[/{color}]  確信度: {confidence}%  リスク: {risk}\n\n"
        f"[italic]{ai_result.get('summary', '')}[/italic]",
        title="[bold]AI 総合判断[/bold]",
        border_style=color.replace("bold ", ""),
    ))

    # 価格情報テーブル
    table = Table(box=box.ROUNDED, title="SOXL 価格情報", show_header=True)
    table.add_column("項目", style="dim")
    table.add_column("値", justify="right")
    
    change_pct = soxl_latest.get("change_pct", 0)
    change_color = "green" if change_pct >= 0 else "red"
    
    table.add_row("現在値", f"[bold]${soxl_latest.get('close', 0):.2f}[/bold]")
    table.add_row("前日比", f"[{change_color}]{change_pct:+.2f}%[/{change_color}]")
    table.add_row("RSI", f"{soxl_analysis['rsi']['value']:.1f} ({soxl_analysis['rsi']['signal']})")
    table.add_row("MACD", f"{soxl_analysis['macd']['cross']}")
    table.add_row("トレンド", soxl_analysis["trend"])
    table.add_row("高値比", f"{soxl_analysis['price']['from_52w_high']:.1f}%")
    
    console.print(table)

    # アクションプラン
    if "action_plan" in ai_result:
        plan = ai_result["action_plan"]
        console.print()
        console.print("[bold]📋 アクションプラン[/bold]")
        console.print(f"  [green]エントリー:[/green] {plan.get('entry_condition', 'N/A')}")
        console.print(f"  [yellow]利  確:[/yellow] {plan.get('exit_condition', 'N/A')}")
        console.print(f"  [red]損  切:[/red] {plan.get('stop_loss', 'N/A')}")


def main():
    parser = argparse.ArgumentParser(description="SOXL 投資分析システム")
    parser.add_argument("--no-html", action="store_true", help="HTMLレポートを生成しない")
    parser.add_argument("--output-dir", default="reports", help="レポート出力ディレクトリ")
    parser.add_argument("--open", action="store_true", help="生成後にブラウザでレポートを開く")
    args = parser.parse_args()

    print_banner()

    # 1. データ取得
    all_data = fetch_all_data()
    
    if "SOXL" not in all_data:
        console.print("[bold red]エラー: SOXLデータの取得に失敗しました。ネット接続を確認してください。[/bold red]")
        sys.exit(1)

    soxl_df = all_data.pop("SOXL")
    related_data = all_data  # SOXL以外の関連銘柄

    # 2. テクニカル分析
    console.print("\n[bold blue]テクニカル分析を実行中...[/bold blue]")
    soxl_analysis = analyze(soxl_df)
    soxl_latest = get_latest_price(soxl_df)
    console.print("[green]✓ テクニカル分析完了[/green]")

    # 3. 関連銘柄の簡易データ
    related_summary = {}
    for ticker, df in related_data.items():
        if df is not None:
            related_summary[ticker] = get_latest_price(df)

    # 4. AI分析
    console.print()
    ai_result = run_ai_analysis(soxl_analysis, related_summary, SOXL_HOLDINGS)

    # 5. コンソール出力
    console.print()
    print_summary(soxl_analysis, soxl_latest, ai_result)

    # 6. HTMLレポート生成
    if not args.no_html:
        console.print("\n[bold blue]HTMLレポートを生成中...[/bold blue]")
        report_path = generate_report(
            soxl_analysis=soxl_analysis,
            soxl_latest=soxl_latest,
            related_data=related_data,
            ai_result=ai_result,
            output_dir=args.output_dir,
        )
        console.print(f"[green]✓ レポート生成完了: {report_path}[/green]")
        console.print(f"[dim]最新レポート: {args.output_dir}/latest_report.html[/dim]")

        if args.open:
            import webbrowser
            webbrowser.open(f"file://{os.path.abspath(report_path)}")

    console.print()
    console.print(Panel(
        "[bold yellow]⚠️  免責事項[/bold yellow]\n"
        "本ツールは情報提供のみを目的とし、投資助言ではありません。\n"
        "SOXLは3倍レバレッジETFで、元本を大きく超える損失が生じる可能性があります。\n"
        "投資の最終判断はご自身の責任で行ってください。",
        border_style="yellow",
    ))


if __name__ == "__main__":
    main()
