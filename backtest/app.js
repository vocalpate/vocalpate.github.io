/**
 * 0050正2 投資策略回測引擎
 * 純前端 JavaScript 實作，無需後端
 */

// ===== 全域變數 =====
let stockData = null;
let assetChart = null;
let priceChart = null;
let volumeChart = null;
let techData = null;       // 技術線圖用資料暫存
let techTriggers = [];     // 加碼觸發點暫存
let priceType = 'adj';     // 'adj'=還原 / 'raw'=原始
let trancheCount = 2;

// 已知逆分割紀錄（用於原始股價還原）
const KNOWN_SPLITS = [
    { date: '2026-03-23', ratio: 23.32 }  // 2026/3/23 富邦台50正2 逆分割 23.32:1
];

// MA 線顏色
const MA_COLORS = { 5: '#ef4444', 20: '#f97316', 60: '#22c55e', 120: '#3b82f6', 240: '#a855f7' };

// 各份加碼預設值
const TRANCHE_DEFAULTS = [
    { threshold: 10, ratio: 30 },
    { threshold: 20, ratio: 50 },
    { threshold: 30, ratio: 70 },
    { threshold: 40, ratio: 100 },
];

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    renderTranches(trancheCount);
    bindEvents();
    updatePeriodHint();
});

// ===== 載入資料 =====
async function loadData() {
    try {
        const response = await fetch('data/00631L.json');
        if (!response.ok) throw new Error('資料檔案不存在');
        stockData = await response.json();
        document.getElementById('dataInfo').textContent =
            `資料更新：${stockData.updated_at} | 共 ${stockData.total_records} 個交易日`;
    } catch (e) {
        document.getElementById('dataInfo').textContent = '尚未載入歷史資料，請先執行 update_data.py';
        console.warn('載入資料失敗:', e);
    }
}

// ===== 動態產生加碼份數 UI =====
function renderTranches(count) {
    trancheCount = count;
    const container = document.getElementById('trancheSettings');
    if (count === 0) { container.innerHTML = ''; return; }

    const chineseNums = ['一', '二', '三', '四'];
    let html = '';
    for (let i = 0; i < count; i++) {
        const def = TRANCHE_DEFAULTS[i];
        html += `
        <div class="tranche-row">
            <span class="tranche-label">第${chineseNums[i]}份加碼</span>
            <div class="tranche-inputs">
                <div class="tranche-field">
                    <span class="tranche-field-label">跌幅觸發</span>
                    <div class="slider-row">
                        <input type="range" id="dip${i}Threshold" min="1" max="60" value="${def.threshold}">
                        <span class="slider-value" id="dip${i}ThresholdVal">-${def.threshold}%</span>
                    </div>
                </div>
                <div class="tranche-field">
                    <span class="tranche-field-label">動用現金</span>
                    <div class="slider-row">
                        <input type="range" id="dip${i}Ratio" min="5" max="100" value="${def.ratio}">
                        <span class="slider-value" id="dip${i}RatioVal">${def.ratio}%</span>
                    </div>
                </div>
            </div>
        </div>`;
    }
    container.innerHTML = html;

    for (let i = 0; i < count; i++) {
        const thEl = document.getElementById(`dip${i}Threshold`);
        const thVal = document.getElementById(`dip${i}ThresholdVal`);
        const raEl = document.getElementById(`dip${i}Ratio`);
        const raVal = document.getElementById(`dip${i}RatioVal`);
        thEl.addEventListener('input', () => { thVal.textContent = `-${thEl.value}%`; });
        raEl.addEventListener('input', () => { raVal.textContent = `${raEl.value}%`; });
    }
}

