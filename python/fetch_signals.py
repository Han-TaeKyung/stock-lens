import json, os, math
from datetime import datetime, timedelta

OHLCV_DIR  = 'data/ohlcv'
OUTPUT_FILE = 'data/signals.json'

RSI_OVERSOLD        = 30
RSI_OVERBOUGHT      = 70
DISPARITY_THRESHOLD = 110.0
BB_SIGNAL           = True
SIGNAL_DAYS         = 365


def detect(code, data):
    results = []
    n = len(data)
    if n < 3:
        return results

    for i in range(2, n):
        c  = data[i]      # 오늘
        p  = data[i-1]    # 어제
        pp = data[i-2]    # 그저께

        dt    = c['date']
        close = c['close']
        open_ = c['open']

        def v(d, k):
            val = d.get(k)
            if val is None:
                return None
            try:
                f = float(val)
                return None if math.isnan(f) or math.isinf(f) else f
            except:
                return None

        ma5   = v(c, 'ma5');   pma5   = v(p, 'ma5')
        ma20  = v(c, 'ma20');  pma20  = v(p, 'ma20')
        ma60  = v(c, 'ma60');  pma60  = v(p, 'ma60')
        rsi   = v(c, 'rsi');   prsi   = v(p, 'rsi')
        bbu   = v(c, 'bb_upper'); pbbu = v(p, 'bb_upper')
        bbl   = v(c, 'bb_lower'); pbbl = v(p, 'bb_lower')
        pclose = v(p, 'close')

        # 1. 골든크로스 MA5×MA20
        if all([ma5, ma20, pma5, pma20]):
            if pma5 < pma20 and ma5 > ma20:
                results.append({"code":code,"date":dt,"side":"buy",
                    "type":"golden_cross_5_20",
                    "label":"골든크로스 (MA5×MA20)",
                    "desc":"단기 매수 타이밍 — 분할 매수 시작","price":close})

        # 2. 데드크로스 MA5×MA20
        if all([ma5, ma20, pma5, pma20]):
            if pma5 > pma20 and ma5 < ma20:
                results.append({"code":code,"date":dt,"side":"sell",
                    "type":"dead_cross_5_20",
                    "label":"데드크로스 (MA5×MA20)",
                    "desc":"단기 조정 시작 — 비중 축소 고려","price":close})

        # 3. 골든크로스 MA20×MA60
        if all([ma20, ma60, pma20, pma60]):
            if pma20 < pma60 and ma20 > ma60:
                results.append({"code":code,"date":dt,"side":"buy",
                    "type":"golden_cross_20_60",
                    "label":"골든크로스 (MA20×MA60)",
                    "desc":"중기 추세 확정 — 본격 비중 확대","price":close})

        # 4. 데드크로스 MA20×MA60
        if all([ma20, ma60, pma20, pma60]):
            if pma20 > pma60 and ma20 < ma60:
                results.append({"code":code,"date":dt,"side":"sell",
                    "type":"dead_cross_20_60",
                    "label":"데드크로스 (MA20×MA60)",
                    "desc":"중기 하락 전환 — 비중 크게 축소","price":close})

        # 5. 눌림목 MA20 반등 (전일 MA20 터치 + 오늘 양봉)
        if all([ma20, pma20, pclose]):
            if pclose <= pma20 * 1.005 and close > ma20 and close > open_:
                results.append({"code":code,"date":dt,"side":"buy",
                    "type":"pullback_ma20",
                    "label":"눌림목 매수 (20일선 반등)",
                    "desc":"20일선(생명선) 지지 확인 — 안전한 매수 타점","price":close})

        # 6. 눌림목 MA60 반등 (전일 MA60 터치 + 오늘 양봉)
        if all([ma60, pma60, pclose]):
            if pclose <= pma60 * 1.005 and close > ma60 and close > open_:
                results.append({"code":code,"date":dt,"side":"buy",
                    "type":"pullback_ma60",
                    "label":"눌림목 매수 (60일선 반등)",
                    "desc":"60일선(수급선) 지지 확인 — 중기 매수 타점","price":close})

        # 7. 이격도 과다 MA5
        if ma5 and ma5 > 0:
            d5 = round((close / ma5) * 100, 2)
            if d5 >= DISPARITY_THRESHOLD:
                results.append({"code":code,"date":dt,"side":"caution",
                    "type":"disparity_ma5",
                    "label":f"이격도 과다 MA5 ({d5}%)",
                    "desc":f"5일선 대비 {d5}% — 과열 구간, 신규 매수 자제","price":close})

        # 8. 이격도 과다 MA20
        if ma20 and ma20 > 0:
            d20 = round((close / ma20) * 100, 2)
            if d20 >= DISPARITY_THRESHOLD:
                results.append({"code":code,"date":dt,"side":"caution",
                    "type":"disparity_ma20",
                    "label":f"이격도 과다 MA20 ({d20}%)",
                    "desc":f"20일선 대비 {d20}% — 일부 수익 실현 고려","price":close})

        # 9. 60일선 이탈 + 거래량 급증
        if all([ma60, pma60, pclose]):
            vols = [data[j]['volume'] for j in range(max(0,i-5), i) if data[j].get('volume')]
            avg_vol = sum(vols) / len(vols) if vols else 0
            if pclose >= pma60 and close < ma60 and avg_vol > 0 and c['volume'] > avg_vol * 1.5:
                results.append({"code":code,"date":dt,"side":"sell",
                    "type":"ma60_breakdown",
                    "label":"60일선 이탈 (거래량 급증)",
                    "desc":"중기 추세선 이탈 + 거래량 급증 — 장기 하락 가능","price":close})

        # 10. RSI 과매도 탈출
        if all([rsi, prsi]):
            if prsi < RSI_OVERSOLD and rsi >= RSI_OVERSOLD:
                results.append({"code":code,"date":dt,"side":"buy",
                    "type":"rsi_oversold",
                    "label":f"RSI 과매도 탈출 ({RSI_OVERSOLD})",
                    "desc":"RSI 과매도 구간 탈출 — 반등 매수 타이밍","price":close})

        # 11. RSI 과매수 탈출
        if all([rsi, prsi]):
            if prsi > RSI_OVERBOUGHT and rsi <= RSI_OVERBOUGHT:
                results.append({"code":code,"date":dt,"side":"sell",
                    "type":"rsi_overbought",
                    "label":f"RSI 과매수 탈출 ({RSI_OVERBOUGHT})",
                    "desc":"RSI 과매수 구간 이탈 — 수익 실현 고려","price":close})

        # 12. 볼린저 하단 이탈
        if BB_SIGNAL and all([bbl, pbbl, pclose]):
            if pclose >= pbbl and close < bbl:
                results.append({"code":code,"date":dt,"side":"buy",
                    "type":"bb_lower_break",
                    "label":"볼린저 하단 이탈",
                    "desc":"볼린저밴드 하단 이탈 — 단기 반등 가능","price":close})

        # 13. 볼린저 상단 돌파
        if BB_SIGNAL and all([bbu, pbbu, pclose]):
            if pclose <= pbbu and close > bbu:
                results.append({"code":code,"date":dt,"side":"sell",
                    "type":"bb_upper_break",
                    "label":"볼린저 상단 돌파",
                    "desc":"볼린저밴드 상단 돌파 — 단기 과열 주의","price":close})

    return results


def run():
    os.makedirs('data/signals', exist_ok=True)
    
    files = [f for f in os.listdir(OHLCV_DIR) if f.endswith('.json')]
    print(f"총 {len(files)}개 종목 신호 탐지 중...")

    total = 0
    for fname in files:
        code = fname.replace('.json', '')
        try:
            with open(os.path.join(OHLCV_DIR, fname), 'r', encoding='utf-8') as f:
                data = json.load(f)
            signals = detect(code, data)
            total += len(signals)

            # 종목별로 저장
            out_path = os.path.join('data/signals', f'{code}.json')
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(signals, f, ensure_ascii=False)
        except Exception as e:
            print(f"  {code} 실패: {e}")

    print(f"\n✅ 완료 — 전체: {total}개 신호 → data/signals/ 폴더")


if __name__ == '__main__':
    run()