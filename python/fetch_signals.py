import json, os, math
from datetime import datetime, timedelta

OHLCV_DIR  = 'data/ohlcv'
OUTPUT_FILE = 'data/signals.json'

RSI_OVERSOLD        = 30
RSI_OVERBOUGHT      = 70
DISPARITY_THRESHOLD = 110.0
BB_SIGNAL           = True
MACD_SIGNAL         = True 
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

        # 14. MACD 골든크로스 (MACD선이 시그널선 상향 돌파 → 매수)
        if MACD_SIGNAL:
            cur_macd = v(c, 'macd')
            prv_macd = v(p, 'macd')
            cur_sig  = v(c, 'macd_signal')
            prv_sig  = v(p, 'macd_signal')
            cur_hist = v(c, 'macd_hist')
            prv_hist = v(p, 'macd_hist')

            # MACD 골든크로스
            if cur_macd is not None and cur_sig is not None and \
               prv_macd is not None and prv_sig is not None:
                if prv_macd < prv_sig and cur_macd > cur_sig:
                    results.append({"code":code,"date":dt,"side":"buy",
                        "type":"macd_golden_cross",
                        "label":"MACD 골든크로스",
                        "desc":"MACD선이 시그널선 상향 돌파 — 매수 타점","price":close})

                # MACD 데드크로스
                if prv_macd > prv_sig and cur_macd < cur_sig:
                    results.append({"code":code,"date":dt,"side":"sell",
                        "type":"macd_dead_cross",
                        "label":"MACD 데드크로스",
                        "desc":"MACD선이 시그널선 하향 돌파 — 매도 타점","price":close})

            # MACD 오실레이터 양전환
            if cur_hist is not None and prv_hist is not None:
                if prv_hist < 0 and cur_hist >= 0:
                    results.append({"code":code,"date":dt,"side":"buy",
                        "type":"macd_hist_positive",
                        "label":"MACD 오실레이터 양전환",
                        "desc":"히스토그램 음→양 전환 — 매수 준비 타이밍","price":close})

                # MACD 오실레이터 음전환
                if prv_hist > 0 and cur_hist <= 0:
                    results.append({"code":code,"date":dt,"side":"sell",
                        "type":"macd_hist_negative",
                        "label":"MACD 오실레이터 음전환",
                        "desc":"히스토그램 양→음 전환 — 매도 주의","price":close})

        # 15. 볼린저 상단 돌파
        if BB_SIGNAL and all([bbu, pbbu, pclose]):
            if pclose <= pbbu and close > bbu:
                results.append({"code":code,"date":dt,"side":"sell",
                    "type":"bb_upper_break",
                    "label":"볼린저 상단 돌파",
                    "desc":"볼린저밴드 상단 돌파 — 단기 과열 주의","price":close})


         # ── 복합 신호 탐지 ─────────────────────────────────────
        # 오늘 발생한 신호 타입 목록
        today_types = set(r['type'] for r in results if r['date'] == dt)

        # 복합 신호 1 — 일부 익절 타이밍
        # BB상단돌파 + RSI과매수 + 이격도과다(MA5) 동시 발생
        if {'bb_upper_break', 'rsi_overbought', 'disparity_ma5'}.issubset(today_types):
            results.append({
                "code": code, "date": dt, "side": "sell",
                "type": "combo_partial_profit",
                "label": "🔴 일부 익절 타이밍",
                "desc": "BB↑ + RSI↓ + 이격(5) 동시 발생 — 30~50% 물량 수익 실현 고려",
                "price": close
            })

        # 복합 신호 2 — 추세 매도
        # 데드크로스(5×20) 또는 60일선 이탈 발생
        if 'dead_cross_5_20' in today_types or 'ma60_breakdown' in today_types:
            trigger = 'dead_cross_5_20' if 'dead_cross_5_20' in today_types else 'ma60_breakdown'
            trigger_label = '데드X(5×20)' if trigger == 'dead_cross_5_20' else '60선이탈'
            results.append({
                "code": code, "date": dt, "side": "sell",
                "type": "combo_trend_sell",
                "label": f"🔴 추세 매도 — {trigger_label}",
                "desc": f"{trigger_label} 발생 — 남은 물량 전량 정리, 리스크 방어",
                "price": close
            })
         # ── 복합 매수 신호 1 — 추세 전환 매수 (달리는 말 올라타기)
        # MACD 골든크로스 또는 오실레이터 양전환 + 골든크로스(5×20) 동시 발생
        macd_buy = {'macd_golden_cross', 'macd_hist_positive'} & today_types
        golden_buy = {'golden_cross_5_20', 'golden_cross_20_60'} & today_types
        if macd_buy and golden_buy:
            macd_label   = 'MACD↑' if 'macd_golden_cross' in macd_buy else 'MACD+'
            golden_label = '골든X(5×20)' if 'golden_cross_5_20' in golden_buy else '골든X(20×60)'
            results.append({
                "code": code, "date": dt, "side": "buy",
                "type": "combo_trend_buy",
                "label": f"🟢 추세 전환 매수 — {macd_label}+{golden_label}",
                "desc": f"{macd_label} + {golden_label} 동시 발생 — 상승 에너지 확인, 정석 매수 타이밍",
                "price": close
            })

        # ── 복합 매수 신호 2 — 눌림목 매수 (싸게 사서 모으기)
        # 눌림목(20 또는 60) + RSI과매도탈출 또는 BB하단이탈 조합
        pullback = {'pullback_ma20', 'pullback_ma60'} & today_types
        rsi_bb_buy = {'rsi_oversold', 'bb_lower_break'} & today_types
        if pullback and rsi_bb_buy:
            pullback_label = '눌림(20)' if 'pullback_ma20' in pullback else '눌림(60)'
            extra_label    = 'RSI↑' if 'rsi_oversold' in rsi_bb_buy else 'BB↓'
            results.append({
                "code": code, "date": dt, "side": "buy",
                "type": "combo_pullback_buy",
                "label": f"🟢 눌림목 매수 — {pullback_label}+{extra_label}",
                "desc": f"{pullback_label} + {extra_label} 동시 발생 — 리스크 낮은 분할 매수 1차 타점",
                "price": close
            })

        # ── 복합 매수 신호 3 — 낙폭과대 반등 매수
        # RSI 과매도 탈출 + BB 하단 이탈 동시 발생
        if {'rsi_oversold', 'bb_lower_break'}.issubset(today_types):
            results.append({
                "code": code, "date": dt, "side": "buy",
                "type": "combo_oversold_bounce",
                "label": "🟢 낙폭과대 반등 매수",
                "desc": "RSI↑ + BB↓ 동시 발생 — 과매도 기술적 반등 타이밍, 단기 분할 매수",
                "price": close
            })
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