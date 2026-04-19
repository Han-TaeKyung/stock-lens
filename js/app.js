// ── 상태 ──────────────────────────────
const state = {
  stocks: [],
  currentCode: null,
  currentData: null,
  activeMA: new Set(['ma5', 'ma20', 'ma60']),
  activeIndicator: 'rsi',
  activeMarket: 'ALL',
  charts: {},
};

// ── 초기화 ────────────────────────────
async function init() {
  await loadStocks();
  initSearch();
  initMarketTabs();
  initPeriodTabs();
  initMAToggles();
  initIndicatorTabs();
  initCharts();
  initWatchlistButton();
  renderWatchlist();
  renderRecent();
}

// ── 종목 목록 로드 ─────────────────────
async function loadStocks() {
  try {
    const res = await fetch('data/stocks.json');
    state.stocks = await res.json();
  } catch (e) {
    console.warn('stocks.json 로드 실패:', e);
  }
}

// ── 차트 초기화 ────────────────────────
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
  const mainEl   = document.getElementById('mainChart');
  const volEl    = document.getElementById('volumeChart');
  const subEl    = document.getElementById('subChart');

  // 메인 차트
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

  // 거래량 차트
  const volChart = LightweightCharts.createChart(volEl, {
    ...makeChartOptions(),
    width: volEl.clientWidth,
    height: 80,
  });
  const volSeries = volChart.addSeries(
    LightweightCharts.HistogramSeries,
    { priceFormat: { type: 'volume' }, priceScaleId: '' }
  );

  // 서브 차트 (RSI / MACD)
  const subChart = LightweightCharts.createChart(subEl, {
    ...makeChartOptions(),
    width: subEl.clientWidth,
    height: 120,
  });

  state.charts = { mainChart, candleSeries, volChart, volSeries, subChart, subSeries: null, maSeries: {} };

  // 크기 자동 조절
  new ResizeObserver(() => {
    mainChart.applyOptions({ width: mainEl.clientWidth, height: mainEl.clientHeight || 300 });
    volChart.applyOptions({ width: volEl.clientWidth });
    subChart.applyOptions({ width: subEl.clientWidth });
  }).observe(document.querySelector('.chart-area'));
}

// ── 종목 데이터 로드 ──────────────────
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

// ── 차트 렌더 ─────────────────────────
function renderChart(data) {
  if (!data?.length) return;
  const { mainChart, candleSeries, volSeries, maSeries } = state.charts;

  // 캔들
  candleSeries.setData(data.map(d => ({
    time: d.date, open: d.open, high: d.high, low: d.low, close: d.close
  })));

  // 기존 MA 시리즈 제거
  Object.values(maSeries).forEach(s => mainChart.removeSeries(s));
  state.charts.maSeries = {};

  // MA 오버레이
  const maColors = { ma5: '#60a5fa', ma20: '#f59e0b', ma60: '#c084fc', ma120: '#fb923c' };
  ['ma5', 'ma20', 'ma60', 'ma120'].forEach(key => {
    if (!state.activeMA.has(key)) return;
    const s = mainChart.addSeries(LightweightCharts.LineSeries, {
      color: maColors[key], lineWidth: 1, priceLineVisible: false
    });
    s.setData(data.filter(d => d[key] != null).map(d => ({ time: d.date, value: d[key] })));
    state.charts.maSeries[key] = s;
  });

  // 거래량
  volSeries.setData(data.map(d => ({
    time: d.date, value: d.volume,
    color: d.close >= d.open ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'
  })));

  // 서브 지표
  renderSubChart(data, state.activeIndicator);

  mainChart.timeScale().fitContent();
  state.charts.volChart.timeScale().fitContent();
  state.charts.subChart.timeScale().fitContent();
}

// ── 서브 지표 차트 ────────────────────
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

// ── 종목 정보 바 ──────────────────────
function updateStockInfo(data) {
  if (!data?.length) return;
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
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
    btn.textContent = inList ? '★ 관심 중' : '+ 관심 추가';
    btn.style.color = inList ? 'var(--color-accent)' : 'var(--text-secondary)';
    btn.style.borderColor = inList ? 'var(--color-accent)' : 'var(--border)';
  }
}

// ── 관심 종목 추가/제거 버튼 ────────────
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
      btn.textContent = '+ 관심 추가';
      btn.style.color = 'var(--text-secondary)';
      btn.style.borderColor = 'var(--border)';
    } else {
      list.unshift(code);
      btn.textContent = '★ 관심 중';
      btn.style.color = 'var(--color-accent)';
      btn.style.borderColor = 'var(--color-accent)';
    }
    localStorage.setItem('watchlist', JSON.stringify(list));
    renderWatchlist();
  });
}

// ── 검색 ──────────────────────────────
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

// ── 시장 탭 ───────────────────────────
function initMarketTabs() {
  document.querySelectorAll('.market-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.market-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeMarket = btn.dataset.market;
    });
  });
}

// ── 기간 탭 ───────────────────────────
function initPeriodTabs() {
  document.querySelectorAll('.period-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ── MA 토글 ───────────────────────────
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

// ── 서브 지표 탭 ──────────────────────
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

// ── 관심 종목 / 최근 조회 ─────────────
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

// ── 시작 ──────────────────────────────
init();