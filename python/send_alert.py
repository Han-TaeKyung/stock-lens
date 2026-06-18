import json
import os
import requests
from datetime import datetime, timedelta

OHLCV_DIR  = 'data/ohlcv'
SIGNAL_DIR = 'data/signals'

# 카카오 오픈채팅 웹훅 URL (GitHub Secrets에서 가져옴)
KAKAO_WEBHOOK_URL = os.environ.get('KAKAO_WEBHOOK_URL', '')

# 박스권 감지 설정
BOX_PERIOD    = 20    # 박스권 기준 기간 (일)
BOX_THRESHOLD = 0.02  # 돌파 기준 (2%)

# 알림 대상 종목 (관심 종목만 필터링 가능)
WATCH_CODES = []  # 비어있으면 전체 종목


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

        # 박스권 구간 (최근 N일 제외한 이전 구간)
        box   = data[-(BOX_PERIOD + 1):-1]
        today = data[-1]

        box_high = max(d['high'] for d in box if d['high'])
        box_low  = min(d['low']  for d in box if d['low'])

        result = None

        # 상단 돌파 (매수 신호)
        if today['close'] > box_high * (1 + BOX_THRESHOLD):
            result = {
                "code":      code,
                "date":      today['date'],
                "side":      "buy",
                "type":      "box_breakout_up",
                "box_high":  box_high,
                "box_low":   box_low,
                "close":     today['close'],
                "change_pct": round((today['close'] - box_high) / box_high * 100, 2)
            }

        # 하단 이탈 (매도 신호)
        elif today['close'] < box_low * (1 - BOX_THRESHOLD):
            result = {
                "code":      code,
                "date":      today['date'],
                "side":      "sell",
                "type":      "box_breakout_down",
                "box_high":  box_high,
                "box_low":   box_low,
                "close":     today['close'],
                "change_pct": round((today['close'] - box_low) / box_low * 100, 2)
            }

        return result

    except Exception as e:
        return None


def get_stock_name(code, stocks):
    """종목명 조회"""
    for s in stocks:
        if s['code'] == code:
            return s['name']
    return code


def get_today_signals(code):
    """오늘 발생한 신호 조회"""
    try:
        path = os.path.join(SIGNAL_DIR, f'{code}.json')
        if not os.path.exists(path):
            return []
        with open(path, 'r', encoding='utf-8') as f:
            signals = json.load(f)
        today = datetime.today().strftime('%Y-%m-%d')
        return [s for s in signals if s['date'] == today]
    except:
        return []


def send_kakao_message(text):
    """카카오 오픈채팅 웹훅 전송"""
    if not KAKAO_WEBHOOK_URL:
        print("⚠️ KAKAO_WEBHOOK_URL 환경변수가 설정되지 않았습니다.")
        return False
    try:
        res = requests.post(
            KAKAO_WEBHOOK_URL,
            json={"text": text},
            timeout=10
        )
        return res.status_code == 200
    except Exception as e:
        print(f"카카오 전송 실패: {e}")
        return False


def run():
    # 종목 목록 로드
    with open('data/stocks.json', 'r', encoding='utf-8') as f:
        stocks = json.load(f)

    # 감시 종목 설정
    codes = WATCH_CODES if WATCH_CODES else [s['code'] for s in stocks]

    print(f"박스권 이탈 감지 중... ({len(codes)}개 종목)")

    alerts = []
    for code in codes:
        result = detect_box_breakout(code)
        if result:
            result['name'] = get_stock_name(code, stocks)
            result['signals'] = get_today_signals(code)
            alerts.append(result)

    print(f"박스권 이탈 종목: {len(alerts)}개")

    if not alerts:
        print("알림 없음")
        return

    # 카카오 메시지 전송
    for a in alerts:
        side_emoji = "📈" if a['side'] == 'buy' else "📉"
        side_text  = "상단 돌파 🔼" if a['side'] == 'buy' else "하단 이탈 🔽"

        # 오늘 발생한 신호 요약
        signal_text = ""
        if a['signals']:
            combo = [s for s in a['signals'] if s['type'].startswith('combo_')]
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

        success = send_kakao_message(msg)
        print(f"  {'✅' if success else '❌'} {a['name']} ({a['code']}) 알림 {'전송 완료' if success else '전송 실패'}")


if __name__ == '__main__':
    run()