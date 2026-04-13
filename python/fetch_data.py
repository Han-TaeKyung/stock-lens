import FinanceDataReader as fdr
import yfinance as yf
import pandas as pd
import ta
import json, os
from datetime import datetime, timedelta

OUTPUT_DIR = 'data/ohlcv'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 저장 기간 (1년)
END_DATE   = datetime.today().strftime('%Y-%m-%d')
START_DATE = (datetime.today() - timedelta(days=365)).strftime('%Y-%m-%d')


def add_indicators(df):
    """MA, RSI, MACD, 볼린저밴드 계산"""
    close = df['Close']

    df['ma5']   = ta.trend.sma_indicator(close, window=5).round(2)
    df['ma20']  = ta.trend.sma_indicator(close, window=20).round(2)
    df['ma60']  = ta.trend.sma_indicator(close, window=60).round(2)
    df['ma120'] = ta.trend.sma_indicator(close, window=120).round(2)

    df['rsi'] = ta.momentum.rsi(close, window=14).round(2)

    macd = ta.trend.MACD(close)
    df['macd']        = macd.macd().round(2)
    df['macd_signal'] = macd.macd_signal().round(2)
    df['macd_hist']   = macd.macd_diff().round(2)

    bb = ta.volatility.BollingerBands(close, window=20, window_dev=2)
    df['bb_upper'] = bb.bollinger_hband().round(2)
    df['bb_mid']   = bb.bollinger_mavg().round(2)
    df['bb_lower'] = bb.bollinger_lband().round(2)

    return df


def save_ohlcv(code, df):
    """DataFrame → JSON 저장"""
    df = df.dropna(subset=['Open', 'High', 'Low', 'Close', 'Volume'])
    records = []
    for date, row in df.iterrows():
        records.append({
            "date":        str(date)[:10],
            "open":        round(float(row['Open']), 2),
            "high":        round(float(row['High']), 2),
            "low":         round(float(row['Low']), 2),
            "close":       round(float(row['Close']), 2),
            "volume":      int(row['Volume']),
            "ma5":         row.get('ma5'),
            "ma20":        row.get('ma20'),
            "ma60":        row.get('ma60'),
            "ma120":       row.get('ma120'),
            "rsi":         row.get('rsi'),
            "macd":        row.get('macd'),
            "macd_signal": row.get('macd_signal'),
            "macd_hist":   row.get('macd_hist'),
            "bb_upper":    row.get('bb_upper'),
            "bb_mid":      row.get('bb_mid'),
            "bb_lower":    row.get('bb_lower'),
        })

    path = os.path.join(OUTPUT_DIR, f"{code}.json")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False)


def fetch_domestic(codes):
    """국내 종목 수집 (FinanceDataReader)"""
    print(f"\n[국내] {len(codes)}개 종목 수집 시작...")
    success, fail = 0, 0
    for code in codes:
        try:
            df = fdr.DataReader(code, START_DATE, END_DATE)
            if df.empty:
                fail += 1
                continue
            df = add_indicators(df)
            save_ohlcv(code, df)
            success += 1
            if success % 50 == 0:
                print(f"  국내 {success}개 완료...")
        except Exception as e:
            fail += 1
    print(f"  ✅ 국내 완료 — 성공: {success}개 / 실패: {fail}개")


def fetch_foreign(tickers):
    """해외 종목 수집 (yfinance)"""
    print(f"\n[해외] {len(tickers)}개 종목 수집 시작...")
    success, fail = 0, 0
    for ticker in tickers:
        try:
            df = yf.download(ticker, start=START_DATE, end=END_DATE,
                             progress=False, auto_adjust=True)
            if df.empty:
                fail += 1
                continue
            df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
            df = add_indicators(df)
            save_ohlcv(ticker, df)
            success += 1
            if success % 20 == 0:
                print(f"  해외 {success}개 완료...")
        except Exception as e:
            fail += 1
    print(f"  ✅ 해외 완료 — 성공: {success}개 / 실패: {fail}개")


if __name__ == '__main__':
    # stocks.json 에서 종목 로드
    with open('data/stocks.json', 'r', encoding='utf-8') as f:
        stocks = json.load(f)

    domestic = [s['code'] for s in stocks if s['market'] in ('KOSPI', 'KOSDAQ')]

    # 해외 주요 종목 (테스트용 10개 — 나중에 확장 가능)
    foreign = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA',
               'TSLA', 'META', 'NFLX', 'AMD', 'INTC']

    fetch_domestic(domestic[:20])   # 처음엔 20개만 테스트
    fetch_foreign(foreign)

    print(f"\n✅ 전체 완료 → data/ohlcv/ 폴더 확인")