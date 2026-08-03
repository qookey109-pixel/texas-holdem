# 德州撲克網頁遊戲

純 HTML、CSS、JavaScript 製作的德州撲克網頁遊戲，支援一般牌局、19 位永久淘汰賽、公平 Boss、Gemini 後端、牌局覆盤與可調整牌桌介面。

## 線上網站

- 正式網站：`https://qookey109-pixel.github.io/texas-holdem/`
- 診斷頁：`https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`

## 唯一正式來源

GitHub Pages 使用：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/ (root)`

正式程式來源：

- `index.html`
- `styles.css`
- `app.js`
- `js/`

過去的 `docs/` 重複網站副本已移除。請勿重新建立第二套正式網站。

## 正式 Repository 與本機路徑

```text
Repository: qookey109-pixel/texas-holdem
Local: /Users/qoo/Documents/GitHub/texas-holdem
```

不要使用：

```text
qoo109/texas-holdem
/Users/qoo/Desktop/德州
```

## 目前主要功能

### 牌局與介面

- 六人德州撲克牌桌
- 合法下注、加注、All-in、攤牌與籌碼結算
- 新手教學、撲克教練、牌局覆盤與本輪結算
- 牌桌版面編輯與尺寸控制
- 童趣手繪／午夜牌組收藏
- AI 情緒表情、座位發光、BGM 與音效分離控制
- Safari 音訊恢復與公共牌街道轉場效能優化

### AI 難度主線

目前中階與高階 10 位角色載入：

```text
獨立角色策略 V1
→ 多街策略 V1.1
→ 翻牌前位置化範圍 V1.2
→ 分街玩家模型 V1.3
→ 長期安全記憶 V1.4
→ 多人公開範圍與決策 V1.5
→ Oracle／Chronos 公平 Boss
→ Gemini
```

AI 僅可使用：

- 自己的底牌
- 公共牌
- 公開位置
- 公開下注行動與尺寸
- 聚合後的玩家公開統計

AI 不得使用：

- 對手隱藏底牌
- 實際牌堆順序
- 未來公共牌
- 預定勝負答案

### 挑戰賽與雲端

- 19 位永久淘汰賽，Gemini 最後登場
- 分層候補、替換與對稱縮桌
- Google 登入
- Supabase 淘汰賽自動存檔、暫停、恢復與刪除
- AI 公開玩家模型可隨既有淘汰賽存檔安全恢復

## 開始工作前

```bash
git remote -v
git status
git pull --ff-only
```

確認 `origin` 指向：

```text
https://github.com/qookey109-pixel/texas-holdem.git
```

並先閱讀：

- `PROJECT_STATUS.md`
- `AGENTS.md`
- `versions/README.md`
- `build-manifest.json`

任何聊天紀錄、Handoff 或舊 PR 若與最新 GitHub `main` 衝突，以最新 Repository 為準。

## 靜態檢查

```bash
node scripts/validate-static-site.mjs
```

檢查內容包括：

- root 必要檔案是否存在
- HTML、CSS 與動態 JavaScript 引用是否缺檔
- 是否誤用不適合 GitHub Project Pages 的 `/` 絕對路徑
- JavaScript 語法
- Build Manifest 資產路徑

## 瀏覽器 E2E

首次使用：

```bash
npm install
npx playwright install chromium webkit
```

執行回歸測試：

```bash
npm run test:e2e
```

GitHub Actions 的 `Browser E2E` 會分別執行 Chromium 與 WebKit。涉及下注流程、AI、淘汰賽、雲端、街道切換或 UI 互動的修改，兩個瀏覽器都必須通過。

## AI 難度校準 V1.6

只執行 Chromium 校準矩陣：

```bash
npm run test:ai-calibration
```

校準內容包括完整 169 種起手牌類別、1,326 種實際組合權重、位置開池、面對開池與 3-bet、Squeeze，以及固定翻牌後詐唬、價值下注、Bluff Catch 與多人底池情境。

Playwright 報表會附加 JSON 與 Markdown 結果。校準器位於 `tests/support/`，不由正式網站載入，也不直接修改 AI 參數。詳細設計請看 `docs/ai-calibration-v1-6.md`。

## 分支與發布流程

1. 重新核對最新 `main`。
2. 從最新 `main` 建立新分支。
3. 只修改本次需求需要的檔案。
4. 執行靜態檢查與必要 E2E。
5. 建立 Pull Request。
6. 確認 PR head 未變且分支沒有落後。
7. 確認 Static、Chromium、WebKit 全綠。
8. 合併後重新核對正式 `main`。
9. 正式網站更新後強制重新整理，檢查 Console、Network、診斷頁與核心流程。

## 過時 PR 注意事項

- PR #32 與 PR #46 已被後續正式架構取代，不得直接合併。
- PR #9 的無障礙功能仍可重新評估，但必須從最新 `main` 重新移植與測試。

詳細狀態、已知風險與下一步請看 `PROJECT_STATUS.md`。
