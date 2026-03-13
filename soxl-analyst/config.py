import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")

SOXL_HOLDINGS = int(os.getenv("SOXL_HOLDINGS", "200000"))
SOXL_SHARES = float(os.getenv("SOXL_SHARES", "0"))
ALERT_RSI_OVERSOLD = float(os.getenv("ALERT_RSI_OVERSOLD", "30"))
ALERT_RSI_OVERBOUGHT = float(os.getenv("ALERT_RSI_OVERBOUGHT", "75"))

# 分析対象銘柄
TICKERS = {
    "SOXL": "Direxion デイリー半導体株 ブル3倍 ETF（主要対象）",
    "SOXX": "iShares 半導体 ETF（SOXLの原資産）",
    "SMH": "VanEck 半導体 ETF（比較指標）",
    "QQQ": "Invesco QQQ（ナスダック100）",
    "SPY": "SPDR S&P500 ETF（市場全体）",
    "^VIX": "CBOE ボラティリティ指数（恐怖指数）",
    "^SOX": "PHLX 半導体指数",
}

# テクニカル分析パラメータ
MA_PERIODS = [5, 20, 50, 200]
RSI_PERIOD = 14
MACD_FAST = 12
MACD_SLOW = 26
MACD_SIGNAL = 9
BB_PERIOD = 20
BB_STD = 2.0

# データ取得期間
DATA_PERIOD = "1y"      # 1年分
DATA_INTERVAL = "1d"    # 日足
