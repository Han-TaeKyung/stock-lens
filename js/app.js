// ════════════════════════════════════════
//  StockLens — app.js (복구 버전 2026-06-03)
// ════════════════════════════════════════

const state = {
  stocks: [],
  currentCode: null,
  currentData: null,
  activeMA: new Set(['ma5', 'ma20', 'ma60']),
  activeIndicator: 'rsi',
  activeMarket: 'ALL',
  activePeriod: 'D',
  charts: {},
  activeSignals: new Set([ //기본 비활성화
    // 'golden_cross_5_20', 'golden_cross_20_60',
    // 'dead_cross_5_20',   'dead_cross_20_60',
    // 'pullback_ma20',     'pullback_ma60',
    // 'rsi_oversold',      'rsi_overbought',
    // 'disparity_ma5',     'disparity_ma20',
    // 'bb_upper_break',    'bb_lower_break',
    // 'ma60_breakdown',   'macd_golden_cross', 
    // 'macd_dead_cross', 'macd_hist_positive', 
    // 'macd_hist_negative'
  ]),
};

let btCode    = null;
let btOhlcv   = null;
let btSignals = null;
let pfCode    = null;
let pfHoldings = [];
let pfDonut   = null;

const PF_COLORS = ['#4ade80','#60a5fa','#f59e0b','#c084fc','#fb923c','#f87171','#34d399','#818cf8'];


// ════════════════════════════════════════
//  초기화
// ════════════════════════════════════════

async function init() {
  await loadStocks();
  initTabs();
  initBacktest();
  initPortfolio();
  initSearch();
  initMarketTabs();
  initPeriodTabs();
  initMAToggles();
  initIndicatorTabs();
  initSignalFilters();
  initCharts();
  initWatchlistButton();
  initMobileSignal();
  initGuideModal();
  renderWatchlist();
  renderRecent();
}

async function loadStocks() {
  try {
    const res = await fetch('data/stocks.json');
    state.stocks = await res.json();
  } catch (e) {
    console.warn('stocks.json 로드 실패:', e);
  }
}


// ════════════════════════════════════════
//  탭 네비게이션
// ════════════════════════════════════════

function initTabs() {
  document.querySelectorAll('.tab-item, .page-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll('.tab-item, .page-tab').forEach(b => {
        if (b.dataset.tab === tab) b.classList.add('active');
        else b.classList.remove('active');
      });

      const layout    = document.querySelector('.layout');
      const backtest  = document.getElementById('page-backtest');
      const portfolio = document.getElementById('page-portfolio');

      layout.classList.add('hidden');
      backtest.classList.add('hidden');
      portfolio.classList.add('hidden');

      if (tab === 'chart')     layout.classList.remove('hidden');
      if (tab === 'backtest')  backtest.classList.remove('hidden');
      if (tab === 'portfolio') portfolio.classList.remove('hidden');
    });
  });
}


// ════════════════════════════════════════
//  차트 초기화
// ════════════════════════════════════════

function makeChartOptions() {
  return {
    layout: {
      background: { type: LightweightCharts.ColorType.Solid, color: 'transparent' },
      textColor: '#7a7f92',
    },
    grid: {
      vertLines: { color: '#1e2130' },
      horzLines: { color: '#1e2130' },
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#1e2130' },
    timeScale: { borderColor: '#1e2130', timeVisible: true },
  };
}

function initCharts() {
  const mainEl = document.getElementById('mainChart');
  const volEl  = document.getElementById('volumeChart');
  const subEl  = document.getElementById('subChart');

  const mainChart = LightweightCharts.createChart(mainEl, {
    ...makeChartOptions(),
    width: mainEl.clientWidth,
    height: mainEl.clientHeight || 300,
  });
  const candleSeries = mainChart.addSeries(
    LightweightCharts.CandlestickSeries,
    {
      upColor: '#4ade80', downColor: '#f87171',
      borderUpColor: '#4ade80', borderDownColor: '#f87171',
      wickUpColor: '#4ade80', wickDownColor: '#f87171',
    }
  );

  const volChart  = LightweightCharts.createChart(volEl, {
    ...makeChartOptions(), width: volEl.clientWidth, height: 80,
  });
  const volSeries = volChart.addSeries(
    LightweightCharts.HistogramSeries,
    { priceFormat: { type: 'volume' }, priceScaleId: '' }
  );

  const subChart = LightweightCharts.createChart(subEl, {
    ...makeChartOptions(), width: subEl.clientWidth, height: 120,
  });

  state.charts = {
    mainChart, candleSeries,
    volChart, volSeries,
    subChart, subSeries: null,
    maSeries: {}, markerPrimitive: null,
  };

  new ResizeObserver(() => {
    mainChart.applyOptions({ width: mainEl.clientWidth, height: mainEl.clientHeight || 300 });
    volChart.applyOptions({ width: volEl.clientWidth });
    subChart.applyOptions({ width: subEl.clientWidth });
  }).observe(document.querySelector('.chart-area'));
}


// ════════════════════════════════════════
//  봉 집계 함수
// ════════════════════════════════════════

function aggregateData(data, period) {
  if (period === 'D') return data;

  const groups = {};

  for (const d of data) {
    const date = new Date(d.date);
    let key;

    if (period === 'W') {
      const day    = date.getDay();
      const diff   = (day === 0 ? -6 : 1 - day);
      const monday = new Date(date);
      monday.setDate(date.getDate() + diff);
      key = monday.toISOString().slice(0, 10);
    } else if (period === 'M') {
      key = `${d.date.slice(0, 7)}-01`;
    }

    if (!groups[key]) {
      groups[key] = {
        date: key, open: d.open, high: d.high,
        low: d.low, close: d.close, volume: d.volume,
      };
    } else {
      groups[key].high   = Math.max(groups[key].high, d.high);
      groups[key].low    = Math.min(groups[key].low,  d.low);
      groups[key].close  = d.close;
      groups[key].volume += d.volume;
    }
  }

  // 집계된 봉 배열
  const bars = Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));

  // ── 주봉/월봉 기준으로 이평선 재계산 ──────────
  const windows = { ma5: 5, ma20: 20, ma60: 60, ma120: 120 };

  for (let i = 0; i < bars.length; i++) {
    for (const [key, window] of Object.entries(windows)) {
      if (i + 1 < window) {
        bars[i][key] = null;
      } else {
        const slice = bars.slice(i + 1 - window, i + 1);
        const avg   = slice.reduce((sum, b) => sum + b.close, 0) / window;
        bars[i][key] = Math.round(avg * 100) / 100;
      }
    }
  }

  return bars;
}