// ===== 事件綁定 =====
function bindEvents() {
    // 基本 Slider
    ['initialRatio', 'monthlyRatio'].forEach(id => {
        const el = document.getElementById(id);
        const display = document.getElementById(id + 'Val');
        el.addEventListener('input', () => { display.textContent = el.value + '%'; });
    });

    // 區間按鈕
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // 全部 → 清空兩個日期；其他 → 只清結束日
            if (parseInt(btn.dataset.years) === 0) {
                document.getElementById('startDate').value = '';
            }
            document.getElementById('endDate').value = '';
            updatePeriodHint();
        });
    });

    // 起始日變更
    const startDateEl = document.getElementById('startDate');
    function onStartChange() { updatePeriodHint(); }
    startDateEl.addEventListener('change', onStartChange);
    startDateEl.addEventListener('input', onStartChange);

    // 結束日變更 → 停用區間按鈕
    const endDateEl = document.getElementById('endDate');
    function onEndChange() {
        if (endDateEl.value) {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        }
        updatePeriodHint();
    }
    endDateEl.addEventListener('change', onEndChange);
    endDateEl.addEventListener('input', onEndChange);

    // 加碼份數按鈕
    document.querySelectorAll('.tranche-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tranche-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTranches(parseInt(btn.dataset.count));
        });
    });

    // MA 均線按鈕
    document.querySelectorAll('.ma-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            redrawTechChart();
        });
    });

    // 還原/原始股價切換
    document.querySelectorAll('.price-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.price-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            priceType = btn.dataset.type;
            document.getElementById('restoredBadge').textContent =
                priceType === 'adj' ? '還原股價' : '原始股價（含逆分割）';
            redrawTechChart();
        });
    });

    // 執行回測
    document.getElementById('runBacktest').addEventListener('click', runBacktest);
}

// ===== 區間提示文字 =====
function updatePeriodHint() {
    const hint = document.getElementById('periodHint');
    const startVal = document.getElementById('startDate').value;
    const endVal = document.getElementById('endDate').value;
    const activeBtn = document.querySelector('.period-btn.active');
    const years = parseInt(activeBtn?.dataset.years || '0');

    if (startVal && endVal) {
        hint.textContent = `回測期間：${startVal} ~ ${endVal}`;
    } else if (startVal && years > 0) {
        const end = new Date(startVal);
        end.setFullYear(end.getFullYear() + years);
        hint.textContent = `回測期間：${startVal} ~ ${end.toISOString().split('T')[0]}（起始日 + ${years}年）`;
    } else if (startVal) {
        hint.textContent = `${startVal} ~ 最新資料`;
    } else if (years > 0) {
        hint.textContent = `最近 ${years} 年`;
    } else {
        hint.textContent = '全部歷史資料';
    }
}

// ===== 讀取參數 =====
function getParams() {
    const tranches = [];
    for (let i = 0; i < trancheCount; i++) {
        tranches.push({
            threshold: parseInt(document.getElementById(`dip${i}Threshold`).value) / 100,
            ratio: parseInt(document.getElementById(`dip${i}Ratio`).value) / 100,
            index: i,
        });
    }
    tranches.sort((a, b) => a.threshold - b.threshold);

    return {
        initialCapital: parseFloat(document.getElementById('initialCapital').value) * 10000,
        initialRatio: parseInt(document.getElementById('initialRatio').value) / 100,
        monthlyCash: parseFloat(document.getElementById('monthlyCash').value) * 10000,
        monthlyRatio: parseInt(document.getElementById('monthlyRatio').value) / 100,
        feeDiscount: parseInt(document.getElementById('feeDiscount').value) / 10,
        tranches,
    };
}

// ===== 取得回測資料區間 =====
function getBacktestData() {
    if (!stockData?.data?.length) return null;
    let data = stockData.data;

    const startInput = document.getElementById('startDate').value;
    const endInput = document.getElementById('endDate').value;
    const activeBtn = document.querySelector('.period-btn.active');
    const years = parseInt(activeBtn?.dataset.years || '0');

    let startDate = null;
    let endDate = null;

    if (startInput && endInput) {
        // 兩個日期都手動設定
        startDate = startInput;
        endDate = endInput;
    } else if (startInput && years > 0) {
        // 起始日 + N年
        startDate = startInput;
        const end = new Date(startInput);
        end.setFullYear(end.getFullYear() + years);
        endDate = end.toISOString().split('T')[0];
    } else if (startInput) {
        // 只有起始日（到最新）
        startDate = startInput;
    } else if (years > 0) {
        // 只有N年按鈕（最近N年）
        const lastDate = new Date(data[data.length - 1].date);
        const start = new Date(lastDate);
        start.setFullYear(start.getFullYear() - years);
        startDate = start.toISOString().split('T')[0];
    }
    // years === 0 且無日期 → 全部資料

    if (startDate) data = data.filter(d => d.date >= startDate);
    if (endDate) data = data.filter(d => d.date <= endDate);

    return data;
}

// ===== 買入計算（含手續費） =====
function calcBuy(budget, price, feeDiscount) {
    // 先扣手續費再算股數，確保 cost + fee ≤ budget
    const feeRate = 0.001425 * feeDiscount;
    const shares = Math.floor(budget / (price * (1 + feeRate)));
    if (shares <= 0) return { shares: 0, cost: 0, fee: 0 };
    const cost = shares * price;
    const fee = cost * feeRate;
    return { shares, cost, fee };
}

