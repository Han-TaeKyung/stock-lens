import json
import os
import requests
from datetime import datetime, timedelta

OHLCV_DIR  = 'data/ohlcv'
SIGNAL_DIR = 'data/signals'

# 카카오워크 웹훅 URL 목록 (콤마로 구분)
KAKAO_WEBHOOK_URLS = [
    url.strip()
    for url in os.environ.get('KAKAO_WEBHOOK_URLS', '').split(',')
    if url.strip()
]

# 박스권 감지 설정
BOX_PERIOD    = 20    # 박스권 기준 기간 (일)
BOX_THRESHOLD = 0.02  # 돌파 기준 (2%)

# 감시 종목 (GitHub Secrets 또는 환경변수에서 로드)
_watch_env  = os.environ.get('WATCH_CODES', '')
WATCH_CODES = [c.strip() for c in _watch_env.split(',') if c.strip()]


def detect_box_breakout(code):
    """박스권 이탈 감지"""
    try:
        path = os.path.join(OHLCV_DIR, f'{code}.json')
        if not os.path.exists(path):
            return None

        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if len(data) < BOX_PERIOD + 1:
            return None

        box   = data[-(BOX_PERIOD + 1):-1]
        today = data[-1]

        box_high = max(d['high'] for d in box if d['high'])
        box_low  = min(d['low']  for d in box if d['low'])

        # 상단 돌파 (매수)
        if today['close'] > box_high * (1 + BOX_THRESHOLD):
            return {
                "code":       code,
                "date":       today['date'],
                "side":       "buy",
                "type":       "box_breakout_up",
                "box_high":   box_high,
                "box_low":    box_low,
                "close":      today['close'],
                "change_pct": round((today['close'] - box_high) / box_high * 100, 2)
            }

        # 하단 이탈 (매도)
        elif today['close'] < box_low * (1 - BOX_THRESHOLD):
            return {
                "code":       code,
                "date":       today['date'],
                "side":       "sell",
                "type":       "box_breakout_down",
                "box_high":   box_high,
                "box_low":    box_low,
                "close":      today['close'],
                "change_pct": round((today['close'] - box_low) / box_low * 100, 2)
            }

        return None

    except Exception:
        return None


def get_stock_name(code, stocks):
    """종목명 조회"""
    r = next((s for s in stocks if s['code'] == code), None)
    return r['name'] if r else code


def get_today_signals(code):
    """오늘 발생한 신호 조회"""
    try:
        path = os.path.join(SIGNAL_DIR, f'{code}.json')
        if not os.path.exists(path):
            return []
        with open(path, 'r', encoding='utf-8') as f:
            signals = json.load(f)
        # 가장 최근 데이터 날짜 기준으로 신호 조회
        latest_date = signals[-1]['date'] if signals else ''
        return [s for s in signals if s['date'] == latest_date]
    except:
        return []


def send_kakao_message(url, text):
    """카카오워크 웹훅 전송"""
    try:
        res = requests.post(
            url,
            data=json.dumps({"text": text}, ensure_ascii=False).encode('utf-8'),
            headers={"Content-Type": "application/json; charset=utf-8"},
            timeout=10
        )
        return res.status_code == 200
    except Exception as e:
        print(f"  전송 실패: {e}")
        return False


def send_all(text):
    """모든 웹훅 URL로 전송"""
    if not KAKAO_WEBHOOK_URLS:
        print("KAKAO_WEBHOOK_URLS 환경변수가 없습니다.")
        return False
    results = []
    for i, url in enumerate(KAKAO_WEBHOOK_URLS, 1):
        success = send_kakao_message(url, text)
        results.append(success)
        print(f"    {'✅' if success else '❌'} 수신자 {i} 전송 {'완료' if success else '실패'}")
    return all(results)


def run():
    with open('data/stocks.json', 'r', encoding='utf-8') as f:
        stocks = json.load(f)

    codes = WATCH_CODES if WATCH_CODES else [s['code'] for s in stocks]
    print(f"박스권 이탈 감지 중... ({len(codes)}개 종목)")

    alerts = []
    for code in codes:
        result = detect_box_breakout(code)
        if result:
            result['name']    = get_stock_name(code, stocks)
            result['signals'] = get_today_signals(code)
            alerts.append(result)

    print(f"박스권 이탈 종목: {len(alerts)}개")

    if not alerts:
        print("알림 없음")
        return

    for a in alerts:
        side_emoji = "📈" if a['side'] == 'buy' else "📉"
        side_text  = "상단 돌파 🔼" if a['side'] == 'buy' else "하단 이탈 🔽"

        signal_text = ""
        if a['signals']:
            combo  = [s for s in a['signals'] if s['type'].startswith('combo_')]
            normal = [s for s in a['signals'] if not s['type'].startswith('combo_')]
            if combo:
                signal_text = "\n🔔 " + " / ".join(s['label'] for s in combo[:3])
            elif normal:
                signal_text = "\n📌 " + " / ".join(s['label'] for s in normal[:3])

        msg = f"""{side_emoji} [StockLens] 박스권 {side_text}
━━━━━━━━━━━━━━━
종목: {a['name']} ({a['code']})
날짜: {a['date']}
현재가: {a['close']:,.0f}원
박스 상단: {a['box_high']:,.0f}원
박스 하단: {a['box_low']:,.0f}원
돌파율: {a['change_pct']:+.2f}%{signal_text}
━━━━━━━━━━━━━━━
🔗 https://Han-TaeKyung.github.io/stock-lens"""

        send_all(msg)
        print(f"  ✅ {a['name']} ({a['code']}) → {len(KAKAO_WEBHOOK_URLS)}명에게 전송 완료")


if __name__ == '__main__':
    run()