// ════════════════════════════════════════
//  종목 데이터 로드 & 차트 렌더
// ════════════════════════════════════════

async function loadStock(code) {
  try {
    const res = await fetch(`data/ohlcv/${code}.json`);
    if (!res.ok) throw new Error('데이터 없음');
    const data = await res.json();
    state.currentCode = code;
    state.currentData = data;
    renderChart(data);
    updateStockInfo(data);
    saveRecent(code);
    renderRecent();
  } catch (e) {
    console.warn(`${code} 로드 실패:`, e);
  }
}

function renderChart(data) {
  if (!data?.length) return;
  const { mainChart, candleSeries, volSeries, maSeries } = state.charts;

  // 봉 타입에 따라 집계
  const chartData = aggregateData(data, state.activePeriod);

  candleSeries.setData(chartData.map(d => ({
    time: d.date, open: d.open, high: d.high, low: d.low, close: d.close
  })));

  Object.values(maSeries).forEach(s => mainChart.removeSeries(s));
  state.charts.maSeries = {};

  const maColors = { ma5: '#60a5fa', ma20: '#f59e0b', ma60: '#c084fc', ma120: '#fb923c' };
  ['ma5', 'ma20', 'ma60', 'ma120'].forEach(key => {
    if (!state.activeMA.has(key)) return;
    const s = mainChart.addSeries(LightweightCharts.LineSeries, {
      color: maColors[key], lineWidth: 1, priceLineVisible: false
    });
    s.setData(chartData.filter(d => d[key] != null).map(d => ({ time: d.date, value: d[key] })));
    state.charts.maSeries[key] = s;
  });

  volSeries.setData(chartData.map(d => ({
    time: d.date, value: d.volume,
    color: d.close >= d.open ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'
  })));

  renderSubChart(data, state.activeIndicator);

  mainChart.timeScale().fitContent();
  state.charts.volChart.timeScale().fitContent();
  state.charts.subChart.timeScale().fitContent();

  renderSignalMarkers();
}

function renderSubChart(data, indicator) {
  const { subChart } = state.charts;
  if (state.charts.subSeries) {
    try { subChart.removeSeries(state.charts.subSeries); } catch(e) {}
  }

  if (indicator === 'rsi') {
    state.charts.subSeries = subChart.addSeries(LightweightCharts.LineSeries, {
      color: '#60a5fa', lineWidth: 1, priceLineVisible: false
    });
    state.charts.subSeries.setData(
      data.filter(d => d.rsi != null).map(d => ({ time: d.date, value: d.rsi }))
    );
  } else if (indicator === 'macd') {
    state.charts.subSeries = subChart.addSeries(LightweightCharts.HistogramSeries, {
      priceLineVisible: false
    });
    state.charts.subSeries.setData(
      data.filter(d => d.macd_hist != null).map(d => ({
        time: d.date, value: d.macd_hist,
        color: d.macd_hist >= 0 ? '#4ade80' : '#f87171'
      }))
    );
  } else if (indicator === 'bb') {
    state.charts.subSeries = subChart.addSeries(LightweightCharts.LineSeries, {
      color: '#94a3b8', lineWidth: 1, priceLineVisible: false
    });
    state.charts.subSeries.setData(
      data.filter(d => d.bb_upper != null).map(d => ({ time: d.date, value: d.bb_upper }))
    );
  }
}


// ════════════════════════════════════════
//  매매 신호 마커
// ════════════════════════════════════════