// ===== 回測引擎：你的策略 =====
function backtestStrategy(data, params) {
    let cash = params.initialCapital;
    let holdings = 0;
    let totalCapitalIn = params.initialCapital; // 追蹤所有投入的資金
    let recentHigh = data[0].close;
    let currentMonth = '';
    const triggers = [];
    const assetHistory = [];
    const trancheTriggered = new Array(params.tranches.length).fill(false);

    // 第一天投入
    const initialBudget = cash * params.initialRatio;
    if (initialBudget > 0) {
        const buy = calcBuy(initialBudget, data[0].close, params.feeDiscount);
        if (buy.shares > 0) {
            holdings += buy.shares;
            cash -= (buy.cost + buy.fee);
        }
    }

    for (let i = 0; i < data.length; i++) {
        const day = data[i];
        const dayMonth = day.date.substring(0, 7);

        // 每月第一個交易日
        if (dayMonth !== currentMonth) {
            currentMonth = dayMonth;
            if (i > 0) {
                cash += params.monthlyCash;
                totalCapitalIn += params.monthlyCash;
                const monthlyBudget = params.monthlyCash * params.monthlyRatio;
                if (monthlyBudget > 0) {
                    const buy = calcBuy(monthlyBudget, day.close, params.feeDiscount);
                    if (buy.shares > 0 && cash >= buy.cost + buy.fee) {
                        holdings += buy.shares;
                        cash -= (buy.cost + buy.fee);
                    }
                }
            }
        }

        // 創新高 → 重置觸發
        if (day.close > recentHigh) {
            recentHigh = day.close;
            trancheTriggered.fill(false);
        }

        // 跌幅檢查 & 逢低加碼
        const drawdown = (day.close - recentHigh) / recentHigh;
        for (let t = 0; t < params.tranches.length; t++) {
            const tranche = params.tranches[t];
            if (drawdown <= -tranche.threshold && !trancheTriggered[t]) {
                const buyBudget = cash * tranche.ratio;
                if (buyBudget > 0) {
                    const buy = calcBuy(buyBudget, day.close, params.feeDiscount);
                    if (buy.shares > 0 && cash >= buy.cost + buy.fee) {
                        holdings += buy.shares;
                        cash -= (buy.cost + buy.fee);
                        triggers.push({
                            date: day.date,
                            type: `dip${t}`,
                            trancheIndex: t,
                            price: day.close,
                            amount: buy.cost,
                            drawdown: (drawdown * 100).toFixed(1),
                        });
                    }
                }
                trancheTriggered[t] = true;
            }
        }

        assetHistory.push({ date: day.date, value: holdings * day.close + cash });
    }

    return { assetHistory, triggers, totalCapitalIn, cash, holdings };
}

// ===== 回測引擎：一次全部投入 =====
function backtestLumpSum(data, params) {
    let cash = params.initialCapital;
    let holdings = 0;
    let totalCapitalIn = params.initialCapital;
    let currentMonth = '';
    const assetHistory = [];

    // 第一天全部買入
    const buy = calcBuy(cash, data[0].close, params.feeDiscount);
    if (buy.shares > 0) {
        holdings += buy.shares;
        cash -= (buy.cost + buy.fee);
    }

    for (let i = 0; i < data.length; i++) {
        const day = data[i];
        const dayMonth = day.date.substring(0, 7);

        if (dayMonth !== currentMonth) {
            currentMonth = dayMonth;
            if (i > 0) {
                cash += params.monthlyCash;
                totalCapitalIn += params.monthlyCash;
                // 每月全額投入
                const buy2 = calcBuy(params.monthlyCash, day.close, params.feeDiscount);
                if (buy2.shares > 0 && cash >= buy2.cost + buy2.fee) {
                    holdings += buy2.shares;
                    cash -= (buy2.cost + buy2.fee);
                }
            }
        }

        assetHistory.push({ date: day.date, value: holdings * day.close + cash });
    }

    return { assetHistory, totalCapitalIn, cash, holdings };
}

