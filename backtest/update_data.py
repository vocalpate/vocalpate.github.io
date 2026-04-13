"""
0050正2 (00631L) 歷史資料下載腳本，同時下載 VIX 指數
存成 JSON 供前端回測使用
用法：py -3 update_data.py
"""

import sys
import io
# 修正 Windows 中文輸出（IDLE 環境無 buffer 屬性，略過即可）
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
except AttributeError:
    pass

import json
import os
from datetime import datetime

try:
    import yfinance as yf
    import pandas as pd
except ImportError:
    print("正在安裝依賴套件...")
    os.system("pip install yfinance pandas")
    import yfinance as yf
    import pandas as pd

STOCK_ID = "00631L"
YAHOO_TICKER = "00631L.TW"  # Yahoo Finance 台股代碼格式
VIX_TICKER = "^VIX"
START_DATE = "2014-10-01"


def fetch_stock_data():
    """從 Yahoo Finance 抓取 00631L 歷史資料，自動偵測並修正反向合併"""
    print(f"正在從 Yahoo Finance 下載 {YAHOO_TICKER} 歷史價格...")
    print(f"區間：{START_DATE} ~ 今天")

    ticker = yf.Ticker(YAHOO_TICKER)
    df = ticker.history(start=START_DATE, auto_adjust=False)

    if df.empty:
        print("下載失敗：沒有取得任何資料")
        return None

    print(f"取得 {len(df)} 筆交易日資料")
    print(f"原始價格範圍：{df['Close'].iloc[0]:.2f} ~ {df['Close'].iloc[-1]:.2f}")

    # 偵測反向合併：日報酬率 < -50% 或 > 200% 的日子
    df['ret'] = df['Close'].pct_change()
    split_dates = df[(df['ret'] < -0.5) | (df['ret'] > 2.0)].index.tolist()

    if split_dates:
        print(f"\n偵測到 {len(split_dates)} 個股票合併日：")
        # 從最新的合併日往回調整
        for split_date in reversed(split_dates):
            idx = df.index.get_loc(split_date)
            if idx == 0:
                continue
            prev_close = df['Close'].iloc[idx - 1]
            split_close = df['Close'].iloc[idx]
            # 合併比率：前一天收盤 / 合併後收盤
            ratio = prev_close / split_close
            print(f"  {split_date.date()}: {prev_close:.2f} -> {split_close:.2f} (比率 {ratio:.2f}:1)")

            # 調整合併日之前的所有價格（除以比率）
            df.loc[df.index < split_date, 'Open'] /= ratio
            df.loc[df.index < split_date, 'High'] /= ratio
            df.loc[df.index < split_date, 'Low'] /= ratio
            df.loc[df.index < split_date, 'Close'] /= ratio
            # 成交量反向調整（乘以比率）
            df.loc[df.index < split_date, 'Volume'] = (
                df.loc[df.index < split_date, 'Volume'] * ratio
            ).astype(int)

        print(f"\n調整後價格範圍：{df['Close'].iloc[0]:.2f} ~ {df['Close'].iloc[-1]:.2f}")
    else:
        print("未偵測到股票合併")

    # 下載 VIX 資料並對齊台股交易日
    print("\n正在下載 VIX 指數資料...")
    try:
        vix_ticker = yf.Ticker(VIX_TICKER)
        vix_df = vix_ticker.history(start=START_DATE, auto_adjust=False)
        if not vix_df.empty:
            vix_series = vix_df['Close'].squeeze()
            # 移除時區資訊，只保留日期
            vix_series.index = pd.to_datetime([d.date() for d in vix_series.index])
            # 對齊台股交易日（前向填充）
            stock_dates = pd.to_datetime([d.date() for d in df.index])
            vix_aligned = vix_series.reindex(stock_dates).ffill().bfill()
            df['vix'] = vix_aligned.values
            print(f"VIX 資料：{vix_series.iloc[0]:.1f} ~ {vix_series.iloc[-1]:.1f}（最新：{vix_series.iloc[-1]:.1f}）")
        else:
            print("VIX 下載失敗，跳過")
            df['vix'] = None
    except Exception as e:
        print(f"VIX 下載異常：{e}，跳過")
        df['vix'] = None

    records = []
    for date, row in df.iterrows():
        rec = {
            "date": date.strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
        }
        if row.get("vix") is not None and not pd.isna(row["vix"]):
            rec["vix"] = round(float(row["vix"]), 2)
        records.append(rec)

    return records


def save_json(records):
    """儲存為前端可用的 JSON 格式"""
    clean_data = records  # Yahoo Finance 資料已經整理好

    output = {
        "stock_id": STOCK_ID,
        "stock_name": "富邦台50正2",
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_records": len(clean_data),
        "data": clean_data,
    }

    output_path = os.path.join(os.path.dirname(__file__), "data", "00631L.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    file_size = os.path.getsize(output_path) / 1024
    print(f"已儲存至 {output_path}")
    print(f"檔案大小：{file_size:.1f} KB")
    print(f"資料範圍：{clean_data[0]['date']} ~ {clean_data[-1]['date']}")


if __name__ == "__main__":
    records = fetch_stock_data()
    if records:
        save_json(records)
        print("\n✅ 資料更新完成！")
    else:
        print("\n❌ 下載失敗，請確認網路連線和 FINMIND_TOKEN")