async function loadSignals(code) {
  try {
    const res = await fetch(`data/signals/${code}.json`);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function renderSignalMarkers() {
  if (!state.currentCode) return;

  const signals  = await loadSignals(state.currentCode);
  const filtered = signals.filter(s => state.activeSignals.has(s.type));

  renderSignalList(filtered);

  if (state.charts.markerPrimitive) {
    try { state.charts.markerPrimitive.detach?.(); } catch(e) {}
    state.charts.markerPrimitive = null;
  }

  if (!filtered.length) return;

  const markers = filtered.map(s => {
    // 복합 신호는 별 모양 + 더 큰 사이즈로 강조
    const isCombo = s.type.startsWith('combo_');
    return {
      time:     s.date,
      position: 'aboveBar',
      color:    isCombo ? '#ff4444' : (s.side === 'buy' ? '#4ade80' : s.side === 'sell' ? '#f87171' : '#f59e0b'),
      shape:    isCombo ? 'arrowDown' : (s.side === 'buy' ? 'arrowUp' : s.side === 'sell' ? 'arrowDown' : 'circle'),
      text:     isCombo ? `⭐ ${s.label}` : s.label,
      size:     isCombo ? 3 : 1.5,
    };
  });

  markers.sort((a, b) => a.time.localeCompare(b.time));

  try {
    state.charts.markerPrimitive = LightweightCharts.createSeriesMarkers(
      state.charts.candleSeries, markers
    );
  } catch(e) {
    try { state.charts.candleSeries.setMarkers(markers); }
    catch(e2) { console.warn('마커 표시 실패:', e2); }
  }
}


// ════════════════════════════════════════
//  신호 요약 패널
// ════════════════════════════════════════

function updateSignalPanel(signals) {
  const cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recent    = signals.filter(s => s.date >= cutoffStr);

  const buy     = recent.filter(s => s.side === 'buy').length;
  const sell    = recent.filter(s => s.side === 'sell').length;
  const caution = recent.filter(s => s.side === 'caution').length;
  const total   = buy + sell + caution || 1;

  document.getElementById('buyScore').textContent     = buy;
  document.getElementById('sellScore').textContent    = sell;
  document.getElementById('cautionScore').textContent = caution;
  document.getElementById('buyBar').style.width       = `${Math.round(buy     / total * 100)}%`;
  document.getElementById('sellBar').style.width      = `${Math.round(sell    / total * 100)}%`;
  document.getElementById('cautionBar').style.width   = `${Math.round(caution / total * 100)}%`;
  document.getElementById('spUpdated').textContent    = '최근 30일';

  const verdictEl = document.getElementById('spVerdictValue');
  const score     = buy - sell;
  let verdict, cls;
  if      (score >= 4)  { verdict = '강한 매수 🔥'; cls = 'buy'; }
  else if (score >= 2)  { verdict = '매수 우세 ▲';  cls = 'buy'; }
  else if (score >= 1)  { verdict = '약한 매수 ↑';  cls = 'buy'; }
  else if (score <= -4) { verdict = '강한 매도 ❄️'; cls = 'sell'; }
  else if (score <= -2) { verdict = '매도 우세 ▼';  cls = 'sell'; }
  else if (score <= -1) { verdict = '약한 매도 ↓';  cls = 'sell'; }
  else if (caution > 2) { verdict = '과열 주의 ⚠️'; cls = 'caution'; }
  else                  { verdict = '중립 —';        cls = 'neutral'; }
  verdictEl.textContent = verdict;
  verdictEl.className   = `sp-verdict-value ${cls}`;

  // 복합 신호 카드 (상단 강조 표시)
  const comboSignals = [...signals]
    .filter(s => s.type.startsWith('combo_'))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  let comboHtml = '';
  if (comboSignals.length) {
    comboHtml = comboSignals.map(s => {
      const isBuy   = s.side === 'buy';
      const bgColor = isBuy ? 'rgba(74,222,128,0.08)' : 'rgba(255,68,68,0.08)';
      const bdColor = isBuy ? 'rgba(74,222,128,0.3)'  : 'rgba(255,68,68,0.3)';
      const txColor = isBuy ? '#4ade80' : '#ff4444';
      return `
        <li style="
          background: ${bgColor};
          border: 1px solid ${bdColor};
          border-radius: var(--radius-md);
          padding: 10px 12px;
          margin-bottom: 6px;
        ">
          <div style="color:${txColor};font-size:13px;font-weight:700;">${s.label}</div>
          <div style="color:var(--text-disabled);font-size:11px;font-family:var(--font-mono);margin:2px 0;">${s.date} · ${s.price?.toLocaleString()}원</div>
          <div style="color:var(--text-secondary);font-size:11px;">${s.desc}</div>
        </li>
      `;
    }).join('');
  }

  const listEl = document.getElementById('spSignalList');
  const latest = [...signals].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  if (!latest.length) {
    listEl.innerHTML = comboHtml || '<li style="color:var(--text-disabled);font-size:12px;">신호 없음</li>';
    return;
  }

  listEl.innerHTML = comboHtml + latest.map(s => {
    const color = s.side === 'buy' ? 'var(--color-up)' : s.side === 'sell' ? 'var(--color-down)' : 'var(--color-warning)';
    const icon  = s.side === 'buy' ? '▲' : s.side === 'sell' ? '▼' : '●';
    return `
      <li>
        <span class="sp-signal-label" style="color:${color}">${icon} ${s.label}</span>
        <span class="sp-signal-date">${s.date}</span>
        <span class="sp-signal-desc">${s.desc || ''}</span>
      </li>
    `;
  }).join('');
}

function renderSignalList(signals) {
  updateSignalPanel(signals);
  updateMobileSignalBar(signals);
}


// ════════════════════════════════════════
//  종목 정보 바
// ════════════════════════════════════════

function updateStockInfo(data) {
  if (!data?.length) return;
  const last  = data[data.length - 1];
  const prev  = data[data.length - 2];
  const stock = state.stocks.find(s => s.code === state.currentCode) || {};

  document.getElementById('stockName').textContent  = stock.name || state.currentCode;
  document.getElementById('stockCode').textContent  = state.currentCode;
  document.getElementById('stockPrice').textContent = last.close.toLocaleString();

  if (prev) {
    const change = last.close - prev.close;
    const pct    = ((change / prev.close) * 100).toFixed(2);
    const el     = document.getElementById('stockChange');
    el.textContent = `${change >= 0 ? '+' : ''}${change.toLocaleString()} (${pct}%)`;
    el.className   = 'stock-change ' + (change >= 0 ? 'up' : 'down');
  }

  const btn = document.getElementById('watchBtn');
  if (btn) {
    const inList = getWatchlist().includes(state.currentCode);
    btn.textContent       = inList ? '★ 관심 중' : '+ 관심 추가';
    btn.style.color       = inList ? 'var(--color-accent)' : 'var(--text-secondary)';
    btn.style.borderColor = inList ? 'var(--color-accent)' : 'var(--border)';
  }
}


// ════════════════════════════════════════
//  UI 초기화
// ════════════════════════════════════════

function initWatchlistButton() {
  const bar = document.getElementById('stockInfoBar');
  const btn = document.createElement('button');
  btn.id = 'watchBtn';
  btn.style.cssText = `
    background: none; border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 4px 12px;
    color: var(--text-secondary); font-size: var(--text-xs);
    font-family: var(--font-mono); cursor: pointer;
    transition: all var(--transition);
  `;
  btn.textContent = '+ 관심 추가';
  bar.querySelector('.stock-info-right').appendChild(btn);

  btn.addEventListener('click', () => {
    const code = state.currentCode;
    if (!code) return;
    let list = getWatchlist();
    if (list.includes(code)) {
      list = list.filter(c => c !== code);
      btn.textContent       = '+ 관심 추가';
      btn.style.color       = 'var(--text-secondary)';
      btn.style.borderColor = 'var(--border)';
    } else {
      list.unshift(code);
      btn.textContent       = '★ 관심 중';
      btn.style.color       = 'var(--color-accent)';
      btn.style.borderColor = 'var(--color-accent)';
    }
    localStorage.setItem('watchlist', JSON.stringify(list));
    renderWatchlist();
  });
}

function initSearch() {
  const input  = document.getElementById('searchInput');
  const result = document.getElementById('searchResult');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { result.classList.add('hidden'); return; }

    const filtered = state.stocks
      .filter(s => {
        if (state.activeMarket !== 'ALL' && s.market !== state.activeMarket) return false;
        return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
      })
      .slice(0, 20);

    result.innerHTML = filtered.map(s =>
      `<li data-code="${s.code}"><span>${s.name}</span><span class="code">${s.code}</span></li>`
    ).join('');
    result.classList.toggle('hidden', !filtered.length);
  });

  result.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    loadStock(li.dataset.code);
    input.value = '';
    result.classList.add('hidden');
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) result.classList.add('hidden');
  });
}