// ===== 回測引擎：純定期定額 =====
function backtestDCA(data, params) {
    let cash = params.initialCapital;
    let holdings = 0;
    let totalCapitalIn = params.initialCapital;
    let currentMonth = '';
    const assetHistory = [];

    for (let i = 0; i < data.length; i++) {
        const day = data[i];
        const dayMonth = day.date.substring(0, 7);

        if (dayMonth !== currentMonth) {
            currentMonth = dayMonth;
            if (i > 0) {
                cash += params.monthlyCash;
                totalCapitalIn += params.monthlyCash;
            }
            // 純定期定額：每月固定投入 monthlyCash（不動用初始資金）
            const buyBudget = params.monthlyCash * params.monthlyRatio;
            if (buyBudget > 0) {
                const buy = calcBuy(buyBudget, day.close, params.feeDiscount);
                if (buy.shares > 0 && cash >= buy.cost + buy.fee) {
                    holdings += buy.shares;
                    cash -= (buy.cost + buy.fee);
                }
            }
        }

        assetHistory.push({ date: day.date, value: holdings * day.close + cash });
    }

    return { assetHistory, totalCapitalIn, cash, holdings };
}

// ===== 計算指標 =====
function calcMetrics(result) {
    const { assetHistory, totalCapitalIn } = result;
    if (!assetHistory || assetHistory.length < 2) return {};

    const finalValue = assetHistory[assetHistory.length - 1].value;
    const totalReturn = (finalValue - totalCapitalIn) / totalCapitalIn;

    // CAGR（以總投入資金為基準）
    const startDate = new Date(assetHistory[0].date);
    const endDate = new Date(assetHistory[assetHistory.length - 1].date);
    const years = (endDate - startDate) / (365.25 * 24 * 60 * 60 * 1000);
    const cagr = years > 0 ? Math.pow(finalValue / totalCapitalIn, 1 / years) - 1 : 0;

    // 最大回撤
    let peak = 0;
    let maxDrawdown = 0;
    for (const point of assetHistory) {
        if (point.value > peak) peak = point.value;
        const dd = (point.value - peak) / peak;
        if (dd < maxDrawdown) maxDrawdown = dd;
    }

    // 夏普比率（年化，無風險利率 1.5%）
    const riskFreeRate = 0.015;
    const dailyReturns = [];
    for (let i = 1; i < assetHistory.length; i++) {
        dailyReturns.push(
            (assetHistory[i].value - assetHistory[i - 1].value) / assetHistory[i - 1].value
        );
    }
    const avgDaily = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const stdDev = Math.sqrt(
        dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgDaily, 2), 0) / dailyReturns.length
    );
    const annReturn = avgDaily * 252;
    const annStd = stdDev * Math.sqrt(252);
    const sharpe = annStd > 0 ? (annReturn - riskFreeRate) / annStd : 0;

    return { finalValue, totalReturn, cagr, maxDrawdown, sharpe, totalCapitalIn };
}

// ===== 執行回測 =====
function runBacktest() {
    const data = getBacktestData();
    if (!data || data.length === 0) {
        alert('選擇的日期區間沒有資料，請調整日期');
        return;
    }

    const params = getParams();

    const yourResult = backtestStrategy(data, params);
    const lumpResult = backtestLumpSum(data, params);
    const dcaResult = backtestDCA(data, params);

    const yourMetrics = calcMetrics(yourResult);
    const lumpMetrics = calcMetrics(lumpResult);
    const dcaMetrics = calcMetrics(dcaResult);

    displayResults(yourMetrics, lumpMetrics, dcaMetrics, yourResult, lumpResult, dcaResult, params);
    displayTriggerLog(yourResult.triggers);
    setTimeout(() => {
        drawTechChart(data, yourResult.triggers);
        drawChart(yourResult.assetHistory, lumpResult.assetHistory, dcaResult.assetHistory, yourResult.triggers);
    }, 100);
}

