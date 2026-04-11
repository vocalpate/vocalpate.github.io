/**
 * 0050正2 投資策略回測引擎
 * 純前端 JavaScript 實作，無需後端
 */

// ===== 全域變數 =====
let stockData = null;
let assetChart = null;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
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

// ===== 事件綁定 =====
function bindEvents() {
    // Slider 即時顯示數值
    const sliders = [
        { id: 'initialRatio', display: 'initialRatioVal', suffix: '%' },
        { id: 'monthlyRatio', display: 'monthlyRatioVal', suffix: '%' },
        { id: 'dip1Threshold', display: 'dip1ThresholdVal', prefix: '-', suffix: '%' },
        { id: 'dip1Ratio', display: 'dip1RatioVal', suffix: '%' },
        { id: 'dip2Threshold', display: 'dip2ThresholdVal', prefix: '-', suffix: '%' },
        { id: 'dip2Ratio', display: 'dip2RatioVal', suffix: '%' },
    ];

    sliders.forEach(s => {
        const el = document.getElementById(s.id);
        const display = document.getElementById(s.display);
        el.addEventListener('input', () => {
            display.textContent = (s.prefix || '') + el.value + s.suffix;
        });
    });

    // 區間按鈕
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // 清除自訂日期
            document.getElementById('startDate').value = '';
        });
    });

    // 觸發模式切換
    document.getElementById('triggerMode').addEventListener('change', (e) => {
        const absoluteInputs = document.querySelector('.absolute-price-inputs');
        absoluteInputs.style.display = e.target.value === 'absolute' ? 'block' : 'none';
    });

    // 執行回測
    document.getElementById('runBacktest').addEventListener('click', runBacktest);
}

// ===== 讀取參數 =====
function getParams() {
    return {
        initialCapital: parseFloat(document.getElementById('initialCapital').value) * 10000,
        initialRatio: parseInt(document.getElementById('initialRatio').value) / 100,
        monthlyCash: parseFloat(document.getElementById('monthlyCash').value) * 10000,
        monthlyRatio: parseInt(document.getElementById('monthlyRatio').value) / 100,
        dip1Threshold: parseInt(document.getElementById('dip1Threshold').value) / 100,
        dip1Ratio: parseInt(document.getElementById('dip1Ratio').value) / 100,
        dip2Threshold: parseInt(document.getElementById('dip2Threshold').value) / 100,
        dip2Ratio: parseInt(document.getElementById('dip2Ratio').value) / 100,
        feeDiscount: parseInt(document.getElementById('feeDiscount').value) / 10,
        triggerMode: document.getElementById('triggerMode').value,
        dip1Price: parseFloat(document.getElementById('dip1Price').value),
        dip2Price: parseFloat(document.getElementById('dip2Price').value),
    };
}