function initMarketTabs() {
  document.querySelectorAll('.market-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.market-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeMarket = btn.dataset.market;
    });
  });
}

function initPeriodTabs() {
  document.querySelectorAll('.period-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activePeriod = btn.dataset.period;
      if (state.currentData) renderChart(state.currentData);
    });
  });
}

function initMAToggles() {
  document.querySelectorAll('.ma-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const ma = btn.dataset.ma;
      if (state.activeMA.has(ma)) { state.activeMA.delete(ma); btn.classList.remove('active'); }
      else { state.activeMA.add(ma); btn.classList.add('active'); }
      if (state.currentData) renderChart(state.currentData);
    });
  });
}

function initIndicatorTabs() {
  document.querySelectorAll('.indicator-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.indicator-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeIndicator = btn.dataset.indicator;
      if (state.currentData) renderSubChart(state.currentData, state.activeIndicator);
    });
  });
}

function initSignalFilters() {
  document.querySelectorAll('.signal-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.signal;
      if (state.activeSignals.has(type)) {
        state.activeSignals.delete(type);
        btn.classList.remove('active');
      } else {
        state.activeSignals.add(type);
        btn.classList.add('active');
      }
      if (state.currentCode) renderSignalMarkers();
    });
  });
}


// ════════════════════════════════════════
//  관심 종목 / 최근 조회
// ════════════════════════════════════════

function getWatchlist() { return JSON.parse(localStorage.getItem('watchlist') || '[]'); }
function getRecent()    { return JSON.parse(localStorage.getItem('recent')    || '[]'); }

function saveRecent(code) {
  let recent = getRecent().filter(c => c !== code);
  recent.unshift(code);
  localStorage.setItem('recent', JSON.stringify(recent.slice(0, 5)));
}

function renderWatchlist() {
  const list = getWatchlist();
  const el   = document.getElementById('watchlist');
  el.innerHTML = list.length
    ? list.map(code => {
        const s = state.stocks.find(s => s.code === code) || { name: code };
        return `<li data-code="${code}"><span>${s.name}</span><span class="wl-code">${code}</span></li>`;
      }).join('')
    : '<li style="color:var(--text-disabled);font-size:12px;padding:8px 16px;">없음</li>';
  el.querySelectorAll('li[data-code]').forEach(li =>
    li.addEventListener('click', () => loadStock(li.dataset.code))
  );
}

