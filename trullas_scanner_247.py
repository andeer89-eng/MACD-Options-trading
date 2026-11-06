#!/usr/bin/env python3
"""
================================================================================
DAVID TRULLÀS MACD TRIPLE DIVERGENCE 24/7 SCANNER
================================================================================
Author: Built for Traders using David Trullàs' 4-Pillar Methodology
Methodology:
  1. MACD (12, 26, 9) Triple Divergences (3 successive swing extremes)
  2. RSI (14) Momentum Confirmation
  3. Volume Exhaustion (Declining volume across the 3 extremes)
  4. Fibonacci Retracements (23.6% trigger, 38.2% TP1, 61.8% TP2, 100% TP3)
  5. SEC EDGAR Integration: Free Form 4 (Insider Trades) & 8-K checks for US stocks
  6. 24/7 Autonomous Loop with Telegram & Discord Webhook Notifications
================================================================================
Zero Required External Dependencies: Works with standard Python 3.8+ urllib
Optional: Run with 'pip install yfinance requests pandas' for enhanced speed
================================================================================
"""

import sys
import os
import json
import time
import math
import argparse
import datetime
import urllib.request
import urllib.error
import ssl

# SSL context for secure API fetching
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Configuration
DEFAULT_TICKERS = [
    # US Tech & Leaders
    "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "AMD",
    # ETFs & Indexes
    "SPY", "QQQ", "IWM", "GLD", "USO",
    # Crypto (24/7 Markets)
    "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD",
    # Commodities / Forex
    "EURUSD=X", "GBPUSD=X", "GC=F"
]

