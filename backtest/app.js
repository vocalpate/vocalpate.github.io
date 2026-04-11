/**
 * 0050正2 投資策略回測引擎
 * 純前端 JavaScript 實作，無需後端
 */

// ===== 全域變數 =====
let stockData = null;
let assetChart = null;
let trancheCount = 2; // 預設2份

// 各份加碼預設值（跌幅閾值%, 動用現金%）
const TRANCHE_DEFAULTS = [
    { threshold: 10, ratio: 30 },  // 第一份：跌10%，動用30%
    { threshold: 20, ratio: 50 },  // 第二份：跌20%，動用50%
    { threshold: 30, ratio: 70 },  // 第三份：跌30%，動用70%
    { threshold: 40, ratio: 100 }, // 第四份：跌40%，動用100%
];

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    renderTranches(trancheCount);
    bindEvents();
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

    if (count === 0) {
        container.innerHTML = '';
        return;
    }

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

    // 綁定新產生的 slider 即時更新
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
    // 基本 Slider 即時顯示
    const sliders = [
        { id: 'initialRatio', display: 'initialRatioVal', suffix: '%' },
        { id: 'monthlyRatio', display: 'monthlyRatioVal', suffix: '%' },
    ];
    sliders.forEach(s => {
        const el = document.getElementById(s.id);
        const display = document.getElementById(s.display);
        el.addEventListener('input', () => {
            display.textContent = (s.prefix || '') + el.value + s.suffix;
        });
    });

    // 回測區間按鈕
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('startDate').value = '';
        });
    });

    // 自訂日期：填入時取消期間按鈕，清空時恢復預設（1年）
    const startDateEl = document.getElementById('startDate');
    startDateEl.addEventListener('change', () => {
        if (startDateEl.value) {
            // 有日期 → 取消所有按鈕 active
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        } else {
            // 清空日期 → 還原為 1年
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.period-btn[data-years="1"]')?.classList.add('active');
        }
    });

    // 加碼份數按鈕
    document.querySelectorAll('.tranche-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tranche-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTranches(parseInt(btn.dataset.count));
        });
    });

    // 執行回測
    document.getElementById('runBacktest').addEventListener('click', runBacktest);
}