// ===== 顯示結果 =====
function displayResults(yours, lump, dca, yourResult, lumpResult, dcaResult, params) {
    document.getElementById('resultsSection').style.display = 'block';

    // 績效指標
    document.getElementById('yourReturn').textContent = formatPercent(yours.totalReturn);
    document.getElementById('yourCAGR').textContent = formatPercent(yours.cagr);
    document.getElementById('yourDrawdown').textContent = formatPercent(yours.maxDrawdown);
    document.getElementById('yourSharpe').textContent = yours.sharpe.toFixed(2);

    document.getElementById('lumpReturn').textContent = formatPercent(lump.totalReturn);
    document.getElementById('lumpCAGR').textContent = formatPercent(lump.cagr);
    document.getElementById('lumpDrawdown').textContent = formatPercent(lump.maxDrawdown);
    document.getElementById('lumpSharpe').textContent = lump.sharpe.toFixed(2);

    document.getElementById('dcaReturn').textContent = formatPercent(dca.totalReturn);
    document.getElementById('dcaCAGR').textContent = formatPercent(dca.cagr);
    document.getElementById('dcaDrawdown').textContent = formatPercent(dca.maxDrawdown);
    document.getElementById('dcaSharpe').textContent = dca.sharpe.toFixed(2);

    // 財務明細（三策略比較）
    document.getElementById('yourCapital').textContent = formatMoney(yourResult.totalCapitalIn);
    document.getElementById('lumpCapital').textContent = formatMoney(lumpResult.totalCapitalIn);
    document.getElementById('dcaCapital').textContent = formatMoney(dcaResult.totalCapitalIn);

    document.getElementById('yourCash').textContent = formatMoney(yourResult.cash);
    document.getElementById('lumpCash').textContent = formatMoney(lumpResult.cash);
    document.getElementById('dcaCash').textContent = formatMoney(dcaResult.cash);

    document.getElementById('yourFinal').textContent = formatMoney(yours.finalValue);
    document.getElementById('lumpFinal').textContent = formatMoney(lump.finalValue);
    document.getElementById('dcaFinal').textContent = formatMoney(dca.finalValue);

    // 加碼觸發
    if (params.tranches.length === 0) {
        document.getElementById('triggerCount').textContent = '不加碼';
    } else {
        const chineseNums = ['一', '二', '三', '四'];
        const counts = params.tranches.map((_, i) =>
            yourResult.triggers.filter(t => t.trancheIndex === i).length
        );
        document.getElementById('triggerCount').textContent =
            counts.map((c, i) => `第${chineseNums[i]}份 ${c}次`).join(' / ');
    }
}

// ===== 繪製圖表 =====
function drawChart(yourHistory, lumpHistory, dcaHistory, triggers) {
    document.getElementById('chartSection').style.display = 'block';
    const ctx = document.getElementById('assetChart').getContext('2d');
    if (assetChart) assetChart.destroy();

    const maxPoints = 300;
    const step = Math.max(1, Math.floor(yourHistory.length / maxPoints));
    const labels = [], yourData = [], lumpData = [], dcaData = [];

    for (let i = 0; i < yourHistory.length; i += step) {
        labels.push(yourHistory[i].date);
        yourData.push(yourHistory[i].value);
        lumpData.push(lumpHistory[i]?.value || null);
        dcaData.push(dcaHistory[i]?.value || null);
    }

    assetChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: '你的策略', data: yourData, borderColor: '#2563eb', borderWidth: 2, pointRadius: 0, fill: false },
                { label: '一次投入', data: lumpData, borderColor: '#16a34a', borderWidth: 1.5, pointRadius: 0, borderDash: [5, 3], fill: false },
                { label: '純定期定額', data: dcaData, borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0, borderDash: [2, 2], fill: false },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + formatMoney(ctx.raw) } },
            },
            scales: {
                x: { ticks: { maxTicksLimit: 6, font: { size: 10 } } },
                y: { ticks: { callback: v => formatMoney(v), font: { size: 10 } } },
            },
        },
    });
}

// ===== 加碼紀錄 =====
function displayTriggerLog(triggers) {
    const section = document.getElementById('triggerLog');
    const list = document.getElementById('triggerList');
    if (triggers.length === 0) { section.style.display = 'none'; return; }

    const chineseNums = ['一', '二', '三', '四'];
    section.style.display = 'block';
    list.innerHTML = triggers.map(t => `
        <div class="trigger-item">
            <span class="trigger-type dip${t.trancheIndex}">
                第${chineseNums[t.trancheIndex] || (t.trancheIndex + 1)}份 ${t.drawdown}%
            </span>
            <span>${t.date}</span>
            <span>$${t.price.toFixed(1)} 買 ${formatMoney(t.amount)}</span>
        </div>
    `).join('');
}

// ===== 技術線圖 =====

/** 計算移動平均（回傳與原陣列等長，不足 period 的位置為 null） */
function calcMA(closes, period) {
    return closes.map((_, i) => {
        if (i < period - 1) return null;
        return closes.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
    });
}