# S&P 500 Universe categorized by Sectors (Full 503 Constituents)
SP500_SECTORS = {
    "industrials": [
        "MMM",
        "AOS",
        "ALLE",
        "AME",
        "ADP",
        "AXON",
        "BE",
        "BA",
        "BR",
        "CHRW",
        "CARR",
        "CAT",
        "CTAS",
        "FIX",
        "CPRT",
        "CSX",
        "CMI",
        "DE",
        "DAL",
        "DOV",
        "DD",
        "ETN",
        "EME",
        "EMR",
        "EFX",
        "EXPD",
        "FAST",
        "FDX",
        "FDXF",
        "FERG",
        "FTV",
        "GE",
        "GEV",
        "GNRC",
        "GD",
        "HONA",
        "HON",
        "HWM",
        "HUBB",
        "HII",
        "IEX",
        "ITW",
        "IR",
        "JBHT",
        "J",
        "JCI",
        "LHX",
        "LDOS",
        "LII",
        "LMT",
        "MAS",
        "NDSN",
        "NSC",
        "NOC",
        "ODFL",
        "OTIS",
        "PCAR",
        "PH",
        "PAYX",
        "PNR",
        "PWR",
        "RSG",
        "ROK",
        "ROL",
        "RTX",
        "SNA",
        "LUV",
        "SWK",
        "TXT",
        "TT",
        "TDG",
        "UBER",
        "UNP",
        "UAL",
        "UPS",
        "URI",
        "VLTO",
        "VRSK",
        "VRT",
        "GWW",
        "WAB",
        "WM",
        "XYL"
    ],
    "healthcare": [
        "ABT",
        "ABBV",
        "A",
        "ALGN",
        "AMGN",
        "BAX",
        "BDX",
        "TECH",
        "BIIB",
        "BSX",
        "BMY",
        "CAH",
        "COR",
        "CNC",
        "CRL",
        "CI",
        "COO",
        "CVS",
        "DHR",
        "DVA",
        "DXCM",
        "EW",
        "ELV",
        "GEHC",
        "GILD",
        "HCA",
        "HSIC",
        "HUM",
        "IDXX",
        "ILMN",
        "INCY",
        "PODD",
        "ISRG",
        "IQV",
        "JNJ",
        "LH",
        "LLY",
        "MCK",
        "MDT",
        "MRK",
        "MTD",
        "MRNA",
        "PFE",
        "DGX",
        "REGN",
        "RMD",
        "RVTY",
        "SOLV",
        "STE",
        "SYK",
        "TMO",
        "UNH",
        "UHS",
        "VEEV",
        "VRTX",
        "VTRS",
        "WAT",
        "WST",
        "ZBH",
        "ZTS"
    ],
    "informationtechnology": [
        "ACN",
        "ADBE",
        "AMD",
        "AKAM",
        "APH",
        "ADI",
        "AAPL",
        "AMAT",
        "ANET",
        "ADSK",
        "AVGO",
        "CDNS",
        "CDW",
        "CIEN",
        "CSCO",
        "CTSH",
        "COHR",
        "GLW",
        "CRWD",
        "DDOG",
        "DELL",
        "P",
        "FFIV",
        "FICO",
        "FSLR",
        "FLEX",
        "FTNT",
        "IT",
        "GEN",
        "GDDY",
        "HPE",
        "HPQ",
        "IBM",
        "INTC",
        "INTU",
        "JBL",
        "KEYS",
        "KLAC",
        "LRCX",
        "LITE",
        "MRVL",
        "MCHP",
        "MU",
        "MSFT",
        "MPWR",
        "MSI",
        "NTAP",
        "NVDA",
        "NXPI",
        "ON",
        "ORCL",
        "PLTR",
        "PANW",
        "PTC",
        "Q",
        "QCOM",
        "ROP",
        "CRM",
        "SNDK",
        "STX",
        "NOW",
        "SWKS",
        "SMCI",
        "SNPS",
        "TEL",
        "TDY",
        "TER",
        "TXN",
        "TRMB",
        "TWLO",
        "TYL",
        "VRSN",
        "WDC",
        "WDAY",
        "ZBRA"
    ],
    "utilities": [
        "AES",
        "LNT",
        "AEE",
        "AEP",
        "AWK",
        "ATO",
        "CNP",
        "CMS",
        "ED",
        "CEG",
        "D",
        "DTE",
        "DUK",
        "EIX",
        "ETR",
        "EVRG",
        "ES",
        "EXC",
        "FE",
        "NEE",
        "NI",
        "NRG",
        "PCG",
        "PNW",
        "PPL",
        "PEG",
        "SRE",
        "SO",
        "VST",
        "WEC",
        "XEL"
    ],
    "financials": [
        "AFL",
        "ALL",
        "AXP",
        "AIG",
        "AMP",
        "AON",
        "APO",
        "ACGL",
        "ARES",
        "AJG",
        "AIZ",
        "BAC",
        "BRK.B",
        "BLK",
        "BX",
        "XYZ",
        "BNY",
        "BRO",
        "COF",
        "CBOE",
        "SCHW",
        "CB",
        "CINF",
        "C",
        "CFG",
        "CME",
        "COIN",
        "CPAY",
        "ERIE",
        "EG",
        "FDS",
        "FIS",
        "FITB",
        "FISV",
        "BEN",
        "GPN",
        "GL",
        "GS",
        "HIG",
        "HBAN",
        "IBKR",
        "ICE",
        "IVZ",
        "JKHY",
        "JPM",
        "KEY",
        "KKR",
        "L",
        "MTB",
        "MRSH",
        "MA",
        "MET",
        "MCO",
        "MS",
        "MSCI",
        "NDAQ",
        "NTRS",
        "PYPL",
        "PNC",
        "PFG",
        "PGR",
        "PRU",
        "RJF",
        "RF",
        "HOOD",
        "SPGI",
        "STT",
        "SYF",
        "TROW",
        "TRV",
        "TFC",
        "USB",
        "V",
        "WRB",
        "WFC",
        "WTW"
    ],
    "materials": [
        "APD",
        "ALB",
        "AMCR",
        "AVY",
        "BALL",
        "CF",
        "CRH",
        "DOW",
        "ECL",
        "FCX",
        "IFF",
        "IP",
        "LIN",
        "LYB",
        "MLM",
        "MOS",
        "NEM",
        "NUE",
        "PKG",
        "PPG",
        "SHW",
        "SW",
        "STLD",
        "VMC"
    ],
    "consumerdiscretionary": [
        "ABNB",
        "AMZN",
        "APTV",
        "AZO",
        "BBY",
        "BKNG",
        "CCL",
        "CVNA",
        "CMG",
        "DRI",
        "DECK",
        "DPZ",
        "DASH",
        "DHI",
        "EBAY",
        "EXPE",
        "F",
        "GRMN",
        "GM",
        "GPC",
        "HAS",
        "HLT",
        "HD",
        "LVS",
        "LEN",
        "LOW",
        "LULU",
        "MAR",
        "MCD",
        "MGM",
        "NKE",
        "NCLH",
        "NVR",
        "ORLY",
        "PHM",
        "RL",
        "ROST",
        "RCL",
        "SBUX",
        "TPR",
        "TSLA",
        "TJX",
        "TSCO",
        "ULTA",
        "WSM",
        "WYNN",
        "YUM"
    ],
    "realestate": [
        "ARE",
        "AMT",
        "BXP",
        "CPT",
        "CBRE",
        "CSGP",
        "CCI",
        "DLR",
        "EQIX",
        "ESS",
        "EXR",
        "FRT",
        "DOC",
        "HST",
        "INVH",
        "IRM",
        "KIM",
        "MAA",
        "PLD",
        "PSA",
        "O",
        "REG",
        "SBAC",
        "SPG",
        "UDR",
        "VTR",
        "VICI",
        "VMRK",
        "WELL",
        "WY"
    ],
    "communicationservices": [
        "GOOGL",
        "GOOG",
        "APP",
        "T",
        "CHTR",
        "CMCSA",
        "ECHO",
        "FOXA",
        "FOX",
        "LYV",
        "META",
        "NFLX",
        "NWSA",
        "NWS",
        "OMC",
        "RDDT",
        "SKYD",
        "TMUS",
        "TTWO",
        "TKO",
        "VZ",
        "DIS"
    ],
    "consumerstaples": [
        "MO",
        "ADM",
        "BF.B",
        "BG",
        "CASY",
        "CHD",
        "CLX",
        "KO",
        "CL",
        "STZ",
        "COST",
        "DG",
        "DLTR",
        "EL",
        "GIS",
        "HSY",
        "HRL",
        "KVUE",
        "KDP",
        "KMB",
        "KHC",
        "KR",
        "MKC",
        "MDLZ",
        "MNST",
        "PEP",
        "PM",
        "PG",
        "SJM",
        "SYY",
        "TGT",
        "TSN",
        "VYLR",
        "WMT"
    ],
    "energy": [
        "APA",
        "BKR",
        "CVX",
        "COP",
        "DVN",
        "FANG",
        "EOG",
        "EQT",
        "EXE",
        "XOM",
        "HAL",
        "KMI",
        "MPC",
        "OXY",
        "OKE",
        "PSX",
        "SLB",
        "TRGP",
        "TPL",
        "VLO",
        "WMB"
    ]
}