// ===== 讀取參數 =====
function getParams() {
    // 讀取各份加碼設定，並按閾值由小到大排序
    const tranches = [];
    for (let i = 0; i < trancheCount; i++) {
        tranches.push({
            threshold: parseInt(document.getElementById(`dip${i}Threshold`).value) / 100,
            ratio: parseInt(document.getElementById(`dip${i}Ratio`).value) / 100,
            index: i, // 保留原始順序供顯示用
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
    if (!stockData || !stockData.data || stockData.data.length === 0) return null;

    let data = stockData.data;
    let startDate = null;

    const customDate = document.getElementById('startDate').value;
    if (customDate) {
        startDate = customDate;
    } else {
        const activeBtn = document.querySelector('.period-btn.active');
        const years = parseInt(activeBtn?.dataset.years || '0');
        if (years > 0) {
            const endDate = new Date(data[data.length - 1].date);
            const start = new Date(endDate);
            start.setFullYear(start.getFullYear() - years);
            startDate = start.toISOString().split('T')[0];
        }
    }

    if (startDate) {
        data = data.filter(d => d.date >= startDate);
    }

    return data;
}

// ===== 手續費計算 =====
function calcBuyFee(amount, discount) {
    // 買入手續費：0.1425% × 折扣
    return amount * 0.001425 * discount;
}

// ===== 回測引擎：你的策略 =====
function backtestStrategy(data, params) {
    let cash = params.initialCapital;
    let holdings = 0;
    let recentHigh = data[0].close;
    let totalInvested = 0;
    let currentMonth = '';
    const triggers = [];
    const assetHistory = [];

    // 每份加碼的觸發狀態（false = 尚未觸發）
    const trancheTriggered = new Array(params.tranches.length).fill(false);

    // 第一天：依初始投入比例買入
    const initialBuy = cash * params.initialRatio;
    if (initialBuy > 0) {
        const fee = calcBuyFee(initialBuy, params.feeDiscount);
        const shares = Math.floor(initialBuy / data[0].close);
        if (shares > 0) {
            holdings += shares;
            cash -= (shares * data[0].close + fee);
            totalInvested += shares * data[0].close;
        }
    }

    for (let i = 0; i < data.length; i++) {
        const day = data[i];
        const dayMonth = day.date.substring(0, 7); // YYYY-MM

        // 每月第一個交易日：加入月薪並定期定額投入
        if (dayMonth !== currentMonth) {
            currentMonth = dayMonth;
            if (i > 0) {
                cash += params.monthlyCash;
                const monthlyBuy = params.monthlyCash * params.monthlyRatio;
                if (monthlyBuy > 0 && cash >= monthlyBuy) {
                    const fee = calcBuyFee(monthlyBuy, params.feeDiscount);
                    const shares = Math.floor(monthlyBuy / day.close);
                    if (shares > 0 && cash >= shares * day.close + fee) {
                        holdings += shares;
                        cash -= (shares * day.close + fee);
                        totalInvested += shares * day.close;
                    }
                }
            }
        }

        // 創新高 → 重置所有份數的觸發狀態
        if (day.close > recentHigh) {
            recentHigh = day.close;
            trancheTriggered.fill(false);
        }

        // 計算目前跌幅（從近期高點）
        const drawdown = (day.close - recentHigh) / recentHigh;

        // 逐份檢查是否觸發加碼
        for (let t = 0; t < params.tranches.length; t++) {
            const tranche = params.tranches[t];
            if (drawdown <= -tranche.threshold && !trancheTriggered[t]) {
                const buyAmount = cash * tranche.ratio;
                if (buyAmount > 0) {
                    const fee = calcBuyFee(buyAmount, params.feeDiscount);
                    const shares = Math.floor(buyAmount / day.close);
                    if (shares > 0 && cash >= shares * day.close + fee) {
                        holdings += shares;
                        cash -= (shares * day.close + fee);
                        totalInvested += shares * day.close;
                        triggers.push({
                            date: day.date,
                            type: `dip${t}`,
                            trancheIndex: t,
                            price: day.close,
                            amount: shares * day.close,
                            drawdown: (drawdown * 100).toFixed(1),
                        });
                    }
                }
                trancheTriggered[t] = true;
            }
        }

        // 記錄當天總資產
        assetHistory.push({
            date: day.date,
            value: holdings * day.close + cash,
        });
    }

    return { assetHistory, triggers, totalInvested, cash, holdings };
}

// ===== 回測引擎：一次全部投入 =====
function backtestLumpSum(data, params) {
    let cash = params.initialCapital;
    let holdings = 0;
    let totalInvested = 0;
    let currentMonth = '';
    const assetHistory = [];

    // 第一天全部買入
    const fee = calcBuyFee(cash, params.feeDiscount);
    const shares = Math.floor(cash / data[0].close);
    if (shares > 0) {
        holdings += shares;
        cash -= (shares * data[0].close + fee);
        totalInvested += shares * data[0].close;
    }

    for (let i = 0; i < data.length; i++) {
        const day = data[i];
        const dayMonth = day.date.substring(0, 7);

        // 每月全額投入
        if (dayMonth !== currentMonth) {
            currentMonth = dayMonth;
            if (i > 0) {
                cash += params.monthlyCash;
                const buyAmount = params.monthlyCash;
                const fee2 = calcBuyFee(buyAmount, params.feeDiscount);
                const shares2 = Math.floor(buyAmount / day.close);
                if (shares2 > 0 && cash >= shares2 * day.close + fee2) {
                    holdings += shares2;
                    cash -= (shares2 * day.close + fee2);
                    totalInvested += shares2 * day.close;
                }
            }
        }

        assetHistory.push({
            date: day.date,
            value: holdings * day.close + cash,
        });
    }

    return { assetHistory, totalInvested };
}

// ===== 回測引擎：純定期定額 =====
function backtestDCA(data, params) {
    let cash = params.initialCapital;
    let holdings = 0;
    let totalInvested = 0;
    let currentMonth = '';
    const assetHistory = [];

    for (let i = 0; i < data.length; i++) {
        const day = data[i];
        const dayMonth = day.date.substring(0, 7);

        if (dayMonth !== currentMonth) {
            currentMonth = dayMonth;
            if (i > 0) {
                cash += params.monthlyCash;
            }
            const buyAmount = (i === 0 ? params.initialCapital : params.monthlyCash) * params.monthlyRatio;
            if (buyAmount > 0 && cash >= buyAmount) {
                const fee = calcBuyFee(buyAmount, params.feeDiscount);
                const shares = Math.floor(buyAmount / day.close);
                if (shares > 0 && cash >= shares * day.close + fee) {
                    holdings += shares;
                    cash -= (shares * day.close + fee);
                    totalInvested += shares * day.close;
                }
            }
        }

        assetHistory.push({
            date: day.date,
            value: holdings * day.close + cash,
        });
    }

    return { assetHistory, totalInvested };
}

// ===== 計算指標 =====
function calcMetrics(assetHistory, totalInvested) {
    if (assetHistory.length < 2) return {};

    const finalValue = assetHistory[assetHistory.length - 1].value;
    const totalReturn = (finalValue - totalInvested) / totalInvested;

    // CAGR
    const startDate = new Date(assetHistory[0].date);
    const endDate = new Date(assetHistory[assetHistory.length - 1].date);
    const years = (endDate - startDate) / (365.25 * 24 * 60 * 60 * 1000);
    const cagr = years > 0 ? Math.pow(finalValue / totalInvested, 1 / years) - 1 : 0;

    // 最大回撤
    let peak = 0;
    let maxDrawdown = 0;
    for (const point of assetHistory) {
        if (point.value > peak) peak = point.value;
        const drawdown = (point.value - peak) / peak;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    }

    // 夏普比率（年化，無風險利率 1.5%）
    const riskFreeRate = 0.015;
    const dailyReturns = [];
    for (let i = 1; i < assetHistory.length; i++) {
        dailyReturns.push(
            (assetHistory[i].value - assetHistory[i - 1].value) / assetHistory[i - 1].value
        );
    }
    const avgDailyReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const stdDev = Math.sqrt(
        dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgDailyReturn, 2), 0) / dailyReturns.length
    );
    const annualizedReturn = avgDailyReturn * 252;
    const annualizedStd = stdDev * Math.sqrt(252);
    const sharpe = annualizedStd > 0 ? (annualizedReturn - riskFreeRate) / annualizedStd : 0;

    return { finalValue, totalReturn, cagr, maxDrawdown, sharpe, totalInvested };
}

// ===== 執行回測 =====
function runBacktest() {
    const data = getBacktestData();
    if (!data || data.length === 0) {
        alert('尚未載入資料，請先執行 update_data.py 下載歷史資料');
        return;
    }

    const params = getParams();

    const yourResult = backtestStrategy(data, params);
    const lumpResult = backtestLumpSum(data, params);
    const dcaResult = backtestDCA(data, params);

    const yourMetrics = calcMetrics(yourResult.assetHistory, yourResult.totalInvested);
    const lumpMetrics = calcMetrics(lumpResult.assetHistory, lumpResult.totalInvested);
    const dcaMetrics = calcMetrics(dcaResult.assetHistory, dcaResult.totalInvested);

    displayResults(yourMetrics, lumpMetrics, dcaMetrics, yourResult, params);
    displayTriggerLog(yourResult.triggers);
    // 延遲渲染圖表，避免阻塞 UI
    setTimeout(() => {
        drawChart(yourResult.assetHistory, lumpResult.assetHistory, dcaResult.assetHistory, yourResult.triggers);
    }, 100);
}

// ===== 顯示結果 =====
function displayResults(yours, lump, dca, yourResult, params) {
    document.getElementById('resultsSection').style.display = 'block';

    // 你的策略
    document.getElementById('yourReturn').textContent = formatPercent(yours.totalReturn);
    document.getElementById('yourCAGR').textContent = formatPercent(yours.cagr);
    document.getElementById('yourDrawdown').textContent = formatPercent(yours.maxDrawdown);
    document.getElementById('yourSharpe').textContent = yours.sharpe.toFixed(2);

    // 一次投入
    document.getElementById('lumpReturn').textContent = formatPercent(lump.totalReturn);
    document.getElementById('lumpCAGR').textContent = formatPercent(lump.cagr);
    document.getElementById('lumpDrawdown').textContent = formatPercent(lump.maxDrawdown);
    document.getElementById('lumpSharpe').textContent = lump.sharpe.toFixed(2);

    // 純定期定額
    document.getElementById('dcaReturn').textContent = formatPercent(dca.totalReturn);
    document.getElementById('dcaCAGR').textContent = formatPercent(dca.cagr);
    document.getElementById('dcaDrawdown').textContent = formatPercent(dca.maxDrawdown);
    document.getElementById('dcaSharpe').textContent = dca.sharpe.toFixed(2);

    // 額外統計
    document.getElementById('totalInvested').textContent = formatMoney(yours.totalInvested);
    document.getElementById('finalAsset').textContent = formatMoney(yours.finalValue);

    // 加碼觸發次數（依份數動態顯示）
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

    // 採樣（降低點數提升效能，手機端重要）
    const maxPoints = 300;
    const step = Math.max(1, Math.floor(yourHistory.length / maxPoints));

    const labels = [];
    const yourData = [];
    const lumpData = [];
    const dcaData = [];

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
                {
                    label: '你的策略',
                    data: yourData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                },
                {
                    label: '一次投入',
                    data: lumpData,
                    borderColor: '#16a34a',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    borderDash: [5, 3],
                    fill: false,
                },
                {
                    label: '純定期定額',
                    data: dcaData,
                    borderColor: '#f59e0b',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    borderDash: [2, 2],
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, font: { size: 11 } },
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            return ctx.dataset.label + ': ' + formatMoney(ctx.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    ticks: { maxTicksLimit: 6, font: { size: 10 } },
                },
                y: {
                    display: true,
                    ticks: {
                        callback: v => formatMoney(v),
                        font: { size: 10 },
                    },
                },
            },
        },
    });
}

// ===== 加碼紀錄 =====
function displayTriggerLog(triggers) {
    const section = document.getElementById('triggerLog');
    const list = document.getElementById('triggerList');

    if (triggers.length === 0) {
        section.style.display = 'none';
        return;
    }

    const chineseNums = ['一', '二', '三', '四'];
    section.style.display = 'block';
    list.innerHTML = triggers.map(t => `
        <div class="trigger-item">
            <span class="trigger-type dip${t.trancheIndex}">
                第${chineseNums[t.trancheIndex] || (t.trancheIndex + 1)}份 ${t.drawdown}%
            </span>
            <span>${t.date}</span>
            <span>$${(t.price).toFixed(1)} 買 ${formatMoney(t.amount)}</span>
        </div>
    `).join('');
}

// ===== 格式化工具 =====
function formatPercent(value) {
    if (value == null || isNaN(value)) return '--';
    const sign = value >= 0 ? '+' : '';
    return sign + (value * 100).toFixed(1) + '%';
}

function formatMoney(value) {
    if (value == null || isNaN(value)) return '--';
    if (value >= 10000) {
        return (value / 10000).toFixed(1) + '萬';
    }
    return Math.round(value).toLocaleString();
}