// ===== 取得回測資料區間 =====
function getBacktestData() {
    if (!stockData || !stockData.data || stockData.data.length === 0) return null;

    let data = stockData.data;
    let startDate = null;

    // 優先用自訂日期
    const customDate = document.getElementById('startDate').value;
    if (customDate) {
        startDate = customDate;
    } else {
        // 用按鈕選擇
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
    let dip1Triggered = false;
    let dip2Triggered = false;
    let totalInvested = 0;
    let currentMonth = '';
    const triggers = [];
    const assetHistory = [];

    // 第一天投入
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

        // 每月第一個交易日
        if (dayMonth !== currentMonth) {
            currentMonth = dayMonth;
            if (i > 0) { // 跳過第一天（已處理初始投入）
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

        // 更新高點 & 重置觸發
        if (day.close > recentHigh) {
            recentHigh = day.close;
            dip1Triggered = false;
            dip2Triggered = false;
        }

        // 檢查逢低/大跌觸發
        let shouldTriggerDip1 = false;
        let shouldTriggerDip2 = false;

        if (params.triggerMode === 'percent') {
            const drawdown = (day.close - recentHigh) / recentHigh;
            shouldTriggerDip1 = drawdown <= -params.dip1Threshold;
            shouldTriggerDip2 = drawdown <= -params.dip2Threshold;
        } else {
            shouldTriggerDip1 = day.close <= params.dip1Price;
            shouldTriggerDip2 = day.close <= params.dip2Price;
        }

        // 第一份逢低加碼
        if (shouldTriggerDip1 && !dip1Triggered) {
            const buyAmount = cash * params.dip1Ratio;
            if (buyAmount > 0) {
                const fee = calcBuyFee(buyAmount, params.feeDiscount);
                const shares = Math.floor(buyAmount / day.close);
                if (shares > 0 && cash >= shares * day.close + fee) {
                    holdings += shares;
                    cash -= (shares * day.close + fee);
                    totalInvested += shares * day.close;
                    triggers.push({
                        date: day.date,
                        type: 'dip1',
                        price: day.close,
                        amount: shares * day.close,
                        drawdown: ((day.close - recentHigh) / recentHigh * 100).toFixed(1),
                    });
                }
            }
            dip1Triggered = true;
        }

        // 第二份大跌加碼
        if (shouldTriggerDip2 && !dip2Triggered) {
            const buyAmount = cash * params.dip2Ratio;
            if (buyAmount > 0) {
                const fee = calcBuyFee(buyAmount, params.feeDiscount);
                const shares = Math.floor(buyAmount / day.close);
                if (shares > 0 && cash >= shares * day.close + fee) {
                    holdings += shares;
                    cash -= (shares * day.close + fee);
                    totalInvested += shares * day.close;
                    triggers.push({
                        date: day.date,
                        type: 'dip2',
                        price: day.close,
                        amount: shares * day.close,
                        drawdown: ((day.close - recentHigh) / recentHigh * 100).toFixed(1),
                    });
                }
            }
            dip2Triggered = true;
        }

        // 記錄資產
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

    // 第一天全部投入
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
                const buyAmount = params.monthlyCash; // 全額投入
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

    // 第一天不投入，等每月定期定額
    for (let i = 0; i < data.length; i++) {
        const day = data[i];
        const dayMonth = day.date.substring(0, 7);

        if (dayMonth !== currentMonth) {
            currentMonth = dayMonth;
            if (i > 0) {
                cash += params.monthlyCash;
            }
            // 每月固定投入（用 monthlyRatio 比例）
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

    // 年化報酬 CAGR
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

    return {
        finalValue,
        totalReturn,
        cagr,
        maxDrawdown,
        sharpe,
        totalInvested,
    };
}

// ===== 執行回測 =====
function runBacktest() {
    const data = getBacktestData();
    if (!data || data.length === 0) {
        alert('尚未載入資料，請先執行 update_data.py 下載歷史資料');
        return;
    }

    const params = getParams();

    // 三種策略回測
    const yourResult = backtestStrategy(data, params);
    const lumpResult = backtestLumpSum(data, params);
    const dcaResult = backtestDCA(data, params);

    // 計算指標
    const yourMetrics = calcMetrics(yourResult.assetHistory, yourResult.totalInvested);
    const lumpMetrics = calcMetrics(lumpResult.assetHistory, lumpResult.totalInvested);
    const dcaMetrics = calcMetrics(dcaResult.assetHistory, dcaResult.totalInvested);

    // 顯示結果
    displayResults(yourMetrics, lumpMetrics, dcaMetrics, yourResult);
    displayTriggerLog(yourResult.triggers);
    // 圖表延遲渲染，避免阻塞 UI
    setTimeout(() => {
        drawChart(yourResult.assetHistory, lumpResult.assetHistory, dcaResult.assetHistory, yourResult.triggers);
    }, 100);
}

// ===== 顯示結果 =====
function displayResults(yours, lump, dca, yourResult) {
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
    document.getElementById('triggerCount').textContent =
        `逢低 ${yourResult.triggers.filter(t => t.type === 'dip1').length} 次 / 大跌 ${yourResult.triggers.filter(t => t.type === 'dip2').length} 次`;
}

// ===== 繪製圖表 =====
function drawChart(yourHistory, lumpHistory, dcaHistory, triggers) {
    document.getElementById('chartSection').style.display = 'block';

    const ctx = document.getElementById('assetChart').getContext('2d');

    if (assetChart) {
        assetChart.destroy();
    }

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

    // 加碼標記點
    const triggerPoints = triggers.map(t => ({
        x: t.date,
        y: yourHistory.find(h => h.date === t.date)?.value || 0,
        type: t.type,
    }));

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
            interaction: {
                mode: 'index',
                intersect: false,
            },
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
                    ticks: {
                        maxTicksLimit: 6,
                        font: { size: 10 },
                    },
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

    section.style.display = 'block';
    list.innerHTML = triggers.map(t => `
        <div class="trigger-item">
            <span class="trigger-type ${t.type}">
                ${t.type === 'dip1' ? '逢低' : '大跌'} ${t.drawdown}%
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