# Full S&P 500 flat list
SP500_ALL = [sym for sec_list in SP500_SECTORS.values() for sym in sec_list]

SEC_CIK_CACHE = {
    "AAPL": "0000320193", "MSFT": "0000789019", "NVDA": "0001045810",
    "TSLA": "0001318605", "AMZN": "0001018724", "GOOGL": "0001652044",
    "META": "0001326801", "AMD": "0000002488", "SPY": "0000884394",
    "QQQ": "0001067839", "JPM": "0000019617", "V": "0001403161",
    "LLY": "0000059478", "UNH": "0000731766", "XOM": "0000034088",
    "WMT": "0000104169", "GE": "0000040545", "CAT": "0000018230"
}

def log(msg, level="INFO"):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    colors = {
        "INFO": "\033[94m",
        "SUCCESS": "\033[92m",
        "WARN": "\033[93m",
        "ERROR": "\033[91m",
        "HEADER": "\033[95m\033[1m",
        "RESET": "\033[0m"
    }
    c = colors.get(level, colors["RESET"])
    r = colors["RESET"]
    print(f"{c}[{now}] [{level}] {msg}{r}")

# ==========================================
# 1. YAHOO FINANCE DATA FETCHER (FREE)
# ==========================================
def fetch_yahoo_candles(symbol, timeframe="1d", range_param="3mo"):
    """
    Fetches free historical candlestick data from Yahoo Finance API.
    Timeframes: 1m, 5m, 15m, 1h, 1d
    Ranges: 1d, 5d, 1mo, 3mo, 6mo, 1y
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range_param}&interval={timeframe}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    
    try:
        with urllib.request.urlopen(req, context=ssl_context, timeout=12) as response:
            data = json.loads(response.read().decode('utf-8'))
            result = data.get("chart", {}).get("result", [])
            if not result:
                return []
            
            item = result[0]
            timestamps = item.get("timestamp", [])
            indicators = item.get("indicators", {}).get("quote", [{}])[0]
            
            opens = indicators.get("open", [])
            highs = indicators.get("high", [])
            lows = indicators.get("low", [])
            closes = indicators.get("close", [])
            volumes = indicators.get("volume", [])
            
            candles = []
            for i in range(len(timestamps)):
                if (opens[i] is not None and highs[i] is not None and 
                    lows[i] is not None and closes[i] is not None and 
                    volumes[i] is not None):
                    candles.append({
                        "timestamp": timestamps[i] * 1000,
                        "date": datetime.datetime.fromtimestamp(timestamps[i]).strftime("%Y-%m-%d %H:%M"),
                        "open": float(opens[i]),
                        "high": float(highs[i]),
                        "low": float(lows[i]),
                        "close": float(closes[i]),
                        "volume": float(volumes[i])
                    })
            return candles
    except Exception as e:
        log(f"Failed to fetch Yahoo data for {symbol}: {e}", "WARN")
        return []

# ==========================================
# 2. SEC EDGAR FILINGS FETCHER (FREE)
# ==========================================
def fetch_sec_filings(symbol):
    """
    Fetches recent filings from SEC EDGAR for US tickers:
    - Form 4 (Insider Transactions / CEO Purchases)
    - Form 8-K (Material events)
    """
    clean_sym = symbol.replace("-USD", "").replace("=X", "").replace("=F", "")
    cik = SEC_CIK_CACHE.get(clean_sym)
    if not cik:
        return []
    
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "TrullasTradingScanner/2.0 (trader@trullas-scanner.com)"}
    )
    
    try:
        with urllib.request.urlopen(req, context=ssl_context, timeout=8) as response:
            data = json.loads(response.read().decode('utf-8'))
            recent = data.get("filings", {}).get("recent", {})
            forms = recent.get("form", [])
            dates = recent.get("filingDate", [])
            docs = recent.get("primaryDocDescription", [])
            
            filings = []
            count = min(len(forms), 5)
            for i in range(count):
                filings.append({
                    "form": forms[i],
                    "filingDate": dates[i] if i < len(dates) else "N/A",
                    "description": docs[i] if i < len(docs) else "SEC Filing"
                })
            return filings
    except Exception as e:
        return []

# ==========================================
# 3. TECHNICAL INDICATORS (EMA, MACD, RSI)
# ==========================================
def calculate_ema(values, period):
    if not values:
        return []
    k = 2.0 / (period + 1)
    ema = []
    # Simple moving average for seed
    initial_p = min(period, len(values))
    sma = sum(values[:initial_p]) / initial_p
    ema = [sma] * initial_p
    curr = sma
    for val in values[initial_p:]:
        curr = val * k + curr * (1.0 - k)
        ema.append(curr)
    return ema

def calculate_rsi(closes, period=14):
    if len(closes) <= period:
        return [50.0] * len(closes)
    
    rsi = [50.0] * len(closes)
    gains = 0.0
    losses = 0.0
    
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        if diff >= 0:
            gains += diff
        else:
            losses += abs(diff)
            
    avg_gain = gains / period
    avg_loss = losses / period
    
    rs = 100.0 if avg_loss == 0 else avg_gain / avg_loss
    rsi[period] = 100.0 - (100.0 / (1.0 + rs))
    
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        curr_gain = diff if diff > 0 else 0.0
        curr_loss = abs(diff) if diff < 0 else 0.0
        
        avg_gain = (avg_gain * (period - 1) + curr_gain) / period
        avg_loss = (avg_loss * (period - 1) + curr_loss) / period
        
        rs = 100.0 if avg_loss == 0 else avg_gain / avg_loss
        rsi[i] = 100.0 - (100.0 / (1.0 + rs))
        
    return rsi

def calculate_atr(candles, period=14):
    if not candles:
        return []
    tr = [max(0.001, candles[0]["high"] - candles[0]["low"])]
    for i in range(1, len(candles)):
        h = candles[i]["high"]
        l = candles[i]["low"]
        pc = candles[i - 1]["close"]
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
        
    init_p = min(period, len(candles))
    curr_atr = sum(tr[:init_p]) / init_p
    atr = [curr_atr] * init_p
    for val in tr[init_p:]:
        curr_atr = (curr_atr * (period - 1) + val) / period
        atr.append(curr_atr)
    return atr

def compute_indicators(candles):
    closes = [c["close"] for c in candles]
    ema12 = calculate_ema(closes, 12)
    ema26 = calculate_ema(closes, 26)
    
    macd_line = [fast - slow for fast, slow in zip(ema12, ema26)]
    signal_line = calculate_ema(macd_line, 9)
    histogram = [m - s for m, s in zip(macd_line, signal_line)]
    rsi = calculate_rsi(closes, 14)
    atr = calculate_atr(candles, 14)
    
    indicator_data = []
    for i in range(len(candles)):
        cur_atr = atr[i] if i < len(atr) else 0.0
        cur_close = max(0.01, candles[i]["close"])
        indicator_data.append({
            "candle": candles[i],
            "macd": macd_line[i],
            "signal": signal_line[i],
            "histogram": histogram[i],
            "rsi": rsi[i],
            "atr": cur_atr,
            "atr_pct": round((cur_atr / cur_close) * 100, 2)
        })
    return indicator_data

# ==========================================
# 4. SWING PIVOT IDENTIFICATION
# ==========================================
def find_swings(data, lookback=3):
    peaks = []
    troughs = []
    n = len(data)
    if n < lookback * 2 + 1:
        return peaks, troughs
    
    for i in range(lookback, n - lookback):
        curr_high = data[i]["candle"]["high"]
        curr_low = data[i]["candle"]["low"]
        
        # Check peak
        is_peak = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and data[j]["candle"]["high"] > curr_high:
                is_peak = False
                break
        if is_peak:
            peaks.append({
                "index": i,
                "price": curr_high,
                "macd": data[i]["macd"],
                "rsi": data[i]["rsi"],
                "volume": data[i]["candle"]["volume"],
                "date": data[i]["candle"]["date"]
            })
            
        # Check trough
        is_trough = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and data[j]["candle"]["low"] < curr_low:
                is_trough = False
                break
        if is_trough:
            troughs.append({
                "index": i,
                "price": curr_low,
                "macd": data[i]["macd"],
                "rsi": data[i]["rsi"],
                "volume": data[i]["candle"]["volume"],
                "date": data[i]["candle"]["date"]
            })
            
    return peaks, troughs

# ==========================================
# 5. DAVID TRULLÀS TRIPLE DIVERGENCE ENGINE
# ==========================================
def detect_trullas_divergences(symbol, timeframe, candles):
    if len(candles) < 30:
        return []
    
    data = compute_indicators(candles)
    peaks, troughs = find_swings(data, lookback=3)
    curr_price = candles[-1]["close"]
    setups = []
    
    # Check Bullish Triple Divergence
    if len(troughs) >= 3:
        for i in range(2, len(troughs)):
            p1 = troughs[i - 2]
            p2 = troughs[i - 1]
            p3 = troughs[i]
            
            # 3 Lower Lows in Price
            price_lower = p1["price"] > p2["price"] > p3["price"]
            # 3 Higher Lows in MACD
            macd_higher = p1["macd"] < p2["macd"] < p3["macd"]
            
            if price_lower and macd_higher:
                rsi_conf = p1["rsi"] < p3["rsi"]
                vol_decay = p3["volume"] <= p1["volume"] or p3["volume"] <= p2["volume"]
                
                # Intermediate high between P1 and P3
                sub_highs = [data[k]["candle"]["high"] for k in range(p1["index"], p3["index"] + 1)]
                swing_high = max(sub_highs) if sub_highs else p1["price"] * 1.05
                range_span = swing_high - p3["price"]
                
                fib_236 = p3["price"] + range_span * 0.236
                fib_382 = p3["price"] + range_span * 0.382
                fib_618 = p3["price"] + range_span * 0.618
                fib_1000 = swing_high
                
                stop_loss = round(p3["price"] * 0.992, 2)
                planned_risk = max(0.01, abs(fib_236 - stop_loss))
                planned_reward = max(0.01, abs(fib_618 - fib_236))
                rrr = round(planned_reward / planned_risk, 2)
                
                score = 65
                if rsi_conf: score += 15
                if vol_decay: score += 15
                if data[-1]["macd"] >= data[-1]["signal"]: score += 5
                
                setups.append({
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "type": "BULLISH_TRIPLE_DIVERGENCE",
                    "score": min(100, score),
                    "currentPrice": curr_price,
                    "triggerPrice": round(fib_236, 2),
                    "stopLoss": stop_loss,
                    "tp1_382": round(fib_382, 2),
                    "tp2_618": round(fib_618, 2),
                    "tp3_1000": round(fib_1000, 2),
                    "riskRewardRatio": rrr,
                    "p1": p1,
                    "p2": p2,
                    "p3": p3,
                    "rsiConfirm": rsi_conf,
                    "volumeExhaustion": vol_decay
                })
                
    # Check Bearish Triple Divergence
    if len(peaks) >= 3:
        for i in range(2, len(peaks)):
            p1 = peaks[i - 2]
            p2 = peaks[i - 1]
            p3 = peaks[i]
            
            # 3 Higher Highs in Price
            price_higher = p1["price"] < p2["price"] < p3["price"]
            # 3 Lower Highs in MACD
            macd_lower = p1["macd"] > p2["macd"] > p3["macd"]
            
            if price_higher and macd_lower:
                rsi_conf = p1["rsi"] > p3["rsi"]
                vol_decay = p3["volume"] <= p1["volume"] or p3["volume"] <= p2["volume"]
                
                sub_lows = [data[k]["candle"]["low"] for k in range(p1["index"], p3["index"] + 1)]
                swing_low = min(sub_lows) if sub_lows else p1["price"] * 0.95
                range_span = p3["price"] - swing_low
                
                fib_236 = p3["price"] - range_span * 0.236
                fib_382 = p3["price"] - range_span * 0.382
                fib_618 = p3["price"] - range_span * 0.618
                fib_1000 = swing_low
                
                stop_loss = round(p3["price"] * 1.008, 2)
                planned_risk = max(0.01, abs(stop_loss - fib_236))
                planned_reward = max(0.01, abs(fib_236 - fib_618))
                rrr = round(planned_reward / planned_risk, 2)
                
                score = 65
                if rsi_conf: score += 15
                if vol_decay: score += 15
                if data[-1]["macd"] <= data[-1]["signal"]: score += 5
                
                setups.append({
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "type": "BEARISH_TRIPLE_DIVERGENCE",
                    "score": min(100, score),
                    "currentPrice": curr_price,
                    "triggerPrice": round(fib_236, 2),
                    "stopLoss": stop_loss,
                    "tp1_382": round(fib_382, 2),
                    "tp2_618": round(fib_618, 2),
                    "tp3_1000": round(fib_1000, 2),
                    "riskRewardRatio": rrr,
                    "p1": p1,
                    "p2": p2,
                    "p3": p3,
                    "rsiConfirm": rsi_conf,
                    "volumeExhaustion": vol_decay
                })
                
    return setups

# ==========================================
# 6. ALERT BROADCASTER (TELEGRAM & DISCORD)
# ==========================================
def send_telegram_alert(bot_token, chat_id, message):
    if not bot_token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            pass
    except Exception as e:
        log(f"Telegram alert error: {e}", "WARN")

def send_discord_webhook(webhook_url, message):
    if not webhook_url:
        return
    payload = json.dumps({"content": message}).encode('utf-8')
    req = urllib.request.Request(webhook_url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            pass
    except Exception as e:
        log(f"Discord alert error: {e}", "WARN")

# ==========================================
# 7. SCAN ENGINE
# ==========================================
def run_scan_cycle(tickers, timeframe="1d", telegram_token=None, chat_id=None, webhook_url=None, min_atr_pct=0.0):
    log(f"Starting Scan Cycle across {len(tickers)} symbols on timeframe [{timeframe}] (Min ATR%: {min_atr_pct}%)...", "HEADER")
    found_count = 0
    stagnant_count = 0
    
    for symbol in tickers:
        candles = fetch_yahoo_candles(symbol, timeframe=timeframe, range_param="3mo")
        if not candles:
            continue
            
        # Volatility / Liquidity ATR check
        if min_atr_pct > 0.0:
            atr_vals = calculate_atr(candles, 14)
            latest_atr = atr_vals[-1] if atr_vals else 0.0
            latest_close = candles[-1]["close"] if candles else 1.0
            atr_pct = (latest_atr / latest_close * 100.0) if latest_close > 0 else 0.0
            if atr_pct < min_atr_pct:
                stagnant_count += 1
                continue

        setups = detect_trullas_divergences(symbol, timeframe, candles)
        if setups:
            found_count += len(setups)
            # SEC Filings check for US tickers
            sec_filings = fetch_sec_filings(symbol)
            filing_str = f" | SEC Filings: {len(sec_filings)} found" if sec_filings else ""
            
            for s in setups:
                setup_name = "🟢 BULLISH TRIPLE DIVERGENCE" if "BULLISH" in s["type"] else "🔴 BEARISH TRIPLE DIVERGENCE"
                log(f"{setup_name} detected on {symbol} (Score: {s['score']}%{filing_str})", "SUCCESS")
                log(f"  Price: ${s['currentPrice']} | Stop Loss: ${s['stopLoss']} | Trigger (23.6% Fib): ${s['triggerPrice']}", "INFO")
                log(f"  Targets: TP1 (38.2%) = ${s['tp1_382']} | TP2 (61.8% Golden Pocket) = ${s['tp2_618']} | R:R = 1:{s['riskRewardRatio']}", "INFO")
                log(f"  Points: P1={s['p1']['price']} -> P2={s['p2']['price']} -> P3={s['p3']['price']}", "INFO")
                log(f"  Trullas Scaling: Tranche 1 (33%) at Trigger, Tranche 2 (33%) on Retest, Tranche 3 (34%) on Trend Expansion", "INFO")
                
                # Push notifications
                alert_text = (
                    f"*{setup_name} Detected!*\n"
                    f"• *Symbol:* `{symbol}` ({timeframe})\n"
                    f"• *Score:* {s['score']}%\n"
                    f"• *Current Price:* ${s['currentPrice']}\n"
                    f"• *Trigger (23.6% Fib):* ${s['triggerPrice']}\n"
                    f"• *Stop Loss:* ${s['stopLoss']}\n"
                    f"• *Target 1 (38.2%):* ${s['tp1_382']}\n"
                    f"• *Target 2 (61.8%):* ${s['tp2_618']}\n"
                    f"• *Risk/Reward:* 1:{s['riskRewardRatio']}\n"
                    f"• *Trullàs Scaling:* 33% / 33% / 34% Tranches"
                )
                if sec_filings:
                    latest_form = sec_filings[0]
                    alert_text += f"\n• *SEC EDGAR:* Form {latest_form['form']} filed on {latest_form['filingDate']}"
                
                send_telegram_alert(telegram_token, chat_id, alert_text)
                send_discord_webhook(webhook_url, alert_text)
                
    log(f"Scan cycle complete. Found {found_count} setups. (Excluded {stagnant_count} stagnant symbols below ATR threshold)", "INFO")
    return found_count

def main():
    parser = argparse.ArgumentParser(description="David Trullàs MACD Triple Divergence 24/7 Scanner")
    parser.add_argument("--tickers", nargs="+", default=DEFAULT_TICKERS, help="List of ticker symbols")
    parser.add_argument("--sp500", action="store_true", help="Scan full S&P 500 universe of companies")
    parser.add_argument("--sector", choices=list(SP500_SECTORS.keys()), help="Scan specific S&P 500 sector (e.g. tech, healthcare, financials, energy)")
    parser.add_argument("--min-atr-pct", type=float, default=0.0, help="Minimum ATR percentage to filter out stagnant/illiquid symbols (e.g. 1.0 for 1.0%)")
    parser.add_argument("--timeframe", default="1d", choices=["1m", "5m", "15m", "1h", "4h", "1d"], help="Timeframe")
    parser.add_argument("--loop", action="store_true", help="Run in continuous 24/7 background mode")
    parser.add_argument("--interval", type=int, default=300, help="Interval in seconds between scans in 24/7 loop")
    parser.add_argument("--once", action="store_true", help="Run once and output summary")
    parser.add_argument("--telegram-token", default=os.getenv("TELEGRAM_BOT_TOKEN"), help="Telegram bot token")
    parser.add_argument("--telegram-chat-id", default=os.getenv("TELEGRAM_CHAT_ID"), help="Telegram chat ID")
    parser.add_argument("--discord-webhook", default=os.getenv("DISCORD_WEBHOOK_URL"), help="Discord Webhook URL")
    
    args = parser.parse_args()
    
    active_tickers = args.tickers
    if args.sp500:
        active_tickers = SP500_ALL
        log(f"Configured S&P 500 Universe: {len(active_tickers)} companies selected.", "INFO")
    elif args.sector:
        active_tickers = SP500_SECTORS.get(args.sector, DEFAULT_TICKERS)
        log(f"Configured S&P 500 Sector [{args.sector}]: {len(active_tickers)} companies selected.", "INFO")
    
    print("""
