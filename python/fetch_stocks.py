import FinanceDataReader as fdr
import pandas as pd
import json, os

def fetch_stock_list():
    all_stocks = []

    # ── 코스피 ──────────────────────────
    print("코스피 종목 수집 중...")
    try:
        kospi = fdr.StockListing('KOSPI')[['Code', 'Name', 'Market']].dropna()
        for _, row in kospi.iterrows():
            all_stocks.append({"code": str(row['Code']), "name": str(row['Name']), "market": "KOSPI"})
        print(f"  코스피: {len(kospi)}개")
    except Exception as e:
        print(f"  코스피 실패: {e}")

    # ── 코스닥 ──────────────────────────
    print("코스닥 종목 수집 중...")
    try:
        kosdaq = fdr.StockListing('KOSDAQ')[['Code', 'Name', 'Market']].dropna()
        for _, row in kosdaq.iterrows():
            all_stocks.append({"code": str(row['Code']), "name": str(row['Name']), "market": "KOSDAQ"})
        print(f"  코스닥: {len(kosdaq)}개")
    except Exception as e:
        print(f"  코스닥 실패: {e}")

    # ── 국내 ETF ────────────────────────
    print("국내 ETF 수집 중...")
    try:
        etf = fdr.StockListing('ETF/KR')
        print(f"  ETF 컬럼: {list(etf.columns)}")
        code_col = next((c for c in etf.columns if c in ['Code', 'Symbol', 'code', 'symbol']), None)
        name_col = next((c for c in etf.columns if c in ['Name', 'name', 'ShortName', 'longName']), None)
        if not code_col or not name_col:
            print(f"  ETF 컬럼 인식 실패: {list(etf.columns)}")
        else:
            etf = etf[[code_col, name_col]].dropna()
            for _, row in etf.iterrows():
                all_stocks.append({"code": str(row[code_col]), "name": str(row[name_col]), "market": "ETF_KR"})
            print(f"  국내 ETF: {len(etf)}개")
    except Exception as e:
        print(f"  국내 ETF 실패: {e}")

    # ── 해외 개별 주식 ──────────────────
    print("해외 개별주식 추가 중...")
    us_stocks = [
        ("AAPL", "Apple"), ("MSFT", "Microsoft"), ("GOOGL", "Alphabet"),
        ("AMZN", "Amazon"), ("NVDA", "NVIDIA"), ("TSLA", "Tesla"),
        ("META", "Meta"), ("NFLX", "Netflix"), ("AMD", "AMD"),
        ("INTC", "Intel"), ("JPM", "JPMorgan"), ("V", "Visa"),
        ("WMT", "Walmart"), ("JNJ", "Johnson & Johnson"), ("UNH", "UnitedHealth"),
        ("XOM", "ExxonMobil"), ("MA", "Mastercard"), ("HD", "Home Depot"),
        ("PG", "Procter & Gamble"), ("COST", "Costco"), ("ABBV", "AbbVie"),
        ("MRK", "Merck"), ("CVX", "Chevron"), ("PEP", "PepsiCo"),
        ("KO", "Coca-Cola"), ("AVGO", "Broadcom"), ("LLY", "Eli Lilly"),
        ("ORCL", "Oracle"), ("CRM", "Salesforce"), ("ADBE", "Adobe"),
        ("CSCO", "Cisco"), ("ACN", "Accenture"), ("TMO", "Thermo Fisher"),
        ("DHR", "Danaher"), ("MCD", "McDonald's"), ("NKE", "Nike"),
        ("TXN", "Texas Instruments"), ("QCOM", "Qualcomm"), ("HON", "Honeywell"),
        ("UPS", "UPS"), ("BA", "Boeing"), ("CAT", "Caterpillar"),
        ("GE", "GE Aerospace"), ("MMM", "3M"), ("IBM", "IBM"),
        ("GS", "Goldman Sachs"), ("MS", "Morgan Stanley"), ("BAC", "Bank of America"),
        ("WFC", "Wells Fargo"), ("C", "Citigroup"),
        # 양자컴퓨터 관련주
        ("IONQ", "IonQ"),
        ("RGTI", "Rigetti Computing"),
        ("IREN", "Irene Energy"),
        # 소재·부품
        ("MP",   "MP Materials"),
        ("GLW",  "Corning"),
    ]
    for code, name in us_stocks:
        all_stocks.append({"code": code, "name": name, "market": "US_STOCK"})
    print(f"  해외 개별주식: {len(us_stocks)}개")

    # ── 해외 ETF ────────────────────────
    print("해외 ETF 추가 중...")
    us_etfs = [
        ("SPY",  "SPDR S&P 500 ETF"),
        ("QQQ",  "Invesco QQQ (나스닥100)"),
        ("VTI",  "Vanguard Total Market ETF"),
        ("VOO",  "Vanguard S&P 500 ETF"),
        ("IWM",  "iShares Russell 2000 ETF"),
        ("DIA",  "SPDR Dow Jones ETF"),
        ("GLD",  "SPDR Gold Shares"),
        ("SLV",  "iShares Silver Trust"),
        ("TLT",  "iShares 20Y Treasury ETF"),
        ("HYG",  "iShares High Yield Bond ETF"),
        ("XLK",  "Technology Select Sector ETF"),
        ("XLF",  "Financial Select Sector ETF"),
        ("XLE",  "Energy Select Sector ETF"),
        ("XLV",  "Health Care Select Sector ETF"),
        ("XLI",  "Industrial Select Sector ETF"),
        ("ARKK", "ARK Innovation ETF"),
        ("ARKW", "ARK Next Generation Internet ETF"),
        ("SOXL", "Direxion Semiconductor Bull 3X"),
        ("TQQQ", "ProShares UltraPro QQQ 3X"),
        ("SOXS", "Direxion Semiconductor Bear 3X"),
    ]
    for code, name in us_etfs:
        all_stocks.append({"code": code, "name": name, "market": "US_ETF"})
    print(f"  해외 ETF: {len(us_etfs)}개")

    # ── 저장 ────────────────────────────
    os.makedirs('data', exist_ok=True)
    with open('data/stocks.json', 'w', encoding='utf-8') as f:
        json.dump(all_stocks, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 총 {len(all_stocks)}개 종목 저장 완료 → data/stocks.json")

if __name__ == '__main__':
    fetch_stock_list()
