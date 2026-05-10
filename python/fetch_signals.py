import json
import os
from datetime import datetime

OHLCV_DIR  = 'data/ohlcv'
OUTPUT_FILE = 'data/signals.json'


def detect_signals(code, data):
    """종목 하나에 대해 매매 신호 탐지"""
    signals = []
    if len(data) < 2:
        return signals

    for i in range(1, len(data)):
        cur = data[i]
        prv = data[i - 1]
        date = cur['date']

        # ── 골든크로스 (MA5가 MA20을 상향 돌파)
        if (prv.get('ma5') and prv.get('ma20') and cur.get('ma5') and cur.get('ma20')):
            if prv['ma5'] < prv['ma20'] and cur['ma5'] > cur['ma20']:
                signals.append({
                    "code": code, "date": date,
                    "type": "golden_cross",
                    "side": "buy",
                    "label": "골든크로스",
                    "price": cur['close']
                })

        # ── 데드크로스 (MA5가 MA20을 하향 돌파)
            if prv['ma5'] > prv['ma20'] and cur['ma5'] < cur['ma20']:
                signals.append({
                    "code": code, "date": date,
                    "type": "dead_cross",
                    "side": "sell",
                    "label": "데드크로스",
                    "price": cur['close']
                })

        # ── RSI 과매도 (30 이하 → 반등 매수)
        if (prv.get('rsi') and cur.get('rsi')):
            if prv['rsi'] < 30 and cur['rsi'] >= 30:
                signals.append({
                    "code": code, "date": date,
                    "type": "rsi_oversold",
                    "side": "buy",
                    "label": "RSI 과매도 탈출",
                    "price": cur['close']
                })

        # ── RSI 과매수 (70 이상 → 매도)
            if prv['rsi'] > 70 and cur['rsi'] <= 70:
                signals.append({
                    "code": code, "date": date,
                    "type": "rsi_overbought",
                    "side": "sell",
                    "label": "RSI 과매수 탈출",
                    "price": cur['close']
                })

        # ── 볼린저밴드 하단 돌파 (매수)
        if (cur.get('bb_lower') and cur.get('close')):
            if prv.get('close') and prv['close'] >= prv.get('bb_lower', 0) and cur['close'] < cur['bb_lower']:
                signals.append({
                    "code": code, "date": date,
                    "type": "bb_lower_break",
                    "side": "buy",
                    "label": "볼린저 하단 이탈",
                    "price": cur['close']
                })

        # ── 볼린저밴드 상단 돌파 (매도)
        if (cur.get('bb_upper') and cur.get('close')):
            if prv.get('close') and prv['close'] <= prv.get('bb_upper', float('inf')) and cur['close'] > cur['bb_upper']:
                signals.append({
                    "code": code, "date": date,
                    "type": "bb_upper_break",
                    "side": "sell",
                    "label": "볼린저 상단 돌파",
                    "price": cur['close']
                })

    return signals


def run():
    all_signals   = []  # 전체 신호
    latest_signals = []  # 최근 신호 (마지막 30일)

    files = [f for f in os.listdir(OHLCV_DIR) if f.endswith('.json')]
    print(f"총 {len(files)}개 종목 신호 탐지 중...")

    for fname in files:
        code = fname.replace('.json', '')
        try:
            with open(os.path.join(OHLCV_DIR, fname), 'r', encoding='utf-8') as f:
                data = json.load(f)
            signals = detect_signals(code, data)
            all_signals.extend(signals)
        except Exception as e:
            print(f"  {code} 실패: {e}")

    # 날짜 기준 내림차순 정렬
    all_signals.sort(key=lambda x: x['date'], reverse=True)

    # 최근 30일 신호만 추출
    from datetime import timedelta
    cutoff = (datetime.today() - timedelta(days=30)).strftime('%Y-%m-%d')
    latest_signals = [s for s in all_signals if s['date'] >= cutoff]

    # 저장
    output = {
        "updated_at": datetime.today().strftime('%Y-%m-%d %H:%M'),
        "total_count": len(all_signals),
        "latest_count": len(latest_signals),
        "signals": latest_signals  # 최근 30일 신호
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"✅ 완료 — 전체: {len(all_signals)}개 / 최근 30일: {len(latest_signals)}개")
    print(f"   → {OUTPUT_FILE}")


if __name__ == '__main__':
    run()