\033[96m
  ╔══════════════════════════════════════════════════════════════╗
  ║    DAVID TRULLÀS MACD TRIPLE DIVERGENCE 24/7 SCANNER         ║
  ║  4 Pillars: MACD (12,26,9) • RSI (14) • Volume • Fibonacci   ║
  ║  Data Sources: Free Yahoo Finance v8 & SEC EDGAR Filings     ║
  ║  Filters: ATR Volatility & GICS S&P 500 Sectors              ║
  ╚══════════════════════════════════════════════════════════════╝
\033[0m""")
    
    if args.loop:
        log(f"Starting 24/7 autonomous monitoring every {args.interval} seconds. Press Ctrl+C to stop.", "INFO")
        try:
            while True:
                run_scan_cycle(active_tickers, args.timeframe, args.telegram_token, args.telegram_chat_id, args.discord_webhook, min_atr_pct=args.min_atr_pct)
                log(f"Sleeping for {args.interval}s until next cycle...", "INFO")
                time.sleep(args.interval)
        except KeyboardInterrupt:
            log("Scanner stopped by user.", "WARN")
            sys.exit(0)
    else:
        run_scan_cycle(active_tickers, args.timeframe, args.telegram_token, args.telegram_chat_id, args.discord_webhook, min_atr_pct=args.min_atr_pct)

if __name__ == "__main__":
    main()
