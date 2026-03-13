import pandas as pd
import numpy as np
from typing import Dict, Any
from config import MA_PERIODS, RSI_PERIOD, MACD_FAST, MACD_SLOW, MACD_SIGNAL, BB_PERIOD, BB_STD


def calc_rsi(series: pd.Series, period: int = RSI_PERIOD) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def calc_macd(series: pd.Series) -> Dict[str, pd.Series]:
    ema_fast = series.ewm(span=MACD_FAST, adjust=False).mean()
    ema_slow = series.ewm(span=MACD_SLOW, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=MACD_SIGNAL, adjust=False).mean()
    histogram = macd_line - signal_line
    return {"macd": macd_line, "signal": signal_line, "histogram": histogram}


def calc_bollinger_bands(series: pd.Series) -> Dict[str, pd.Series]:
    ma = series.rolling(window=BB_PERIOD).mean()
    std = series.rolling(window=BB_PERIOD).std()
    upper = ma + (BB_STD * std)
    lower = ma - (BB_STD * std)
    bandwidth = (upper - lower) / ma * 100
    percent_b = (series - lower) / (upper - lower) * 100
    return {"upper": upper, "middle": ma, "lower": lower, "bandwidth": bandwidth, "percent_b": percent_b}


def calc_moving_averages(series: pd.Series) -> Dict[str, pd.Series]:
    return {f"ma{p}": series.rolling(window=p).mean() for p in MA_PERIODS}


def calc_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high_low = df["High"] - df["Low"]
    high_close = (df["High"] - df["Close"].shift()).abs()
    low_close = (df["Low"] - df["Close"].shift()).abs()
    true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    return true_range.rolling(window=period).mean()


def analyze(df: pd.DataFrame) -> Dict[str, Any]:
    """OHLCV データからテクニカル指標を計算して返す"""
    close = df["Close"]
    volume = df["Volume"]

    rsi = calc_rsi(close)
    macd_data = calc_macd(close)
    bb = calc_bollinger_bands(close)
    mas = calc_moving_averages(close)
    atr = calc_atr(df)

    latest_close = float(close.iloc[-1])
    latest_rsi = float(rsi.iloc[-1])
    latest_macd = float(macd_data["macd"].iloc[-1])
    latest_signal = float(macd_data["signal"].iloc[-1])
    latest_hist = float(macd_data["histogram"].iloc[-1])
    prev_hist = float(macd_data["histogram"].iloc[-2]) if len(macd_data["histogram"]) > 1 else 0.0

    # ボリンジャーバンド
    bb_upper = float(bb["upper"].iloc[-1])
    bb_lower = float(bb["lower"].iloc[-1])
    bb_middle = float(bb["middle"].iloc[-1])
    bb_pct_b = float(bb["percent_b"].iloc[-1])

    # 移動平均との乖離率
    ma_values = {k: float(v.iloc[-1]) for k, v in mas.items() if not np.isnan(v.iloc[-1])}
    ma_deviations = {k: round((latest_close - v) / v * 100, 2) for k, v in ma_values.items()}

    # 出来高分析
    vol_ma20 = float(volume.rolling(20).mean().iloc[-1])
    vol_ratio = float(volume.iloc[-1]) / vol_ma20 if vol_ma20 > 0 else 1.0

    # トレンド判定
    trend = _determine_trend(latest_close, ma_values)
    macd_cross = _detect_macd_cross(macd_data["histogram"])

    # 過去20日・60日・120日の変動率
    returns = {}
    for days in [5, 20, 60, 120]:
        if len(close) > days:
            returns[f"{days}d_return"] = (latest_close / float(close.iloc[-days - 1]) - 1) * 100

    # 最大ドローダウン（過去1年）
    rolling_max = close.cummax()
    drawdown = (close - rolling_max) / rolling_max * 100
    max_drawdown = float(drawdown.min())
    current_drawdown = float(drawdown.iloc[-1])

    return {
        "price": {
            "current": latest_close,
            "52w_high": float(close.max()),
            "52w_low": float(close.min()),
            "from_52w_high": (latest_close / float(close.max()) - 1) * 100,
        },
        "rsi": {
            "value": latest_rsi,
            "signal": _rsi_signal(latest_rsi),
            "history_5d": [round(float(v), 2) for v in rsi.tail(5).tolist()],
        },
        "macd": {
            "macd": latest_macd,
            "signal": latest_signal,
            "histogram": latest_hist,
            "cross": macd_cross,
            "trend": "bullish" if latest_macd > latest_signal else "bearish",
        },
        "bollinger": {
            "upper": bb_upper,
            "middle": bb_middle,
            "lower": bb_lower,
            "percent_b": bb_pct_b,
            "signal": _bb_signal(bb_pct_b),
        },
        "moving_averages": {
            "ma_values": ma_values,
            "deviations": ma_deviations,
            "trend": trend,
        },
        "volume": {
            "latest": int(volume.iloc[-1]),
            "ma20": int(vol_ma20),
            "ratio": vol_ratio,
            "signal": "高出来高" if vol_ratio > 1.5 else ("低出来高" if vol_ratio < 0.7 else "平均的"),
        },
        "atr": {
            "value": float(atr.iloc[-1]),
            "atr_pct": float(atr.iloc[-1]) / latest_close * 100,
        },
        "returns": returns,
        "drawdown": {
            "max": max_drawdown,
            "current": current_drawdown,
        },
        "trend": trend,
        "recent_prices": _get_recent_prices(df, 30),
    }


def _rsi_signal(rsi_val: float) -> str:
    if rsi_val <= 30:
        return "売られすぎ（買いシグナル）"
    elif rsi_val <= 40:
        return "やや売られすぎ"
    elif rsi_val >= 75:
        return "買われすぎ（売りシグナル）"
    elif rsi_val >= 65:
        return "やや買われすぎ"
    return "中立"


def _bb_signal(pct_b: float) -> str:
    if pct_b <= 0:
        return "下限突破（強い買いシグナル候補）"
    elif pct_b <= 20:
        return "下限付近（買い圧力）"
    elif pct_b >= 100:
        return "上限突破（強い売りシグナル候補）"
    elif pct_b >= 80:
        return "上限付近（売り圧力）"
    return "バンド内（中立）"


def _determine_trend(price: float, mas: Dict[str, float]) -> str:
    if not mas:
        return "不明"
    above_count = sum(1 for v in mas.values() if price > v)
    total = len(mas)
    if above_count == total:
        return "強い上昇トレンド"
    elif above_count >= total * 0.75:
        return "上昇トレンド"
    elif above_count >= total * 0.5:
        return "弱い上昇トレンド"
    elif above_count >= total * 0.25:
        return "弱い下降トレンド"
    elif above_count > 0:
        return "下降トレンド"
    return "強い下降トレンド"


def _detect_macd_cross(histogram: pd.Series) -> str:
    if len(histogram) < 2:
        return "データ不足"
    current = float(histogram.iloc[-1])
    prev = float(histogram.iloc[-2])
    if prev <= 0 and current > 0:
        return "ゴールデンクロス（買いシグナル）"
    elif prev >= 0 and current < 0:
        return "デッドクロス（売りシグナル）"
    elif current > 0:
        return "強気継続"
    return "弱気継続"


def _get_recent_prices(df: pd.DataFrame, days: int = 30) -> list:
    recent = df.tail(days)
    result = []
    for date, row in recent.iterrows():
        result.append({
            "date": date.strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
        })
    return result