function renderRecent() {
  const list = getRecent();
  const el   = document.getElementById('recentList');
  el.innerHTML = list.length
    ? list.map(code => {
        const s = state.stocks.find(s => s.code === code) || { name: code };
        return `<li data-code="${code}"><span>${s.name}</span><span class="wl-code">${code}</span></li>`;
      }).join('')
    : '<li style="color:var(--text-disabled);font-size:12px;padding:8px 16px;">없음</li>';
  el.querySelectorAll('li[data-code]').forEach(li =>
    li.addEventListener('click', () => loadStock(li.dataset.code))
  );
}


// ════════════════════════════════════════
//  백테스팅
// ════════════════════════════════════════

function initBacktest() {
  const today      = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(today.getFullYear() - 1);
  document.getElementById('btEndDate').value   = today.toISOString().slice(0, 10);
  document.getElementById('btStartDate').value = oneYearAgo.toISOString().slice(0, 10);

  const input  = document.getElementById('btSearchInput');
  const result = document.getElementById('btSearchResult');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { result.classList.add('hidden'); return; }
    const filtered = state.stocks
      .filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      .slice(0, 10);
    result.innerHTML = filtered.map(s =>
      `<li data-code="${s.code}"><span>${s.name}</span><span class="code">${s.code}</span></li>`
    ).join('');
    result.classList.toggle('hidden', !filtered.length);
  });

  result.addEventListener('click', async e => {
    const li = e.target.closest('li');
    if (!li) return;
    btCode = li.dataset.code;
    const stock = state.stocks.find(s => s.code === btCode) || {};
    document.getElementById('btSelectedStock').textContent = `${stock.name || btCode} (${btCode})`;
    input.value = '';
    result.classList.add('hidden');

    const [ohlcvRes, signalRes] = await Promise.all([
      fetch(`data/ohlcv/${btCode}.json`),
      fetch(`data/signals/${btCode}.json`)
    ]);
    btOhlcv   = await ohlcvRes.json();
    btSignals = signalRes.ok ? await signalRes.json() : [];
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#btSearchInput') && !e.target.closest('#btSearchResult')) {
      result.classList.add('hidden');
    }
  });

  document.getElementById('btRunBtn').addEventListener('click', runBacktest);
}

function runBacktest() {
  if (!btCode || !btOhlcv?.length || !btSignals) {
    alert('종목을 먼저 선택해주세요.');
    return;
  }

  const buyType   = document.getElementById('btBuyStrategy').value;
  const sellType  = document.getElementById('btSellStrategy').value;
  const startDate = document.getElementById('btStartDate').value;
  const endDate   = document.getElementById('btEndDate').value;
  const initCash  = Number(document.getElementById('btInitCash').value);

  const ohlcv = btOhlcv.filter(d => d.date >= startDate && d.date <= endDate);
  if (ohlcv.length < 2) { alert('해당 기간의 데이터가 없습니다.'); return; }

  const buyDates  = new Set(btSignals.filter(s => s.type === buyType  && s.date >= startDate && s.date <= endDate).map(s => s.date));
  const sellDates = new Set(btSignals.filter(s => s.type === sellType && s.date >= startDate && s.date <= endDate).map(s => s.date));

  let cash = initCash, shares = 0, buyPrice = 0;
  let trades = [], equity = [], wins = 0, losses = 0;

  for (const d of ohlcv) {
    if (buyDates.has(d.date) && cash > 0 && shares === 0) {
      shares   = Math.floor(cash / d.close);
      buyPrice = d.close;
      cash    -= shares * d.close;
      trades.push({ date: d.date, side: 'buy', price: d.close, shares, profit: null });
    } else if (sellDates.has(d.date) && shares > 0) {
      const proceeds = shares * d.close;
      const profit   = proceeds - shares * buyPrice;
      const pct      = ((profit / (shares * buyPrice)) * 100).toFixed(2);
      if (profit >= 0) wins++; else losses++;
      trades.push({ date: d.date, side: 'sell', price: d.close, shares, profit, pct });
      cash  += proceeds;
      shares = 0;
    }
    equity.push({ date: d.date, value: cash + shares * d.close });
  }

  if (shares > 0) {
    const last     = ohlcv[ohlcv.length - 1];
    const proceeds = shares * last.close;
    const profit   = proceeds - shares * buyPrice;
    if (profit >= 0) wins++; else losses++;
    trades.push({ date: last.date, side: 'sell', price: last.close, shares, profit,
      pct: ((profit / (shares * buyPrice)) * 100).toFixed(2), note: '청산' });
    cash  += proceeds;
    equity[equity.length - 1].value = cash;
  }

  const finalValue  = equity[equity.length - 1]?.value || initCash;
  const totalReturn = ((finalValue - initCash) / initCash * 100).toFixed(2);

  let peak = initCash, mdd = 0;
  for (const e of equity) {
    if (e.value > peak) peak = e.value;
    const dd = (peak - e.value) / peak * 100;
    if (dd > mdd) mdd = dd;
  }

  const returns   = equity.map((e, i) => i === 0 ? 0 : (e.value - equity[i-1].value) / equity[i-1].value);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length);
  const sharpe    = stdReturn > 0 ? ((avgReturn / stdReturn) * Math.sqrt(252)).toFixed(2) : 'N/A';

  const totalTrades = wins + losses;
  const winRate     = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0;

  renderBacktestResult({ totalReturn, finalValue, initCash, mdd: mdd.toFixed(2), sharpe, wins, losses, winRate, totalTrades, equity, trades });
}

