"""
Alphalens factor analysis scaffold.

Ports your Pine Script indicators to Python, runs Alphalens on each one
against a universe of assets, and ranks them by Information Coefficient.

USAGE
-----
1. Install deps:
   pip install alphalens-reloaded yfinance pandas numpy matplotlib

2. Edit UNIVERSE / START / END below.

3. Add your remaining indicators following the pattern in INDICATOR PORTS.

4. Run:
   python alphalens_factor_analysis.py

OUTPUTS
-------
- tearsheets/<factor_name>.png   Full Alphalens tearsheet per factor
- factor_ranking.csv             Mean IC by factor, ranked

INTERPRETATION
--------------
- IC (Information Coefficient): Spearman rank correlation between factor
  and forward returns. 0.02-0.05 is normal and tradeable. >0.10 = check
  for look-ahead bias. <0.01 = factor is noise.
- IC > 0 means the factor predicts returns in the expected direction.
- t-stat of IC > 2 means statistically meaningful predictive power.
- Quantile spread (top minus bottom quintile return): the actual edge.
"""

import os
import warnings
warnings.filterwarnings('ignore')

import pandas as pd
import numpy as np
import yfinance as yf
import alphalens as al
from alphalens.utils import get_clean_factor_and_forward_returns
import matplotlib.pyplot as plt


# ============================================================
# CONFIG
# ============================================================
UNIVERSE = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD',
    'JPM', 'BAC', 'V', 'MA', 'UNH', 'JNJ', 'PFE', 'WMT', 'PG', 'KO',
    'PEP', 'XOM', 'CVX', 'HD', 'DIS', 'NFLX', 'CSCO', 'INTC', 'CRM',
    'ORCL', 'IBM', 'QCOM',
]
START = '2020-01-01'
END   = '2025-01-01'
FORWARD_PERIODS = (1, 5, 10)   # 1d, 5d, 10d forward returns
QUANTILES = 5                  # quintile bucketing


# ============================================================
# DATA
# ============================================================
def load_ohlcv(tickers, start, end):
    """Returns dict {ticker: DataFrame[Open,High,Low,Close,Volume]}."""
    raw = yf.download(
        tickers, start=start, end=end,
        group_by='ticker', auto_adjust=True, progress=False,
    )
    out = {}
    for t in tickers:
        try:
            df = raw[t].dropna()
            if len(df) > 252:           # at least 1 year of data
                out[t] = df
        except KeyError:
            print(f'  skipped {t}: no data')
    return out


# ============================================================
# INDICATOR PORTS — one function per factor, all return pd.Series
# ============================================================
def zscore_volume(df, length=20):
    """Your Pine volume Z-score spike detector."""
    v = df['Volume']
    return (v - v.rolling(length).mean()) / v.rolling(length).std()


def atr_percentile(df, atr_length=14, rank_length=252):
    """ATR percentile regime gate (AGAIG)."""
    tr = pd.concat([
        df['High'] - df['Low'],
        (df['High'] - df['Close'].shift(1)).abs(),
        (df['Low']  - df['Close'].shift(1)).abs(),
    ], axis=1).max(axis=1)
    atr = tr.rolling(atr_length).mean()
    return atr.rolling(rank_length).rank(pct=True)


def adx_strength(df, length=14):
    """ADX from ICE regime classifier."""
    high, low, close = df['High'], df['Low'], df['Close']
    up_move   = high.diff()
    down_move = -low.diff()
    plus_dm  = up_move.where((up_move > down_move) & (up_move > 0), 0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0)
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low  - close.shift(1)).abs(),
    ], axis=1).max(axis=1)
    atr = tr.rolling(length).mean()
    plus_di  = 100 * plus_dm.rolling(length).mean()  / atr
    minus_di = 100 * minus_dm.rolling(length).mean() / atr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.rolling(length).mean()


def macd_histogram(df, fast=12, slow=26, signal=9):
    """CM_MacD_Ult — histogram component."""
    ema_fast = df['Close'].ewm(span=fast,  adjust=False).mean()
    ema_slow = df['Close'].ewm(span=slow,  adjust=False).mean()
    macd = ema_fast - ema_slow
    return macd - macd.ewm(span=signal, adjust=False).mean()


def vix_fix(df, length=22):
    """Williams VIX Fix — WhaleFusion volatility expansion."""
    highest_close = df['Close'].rolling(length).max()
    return ((highest_close - df['Low']) / highest_close) * 100


def vwap_distance(df, length=20):
    """Distance from rolling VWAP, normalized."""
    tp = (df['High'] + df['Low'] + df['Close']) / 3
    vwap = (tp * df['Volume']).rolling(length).sum() / df['Volume'].rolling(length).sum()
    return (df['Close'] - vwap) / df['Close']