/** 依目前 priceType 取得顯示價格 */
function getDisplayClose(date, adjClose) {
    if (priceType === 'adj') return adjClose;
    // 原始股價：逆分割前乘回比例
    for (const sp of KNOWN_SPLITS) {
        if (date < sp.date) return adjClose * sp.ratio;
    }
    return adjClose;
}

/** 取得目前勾選的 MA periods */
function getActiveMAs() {
    return [...document.querySelectorAll('.ma-btn.active')].map(b => parseInt(b.dataset.period));
}

/** 重繪技術線圖（MA 切換 / 股價模式切換時呼叫） */
function redrawTechChart() {
    if (techData) drawTechChart(techData, techTriggers);
}

/** 主要技術線圖繪製函式 */
function drawTechChart(data, triggers = []) {
    techData = data;
    techTriggers = triggers;
    document.getElementById('techSection').style.display = 'block';

    const allCloses = data.map(d => getDisplayClose(d.date, d.close));

    // 降採樣（提升效能）
    const maxPts = 400;
    const step = Math.max(1, Math.floor(data.length / maxPts));
    const labels = [], closes = [], volumes = [];
    for (let i = 0; i < data.length; i += step) {
        labels.push(data[i].date);
        closes.push(allCloses[i]);
        volumes.push(data[i].volume || 0);
    }

    // MA 資料集
    const maDatasets = getActiveMAs().map(period => {
        const maAll = calcMA(allCloses, period);
        const maSampled = [];
        for (let i = 0; i < data.length; i += step) maSampled.push(maAll[i]);
        return {
            label: `MA${period}`,
            data: maSampled,
            borderColor: MA_COLORS[period],
            borderWidth: 1.3,
            pointRadius: 0,
            fill: false,
            spanGaps: true,
        };
    });

    // 加碼觸發點（疊加在價格圖上）
    const chineseNums = ['一', '二', '三', '四'];
    const triggerColors = ['#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];
    const triggerDatasets = [0, 1, 2, 3].map(t => {
        const pts = labels.map((lbl, i) => {
            const tr = triggers.find(tr => tr.trancheIndex === t && tr.date === lbl);
            return tr ? closes[i] : null;
        });
        const hasAny = pts.some(v => v !== null);
        if (!hasAny) return null;
        return {
            label: `第${chineseNums[t]}份買入`,
            data: pts,
            borderColor: 'transparent',
            backgroundColor: triggerColors[t],
            pointRadius: pts.map(v => v !== null ? 7 : 0),
            pointStyle: 'triangle',
            pointBackgroundColor: triggerColors[t],
            pointBorderColor: 'white',
            pointBorderWidth: 1,
            fill: false,
            spanGaps: false,
        };
    }).filter(Boolean);

    // 繪製價格圖
    const priceCtx = document.getElementById('priceChart').getContext('2d');
    if (priceChart) priceChart.destroy();

    priceChart = new Chart(priceCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '00631L',
                    data: closes,
                    borderColor: '#1e40af',
                    borderWidth: 1.8,
                    pointRadius: 0,
                    fill: false,
                },
                ...maDatasets,
                ...triggerDatasets,
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 10, font: { size: 10 }, usePointStyle: true },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (ctx.raw == null) return null;
                            return ctx.dataset.label + ': $' + ctx.raw.toFixed(2);
                        }
                    }
                },
            },
            scales: {
                x: { ticks: { maxTicksLimit: 6, font: { size: 10 } } },
                y: {
                    ticks: { font: { size: 10 }, callback: v => '$' + v.toFixed(1) },
                },
            },
        },
    });

    // 繪製成交量圖
    const volCtx = document.getElementById('volumeChart').getContext('2d');
    if (volumeChart) volumeChart.destroy();

    volumeChart = new Chart(volCtx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: volumes,
                backgroundColor: 'rgba(100, 116, 139, 0.45)',
                borderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: {
                    ticks: {
                        maxTicksLimit: 3,
                        font: { size: 9 },
                        callback: v => v >= 1e6 ? (v / 1e6).toFixed(0) + 'M'
                            : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v,
                    },
                },
            },
        },
    });
}

// ===== 格式化工具 =====
function formatPercent(value) {
    if (value == null || isNaN(value)) return '--';
    return (value >= 0 ? '+' : '') + (value * 100).toFixed(1) + '%';
}

function formatMoney(value) {
    if (value == null || isNaN(value)) return '--';
    if (Math.abs(value) >= 10000) return (value / 10000).toFixed(1) + '萬';
    return Math.round(value).toLocaleString();
}