function renderBacktestResult(r) {
  const resultEl    = document.getElementById('btResult');
  const returnClass = r.totalReturn >= 0 ? 'positive' : 'negative';
  const sharpeClass = r.sharpe >= 1 ? 'positive' : r.sharpe >= 0 ? 'neutral' : 'negative';

  resultEl.innerHTML = `
    <div class="bt-summary">
      <div class="bt-card">
        <span class="bt-card-label">총 수익률</span>
        <span class="bt-card-value ${returnClass}">${r.totalReturn >= 0 ? '+' : ''}${r.totalReturn}%</span>
      </div>
      <div class="bt-card">
        <span class="bt-card-label">최종 자산</span>
        <span class="bt-card-value neutral">${Math.round(r.finalValue).toLocaleString()}원</span>
      </div>
      <div class="bt-card">
        <span class="bt-card-label">최대 낙폭 (MDD)</span>
        <span class="bt-card-value negative">-${r.mdd}%</span>
      </div>
      <div class="bt-card">
        <span class="bt-card-label">샤프 지수</span>
        <span class="bt-card-value ${sharpeClass}">${r.sharpe}</span>
      </div>
      <div class="bt-card">
        <span class="bt-card-label">승률</span>
        <span class="bt-card-value neutral">${r.winRate}%</span>
      </div>
      <div class="bt-card">
        <span class="bt-card-label">총 거래 횟수</span>
        <span class="bt-card-value neutral">${r.totalTrades}회 (${r.wins}승 ${r.losses}패)</span>
      </div>
    </div>
    <div class="bt-chart-wrap">
      <div class="bt-chart-title">수익 곡선</div>
      <div class="bt-chart-container" id="btChart"></div>
    </div>
    <div class="bt-trades-wrap">
      <div class="bt-trades-title">거래 내역</div>
      <table class="bt-trades-table">
        <thead>
          <tr><th>날짜</th><th>구분</th><th>가격</th><th>수량</th><th>손익</th><th>수익률</th></tr>
        </thead>
        <tbody>
          ${r.trades.map(t => `
            <tr>
              <td>${t.date}</td>
              <td style="color:${t.side === 'buy' ? 'var(--color-up)' : 'var(--color-down)'}">
                ${t.side === 'buy' ? '▲ 매수' : '▼ 매도'}${t.note ? ' ('+t.note+')' : ''}
              </td>
              <td>${t.price.toLocaleString()}</td>
              <td>${t.shares.toLocaleString()}</td>
              <td style="color:${t.profit === null ? 'var(--text-secondary)' : t.profit >= 0 ? 'var(--color-up)' : 'var(--color-down)'}">
                ${t.profit === null ? '—' : (t.profit >= 0 ? '+' : '') + Math.round(t.profit).toLocaleString() + '원'}
              </td>
              <td style="color:${t.pct === undefined ? 'var(--text-secondary)' : t.pct >= 0 ? 'var(--color-up)' : 'var(--color-down)'}">
                ${t.pct === undefined ? '—' : (t.pct >= 0 ? '+' : '') + t.pct + '%'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const btChartEl    = document.getElementById('btChart');
  const btChart      = LightweightCharts.createChart(btChartEl, {
    layout: { background: { type: LightweightCharts.ColorType.Solid, color: 'transparent' }, textColor: '#7a7f92' },
    grid: { vertLines: { color: '#1e2130' }, horzLines: { color: '#1e2130' } },
    rightPriceScale: { borderColor: '#1e2130' },
    timeScale: { borderColor: '#1e2130', timeVisible: true },
    width: btChartEl.clientWidth,
    height: 200,
  });
  const equitySeries = btChart.addSeries(LightweightCharts.LineSeries, {
    color: '#4ade80', lineWidth: 2, priceLineVisible: false
  });
  equitySeries.setData(r.equity.map(e => ({ time: e.date, value: e.value })));
  btChart.timeScale().fitContent();
}


// ════════════════════════════════════════
//  포트폴리오
// ════════════════════════════════════════

function initPortfolio() {
  pfHoldings = JSON.parse(localStorage.getItem('portfolio') || '[]');

  document.getElementById('pfAddBtn').addEventListener('click', () => {
    document.getElementById('pfForm').classList.toggle('hidden');
  });

  document.getElementById('pfCancelBtn').addEventListener('click', () => {
    document.getElementById('pfForm').classList.add('hidden');
    resetPfForm();
  });

  const input  = document.getElementById('pfSearchInput');
  const result = document.getElementById('pfSearchResult');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { result.classList.add('hidden'); return; }
    const filtered = state.stocks
      .filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      .slice(0, 10);
    result.innerHTML = filtered.map(s =>
      `<li data-code="${s.code}"><span>${s.name}</span><span class="code">${s.code}</span></li>`
    ).join('');
    result.classList.toggle('hidden', !filtered.length);
  });

  result.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    pfCode = li.dataset.code;
    const stock = state.stocks.find(s => s.code === pfCode) || {};
    document.getElementById('pfSelectedStock').textContent = `${stock.name || pfCode} (${pfCode})`;
    input.value = '';
    result.classList.add('hidden');
  });

  document.getElementById('pfSaveBtn').addEventListener('click', savePfHolding);
  document.getElementById('pfBuyDate').value = new Date().toISOString().slice(0, 10);

  renderPortfolio();
}

