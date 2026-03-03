import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Optional
from rich.console import Console
from config import TICKERS, DATA_PERIOD, DATA_INTERVAL

console = Console()


def fetch_ticker_data(ticker: str, period: str = DATA_PERIOD, interval: str = DATA_INTERVAL) -> Optional[pd.DataFrame]:
    """単一銘柄のOHLCV データを取得"""
    try:
        t = yf.Ticker(ticker)
        df = t.history(period=period, interval=interval)
        if df.empty:
            console.print(f"[yellow]警告: {ticker} のデータが空です[/yellow]")
            return None
        df.index = df.index.tz_localize(None) if df.index.tz is not None else df.index
        return df
    except Exception as e:
        console.print(f"[red]エラー: {ticker} のデータ取得失敗 - {e}[/red]")
        return None


def fetch_all_data() -> Dict[str, pd.DataFrame]:
    """全銘柄のデータを取得"""
    console.print("[bold blue]市場データを取得中...[/bold blue]")
    data = {}
    for ticker, desc in TICKERS.items():
        console.print(f"  📥 {ticker}: {desc}")
        df = fetch_ticker_data(ticker)
        if df is not None:
            data[ticker] = df
    console.print(f"[green]✓ {len(data)}/{len(TICKERS)} 銘柄のデータ取得完了[/green]")
    return data


def get_ticker_info(ticker: str) -> Dict:
    """銘柄の基本情報を取得"""
    try:
        t = yf.Ticker(ticker)
        info = t.info
        return {
            "name": info.get("longName", ticker),
            "currency": info.get("currency", "USD"),
            "market_cap": info.get("marketCap"),
            "52w_high": info.get("fiftyTwoWeekHigh"),
            "52w_low": info.get("fiftyTwoWeekLow"),
            "avg_volume": info.get("averageVolume"),
        }
    except Exception:
        return {"name": ticker}


def get_latest_price(df: pd.DataFrame) -> Dict:
    """最新価格情報を取得"""
    if df is None or df.empty:
        return {}
    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest
    change = latest["Close"] - prev["Close"]
    change_pct = (change / prev["Close"]) * 100
    return {
        "date": df.index[-1].strftime("%Y-%m-%d"),
        "open": float(latest["Open"]),
        "high": float(latest["High"]),
        "low": float(latest["Low"]),
        "close": float(latest["Close"]),
        "volume": int(latest["Volume"]),
        "change": float(change),
        "change_pct": float(change_pct),
    }
