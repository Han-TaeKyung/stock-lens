import FinanceDataReader as fdr
import pandas as pd
import json, os

def fetch_stock_list():
    print("코스피 종목 수집 중...")
    kospi = fdr.StockListing('KOSPI')[['Code', 'Name', 'Market']].dropna()

    print("코스닥 종목 수집 중...")
    kosdaq = fdr.StockListing('KOSDAQ')[['Code', 'Name', 'Market']].dropna()

    stocks = []
    for _, row in pd.concat([kospi, kosdaq]).iterrows():
        stocks.append({
            "code": str(row['Code']),
            "name": str(row['Name']),
            "market": str(row['Market'])
        })

    os.makedirs('data', exist_ok=True)
    with open('data/stocks.json', 'w', encoding='utf-8') as f:
        json.dump(stocks, f, ensure_ascii=False, indent=2)

    print(f"✅ 총 {len(stocks)}개 종목 저장 완료 → data/stocks.json")

fetch_stock_list()