function resetPfForm() {
  pfCode = null;
  document.getElementById('pfSelectedStock').textContent = '선택 안됨';
  document.getElementById('pfSearchInput').value = '';
  document.getElementById('pfBuyPrice').value = '';
  document.getElementById('pfShares').value = '';
  document.getElementById('pfBuyDate').value = new Date().toISOString().slice(0, 10);
}

async function savePfHolding() {
  if (!pfCode) { alert('종목을 선택해주세요.'); return; }
  const buyPrice = Number(document.getElementById('pfBuyPrice').value);
  const shares   = Number(document.getElementById('pfShares').value);
  const buyDate  = document.getElementById('pfBuyDate').value;
  if (!buyPrice || !shares) { alert('매수가와 수량을 입력해주세요.'); return; }

  const stock = state.stocks.find(s => s.code === pfCode) || {};
  let currentPrice = buyPrice;
  try {
    const res = await fetch(`data/ohlcv/${pfCode}.json`);
    if (res.ok) {
      const data = await res.json();
      if (data?.length) currentPrice = data[data.length - 1].close;
    }
  } catch(e) {}

  pfHoldings.push({ code: pfCode, name: stock.name || pfCode, buyPrice, shares, buyDate, currentPrice });
  localStorage.setItem('portfolio', JSON.stringify(pfHoldings));

  document.getElementById('pfForm').classList.add('hidden');
  resetPfForm();
  renderPortfolio();
}

