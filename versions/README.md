# 德州撲克版本快照

`versions/` 用來保存少量歷史檔案快照，方便在重大介面改動後人工比較或緊急回退。

## 重要區分

版本資料夾不是目前正式網站來源，也不等於最新穩定 `main`。

目前唯一正式來源：

```text
Repository: qookey109-pixel/texas-holdem
Branch: main
Publish folder: / (root)
Local: /Users/qoo/Documents/GitHub/texas-holdem
```

不得從以下位置修改或發布：

```text
qoo109/texas-holdem
/Users/qoo/Desktop/德州
versions/<任何歷史資料夾>
```

## 快照命名格式

```text
v版本號-改動註解-日期
```

例如：

```text
v41-winner-glow-2026-07-06
v44-hero-card-slim-2026-07-06
```

每個傳統快照資料夾至少保存：

```text
index.html
styles.css
app.js
VERSION.md
```

## 目前保留的歷史資料夾

```text
v75-smaller-table-2026-07-18
v76-ux-readability-tuning-2026-07-18
v77-pixel-card-theme-2026-07-19
```

`v77-pixel-card-theme-2026-07-19` 是目前最新的「資料夾快照」，但不是最新正式版本。

## 正式發布紀錄

### AI V1.9 — 2026-08-04

發布文件：

```text
docs/releases/2026-08-04-ai-v1-9.md
```

完整合併後正式基準：

```text
10f6f77abebc93a16fda9e138953d2df82e85987
```

該版本包含：

- 初階連續牌力與 Pot 相對下注尺寸。
- Call／Raise 淨 EV 會計。
- 有效籌碼與 SPR。
- 連續 All-in 單一調整鏈。
- 河牌單挑 990 組精確枚舉。
- 真正多人聯合 Equity 模擬。
- Oracle 360／Chronos 480 次多人樣本。
- 公平 Boss 正式接線與 legacy fallback。
- Equity Engine `1.0.1` 牌面正規化。

後續校準基準：

```text
docs/ai-calibration-v1-9.md
```

此 SHA 只代表 AI V1.9 發布基準，不得視為永久最新 `main`。

## 目前正式功能基準

截至 2026-08-04，正式 `main` 已遠超 v77，包含：

- 新 Repository 遷移與 GitHub Pages root 發布
- Chromium／WebKit Browser E2E
- 19 位永久淘汰賽、分層候補與對稱縮桌
- Google 登入與 Supabase 淘汰賽雲端存檔
- Oracle／Chronos 公平七星 Boss
- Gemini 安全後端、本地備援與可切換 Provider
- AI V1.1 多街角色策略
- AI V1.2 翻牌前位置化範圍
- AI V1.3 分街玩家模型
- AI V1.4 長期安全記憶
- AI V1.5 多人底池與公開範圍分布
- AI V1.6 固定種子校準工具
- AI V1.7 初階牌力與淨 EV 基礎
- AI V1.8 有效籌碼、SPR 與 All-in 單一調整鏈
- AI V1.9 公平 Boss 精確河牌、真正多人 Equity 與正式接線
- Safari 公共牌街道轉場效能優化

目前正式 AI V1.9 發布基準為：

```text
10f6f77abebc93a16fda9e138953d2df82e85987
```

此 SHA 只代表 2026-08-04 的 AI V1.9 發布點，不得視為永久最新版本。接續工作前必須重新讀取 GitHub `main`。

## 回退原則

優先使用 Git 與已驗證 commit 回退，不建議直接把舊資料夾內容覆蓋到 root。

正確流程：

1. 確認目前問題與最後正常 commit。
2. 從最新 `main` 建立修復或回退分支。
3. 使用 Git 還原指定檔案或 cherry-pick 安全修正。
4. 執行 Static、Chromium、WebKit 驗證。
5. 透過 Pull Request 合併。

只有在 Git 歷史不可用且使用者明確同意時，才考慮從 `versions/` 人工取回特定檔案；不得整包覆蓋目前 AI、淘汰賽、後端與相容載入器。

## 未來快照建議

目前專案已拆成大量 `js/` 模組，僅保存 `index.html`、`styles.css`、`app.js` 已不足以完整回退。

若未來建立新快照，應至少記錄：

- 基準 commit SHA
- Build ID
- 主要新增功能
- CI 結果
- 需要一起還原的模組清單
- 是否包含資料庫 migration 或後端設定

實際程式仍以 Git commit／tag 為主，`versions/` 只作為人工可讀的輔助紀錄。
