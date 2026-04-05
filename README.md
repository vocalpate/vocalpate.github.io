# 工具中心 Portal

個人專案中央入口，部署於 GitHub Pages。

## 檔案結構

```
portal/
├── index.html      ← 主頁面（不需修改）
├── config.json     ← 專案設定（新增/修改專案只改這裡）
└── README.md       ← 說明文件
```

## 新增專案

編輯 `config.json`，在 `projects` 陣列中加入：

```json
{
  "name": "專案名稱",
  "desc": "一行描述",
  "url": "https://連結",
  "icon": "📦",
  "iconBg": "#E1F5EE",
  "category": "分類名稱",
  "status": "live",
  "tags": [
    { "text": "標籤", "color": "blue" }
  ]
}
```

### 欄位說明

| 欄位 | 說明 | 範例 |
|------|------|------|
| `status` | `live` 已上線 / `dev` 開發中 / `plan` 規劃中 | `"live"` |
| `color` | 標籤色：`green` `blue` `purple` `amber` `coral` `gray` | `"blue"` |
| `category` | 對應側欄分類，新分類會自動出現 | `"AI 工具"` |

### 新增分類

在 `config.json` 的 `categories` 加入：

```json
"categories": {
  "居家醫療": "🏠",
  "新分類名": "🆕"
}
```

## 部署方式

### 方式一：放在現有 repo 根目錄

```bash
# 將 index.html 和 config.json 放到 vocalpate.github.io repo 根目錄
cp index.html /path/to/vocalpate.github.io/
cp config.json /path/to/vocalpate.github.io/
cd /path/to/vocalpate.github.io
git add index.html config.json
git commit -m "feat: 新增工具中心 Portal"
git push
```

→ 網址：`https://vocalpate.github.io/`

### 方式二：建立獨立 repo

```bash
# 建立新 repo: portal
cd /path/to/portal
git init
git add .
git commit -m "feat: 初始化工具中心 Portal"
git remote add origin https://github.com/vocalpate/portal.git
git push -u origin main
# 在 GitHub Settings → Pages → 選擇 main branch
```

→ 網址：`https://vocalpate.github.io/portal/`

## 功能

- **分類側欄**：自動從 config.json 產生
- **即時搜尋**：搜尋名稱、描述、標籤，結果高亮
- **狀態篩選**：已上線 / 開發中 / 規劃中
- **快捷鍵**：`/` 聚焦搜尋，`Esc` 清除
- **深色模式**：跟隨系統設定
- **RWD**：手機版自動收合側欄為漢堡選單