def b_xtrender(df, ema_short=5, ema_long=20, rsi_len=15):
    """B-Xtrender — RSI of EMA differential, centered at 0."""
    diff = (df['Close'].ewm(span=ema_short, adjust=False).mean()
            - df['Close'].ewm(span=ema_long, adjust=False).mean())
    delta = diff.diff()
    gain  = delta.clip(lower=0).rolling(rsi_len).mean()
    loss  = (-delta.clip(upper=0)).rolling(rsi_len).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)) - 50


def whale_volume_signed(df, length=20):
    """Whale-volume Z-score signed by close direction."""
    v = df['Volume']
    z = (v - v.rolling(length).mean()) / v.rolling(length).std()
    return z * np.sign(df['Close'].diff())


def keltner_position(df, ema_len=20, atr_len=14):
    """Position within Keltner Channel: -1 (lower) to +1 (upper)."""
    ema = df['Close'].ewm(span=ema_len, adjust=False).mean()
    tr = pd.concat([
        df['High'] - df['Low'],
        (df['High'] - df['Close'].shift(1)).abs(),
        (df['Low']  - df['Close'].shift(1)).abs(),
    ], axis=1).max(axis=1)
    atr = tr.rolling(atr_len).mean()
    return (df['Close'] - ema) / (2 * atr)


# TODO: port your remaining indicators from AGAIG following the pattern above.
# Each function takes an OHLCV DataFrame and returns a pd.Series.
#
# def trend_flow_trail(df): ...
# def your_indicator_10(df): ...
# def your_indicator_11(df): ...
# def your_indicator_12(df): ...


FACTORS = {
    'zscore_volume':    zscore_volume,
    'atr_percentile':   atr_percentile,
    'adx_strength':     adx_strength,
    'macd_histogram':   macd_histogram,
    'vix_fix':          vix_fix,
    'vwap_distance':    vwap_distance,
    'b_xtrender':       b_xtrender,
    'whale_volume':     whale_volume_signed,
    'keltner_position': keltner_position,
}


# ============================================================
# FACTOR ASSEMBLY — build the panel Alphalens needs
# ============================================================
def build_factor_panel(data, factor_fn):
    """
    Returns a Series with MultiIndex (date, asset) — Alphalens's expected shape.

    CRITICAL: applies .shift(1) inside this function so that the factor value
    at time T is only available at time T+1. This prevents the #1 source of
    inflated backtest IC.
    """
    pieces = []
    for ticker, df in data.items():
        f = factor_fn(df).shift(1)         # <<< prevent look-ahead
        f.name = 'factor'
        f = f.reset_index()
        f['asset'] = ticker
        f = f.rename(columns={'Date': 'date'})
        f = f.set_index(['date', 'asset'])['factor']
        pieces.append(f)
    return pd.concat(pieces).sort_index().dropna()


def build_price_panel(data):
    """DataFrame of close prices indexed by date, columns = tickers."""
    closes = {t: df['Close'] for t, df in data.items()}
    panel = pd.DataFrame(closes)
    panel.index.name = 'date'
    return panel


# ============================================================
# ALPHALENS RUN
# ============================================================
def analyze_factor(name, factor_data, prices, outdir='tearsheets'):
    """Run Alphalens on a single factor. Returns mean IC per period."""
    clean = get_clean_factor_and_forward_returns(
        factor=factor_data,
        prices=prices,
        quantiles=QUANTILES,
        periods=FORWARD_PERIODS,
        max_loss=0.5,
    )
    ic = al.performance.factor_information_coefficient(clean)

    fig = plt.figure(figsize=(16, 22))
    al.tears.create_full_tear_sheet(clean, long_short=True)
    plt.savefig(f'{outdir}/{name}.png', dpi=80, bbox_inches='tight')
    plt.close('all')

    return ic.mean()


# ============================================================
# MAIN
# ============================================================
def main():
    os.makedirs('tearsheets', exist_ok=True)

    print(f'Loading {len(UNIVERSE)} tickers from yfinance...')
    data = load_ohlcv(UNIVERSE, START, END)
    prices = build_price_panel(data)
    print(f'  got {len(data)} usable tickers, {len(prices)} bars\n')

    summary = []
    for name, fn in FACTORS.items():
        print(f'Analyzing {name}...')
        try:
            factor = build_factor_panel(data, fn)
            mean_ic = analyze_factor(name, factor, prices)
            row = {'factor': name}
            row.update({f'IC_{p}D': v for p, v in mean_ic.items()})
            row['IC_avg'] = mean_ic.mean()
            summary.append(row)
            print(f'  mean IC: {mean_ic.to_dict()}')
        except Exception as e:
            print(f'  FAILED: {e}')
            summary.append({'factor': name, 'error': str(e)})

    summary_df = (pd.DataFrame(summary)
                  .set_index('factor')
                  .sort_values('IC_avg', ascending=False))
    summary_df.to_csv('factor_ranking.csv')

    print('\n' + '=' * 60)
    print('FACTOR RANKING BY MEAN IC')
    print('=' * 60)
    print(summary_df)
    print('\nTearsheets written to ./tearsheets/')
    print('Summary written to factor_ranking.csv')


if __name__ == '__main__':
    main()