function renderPortfolio() {
  const tbody = document.getElementById('pfTableBody');

  if (!pfHoldings.length) {
    tbody.innerHTML = `
      <tr id="pfEmptyRow">
        <td colspan="10" style="text-align:center;color:var(--text-disabled);padding:40px;">
          보유 종목을 추가해주세요
        </td>
      </tr>`;
    updatePfSummary(0, 0);
    renderPfDonut([]);
    return;
  }

  let totalBuy = 0, totalEval = 0;

  tbody.innerHTML = pfHoldings.map((h, i) => {
    const buyAmt  = h.buyPrice * h.shares;
    const evalAmt = h.currentPrice * h.shares;
    const profit  = evalAmt - buyAmt;
    const pct     = ((profit / buyAmt) * 100).toFixed(2);
    totalBuy  += buyAmt;
    totalEval += evalAmt;

    const profitColor = profit >= 0 ? 'var(--color-up)' : 'var(--color-down)';

    return `
      <tr>
        <td>${h.name}</td>
        <td style="color:var(--text-secondary);font-size:11px;">${h.code}</td>
        <td>${h.buyPrice.toLocaleString()}</td>
        <td>${h.currentPrice.toLocaleString()}</td>
        <td>${h.shares.toLocaleString()}</td>
        <td>${buyAmt.toLocaleString()}</td>
        <td>${evalAmt.toLocaleString()}</td>
        <td style="color:${profitColor}">${profit >= 0 ? '+' : ''}${Math.round(profit).toLocaleString()}</td>
        <td style="color:${profitColor}">${profit >= 0 ? '+' : ''}${pct}%</td>
        <td><button class="pf-delete-btn" data-index="${i}">✕</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.pf-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pfHoldings.splice(Number(btn.dataset.index), 1);
      localStorage.setItem('portfolio', JSON.stringify(pfHoldings));
      renderPortfolio();
    });
  });

  updatePfSummary(totalBuy, totalEval);
  renderPfDonut(pfHoldings, totalEval);
}

function updatePfSummary(totalBuy, totalEval) {
  const profit = totalEval - totalBuy;
  const pct    = totalBuy > 0 ? ((profit / totalBuy) * 100).toFixed(2) : 0;

  document.getElementById('pfTotalBuy').textContent   = totalBuy  > 0 ? totalBuy.toLocaleString()  + '원' : '—';
  document.getElementById('pfTotalEval').textContent  = totalEval > 0 ? totalEval.toLocaleString() + '원' : '—';

  const profitEl = document.getElementById('pfTotalProfit');
  const returnEl = document.getElementById('pfTotalReturn');

  if (totalBuy > 0) {
    profitEl.textContent = (profit >= 0 ? '+' : '') + Math.round(profit).toLocaleString() + '원';
    profitEl.className   = 'pf-summary-value ' + (profit >= 0 ? 'positive' : 'negative');
    returnEl.textContent = (pct >= 0 ? '+' : '') + pct + '%';
    returnEl.className   = 'pf-summary-value ' + (pct >= 0 ? 'positive' : 'negative');
  } else {
    profitEl.textContent = '—';
    returnEl.textContent = '—';
    profitEl.className   = 'pf-summary-value';
    returnEl.className   = 'pf-summary-value';
  }
}

function renderPfDonut(holdings, totalEval = 0) {
  const canvas   = document.getElementById('pfDonutChart');
  const legendEl = document.getElementById('pfLegend');
  const ctx      = canvas.getContext('2d');

  ctx.clearRect(0, 0, 200, 200);
  legendEl.innerHTML = '';

  if (!holdings.length || totalEval === 0) {
    ctx.beginPath();
    ctx.arc(100, 100, 80, 0, Math.PI * 2);
    ctx.strokeStyle = '#1e2130';
    ctx.lineWidth = 30;
    ctx.stroke();
    return;
  }

  let startAngle = -Math.PI / 2;

  holdings.forEach((h, i) => {
    const evalAmt  = h.currentPrice * h.shares;
    const ratio    = evalAmt / totalEval;
    const endAngle = startAngle + ratio * Math.PI * 2;
    const color    = PF_COLORS[i % PF_COLORS.length];

    ctx.beginPath();
    ctx.arc(100, 100, 80, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 30;
    ctx.stroke();

    startAngle = endAngle;

    const li = document.createElement('li');
    li.innerHTML = `
      <span class="pf-legend-dot" style="background:${color}"></span>
      <span>${h.name}</span>
      <span style="margin-left:auto;color:var(--text-secondary)">${(ratio * 100).toFixed(1)}%</span>
    `;
    legendEl.appendChild(li);
  });
}

// ════════════════════════════════════════
//  모바일 신호 UI
// ════════════════════════════════════════

let mobileSignalData = [];
let mobileSheetSideFilter = 'all';

function initMobileSignal() {
  const bar     = document.getElementById('mobileSignalBar');
  const sheet   = document.getElementById('mobileSheet');
  const overlay = document.getElementById('mobileSheetOverlay');
  const closeBtn = document.getElementById('mobileSheetClose');

  // 신호 바 클릭 → 시트 열기
  bar.addEventListener('click', () => openMobileSheet());

  // 오버레이 / 닫기 버튼 → 시트 닫기
  overlay.addEventListener('click', closeMobileSheet);
  closeBtn.addEventListener('click', closeMobileSheet);

  // 필터 버튼
  document.querySelectorAll('.msf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.msf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mobileSheetSideFilter = btn.dataset.side;
      renderMobileSheetList();
    });
  });
}

function openMobileSheet() {
  const sheet   = document.getElementById('mobileSheet');
  const overlay = document.getElementById('mobileSheetOverlay');
  sheet.classList.remove('hidden');
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => sheet.classList.add('open'));
  renderMobileSheetList();
}

function closeMobileSheet() {
  const sheet   = document.getElementById('mobileSheet');
  const overlay = document.getElementById('mobileSheetOverlay');
  sheet.classList.remove('open');
  setTimeout(() => {
    sheet.classList.add('hidden');
    overlay.classList.add('hidden');
  }, 300);
}

function updateMobileSignalBar(signals) {
  mobileSignalData = signals;

  const cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recent    = signals.filter(s => s.date >= cutoffStr);

  const buy     = recent.filter(s => s.side === 'buy').length;
  const sell    = recent.filter(s => s.side === 'sell').length;
  const caution = recent.filter(s => s.side === 'caution').length;

  document.getElementById('msbBuy').textContent     = `▲ ${buy}`;
  document.getElementById('msbSell').textContent    = `▼ ${sell}`;
  document.getElementById('msbCaution').textContent = `● ${caution}`;

  const score = buy - sell;
  let verdict, color;
  if      (score >= 4)  { verdict = '강한 매수 🔥'; color = 'var(--color-up)'; }
  else if (score >= 2)  { verdict = '매수 우세 ▲';  color = 'var(--color-up)'; }
  else if (score >= 1)  { verdict = '약한 매수 ↑';  color = 'var(--color-up)'; }
  else if (score <= -4) { verdict = '강한 매도 ❄️'; color = 'var(--color-down)'; }
  else if (score <= -2) { verdict = '매도 우세 ▼';  color = 'var(--color-down)'; }
  else if (score <= -1) { verdict = '약한 매도 ↓';  color = 'var(--color-down)'; }
  else if (caution > 2) { verdict = '과열 주의 ⚠️'; color = 'var(--color-warning)'; }
  else                  { verdict = '중립 —';        color = 'var(--text-secondary)'; }

  const el = document.getElementById('msbVerdict');
  el.textContent  = verdict;
  el.style.color  = color;
}

function renderMobileSheetList() {
  const listEl  = document.getElementById('mobileSheetList');
  const filtered = mobileSheetSideFilter === 'all'
    ? mobileSignalData
    : mobileSignalData.filter(s => s.side === mobileSheetSideFilter);

  const latest = [...filtered].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  if (!latest.length) {
    listEl.innerHTML = '<li style="color:var(--text-disabled);font-size:13px;padding:16px;">신호 없음</li>';
    return;
  }

  listEl.innerHTML = latest.map(s => {
    const color = s.side === 'buy' ? 'var(--color-up)' : s.side === 'sell' ? 'var(--color-down)' : 'var(--color-warning)';
    const icon  = s.side === 'buy' ? '▲' : s.side === 'sell' ? '▼' : '●';
    return `
      <li>
        <span class="msl-label" style="color:${color}">${icon} ${s.label}</span>
        <span class="msl-date">${s.date} · ${s.price?.toLocaleString()}원</span>
        <span class="msl-desc">${s.desc || ''}</span>
      </li>
    `;
  }).join('');
}

// ════════════════════════════════════════
//  투자 전략 가이드 모달
// ════════════════════════════════════════
function initGuideModal() {
  const modal    = document.getElementById('guideModal');
  const overlay  = document.getElementById('guideOverlay');
  const closeBtn = document.getElementById('guideModalClose');
  const btn      = document.getElementById('guideBtn');

  const open  = () => { modal.classList.remove('hidden'); overlay.classList.remove('hidden'); };
  const close = () => { modal.classList.add('hidden');    overlay.classList.add('hidden'); };

  if (btn) btn.addEventListener('click', open);
  overlay.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  document.querySelectorAll('.guide-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.guide-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.guide-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`guide-${tab.dataset.guide}`).classList.remove('hidden');
    });
  });
}

// ── 시작 ──────────────────────────────
init();
