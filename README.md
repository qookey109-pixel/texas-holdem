# 德州撲克網頁遊戲

純 HTML、CSS、JavaScript 製作的 Texas Hold'em 網頁遊戲，支援一般牌局、19 位永久淘汰賽、公平 Boss、Gemini 後端、牌局覆盤、雲端存檔、可調整牌桌介面與桌機鍵盤無障礙。

## 正式來源

- 正式網站：`https://qookey109-pixel.github.io/texas-holdem/`
- 診斷頁：`https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`
- Repository：`qookey109-pixel/texas-holdem`
- 發布來源：`main` / repository root / GitHub Pages
- 正式本機工作副本：`/Users/qoo/Documents/GitHub/texas-holdem`

不要使用舊 Repository `qoo109/texas-holdem` 或舊資料夾 `/Users/qoo/Desktop/德州` 作為新版修改來源。

## 功能概覽

- 六人 No-limit Texas Hold'em，包含合法下注、加注、All-in、主池／邊池、攤牌與籌碼結算。
- 一般模式與 19 位永久淘汰賽；Gemini 為最終 Boss。
- AI 目前正式 runtime 為 **V2.9.5**，保留 V2.7 相容核心並疊加後續校準、Opening Balance、WTSD 與 dispatcher。
- Oracle、Chronos 使用公開資訊、公平 Equity 與條件化對手範圍。
- Gemini 走安全後端，並保留本地備援。
- Google 登入、Supabase 淘汰賽雲端存檔、暫停、恢復與刪除。
- 撲克教練、牌局覆盤、新手教學、本輪結算。
- 官方預設版面、版面編輯、牌組收藏、AI 表情、BGM／音效控制。
- Chromium 與 WebKit E2E、AI 校準、長跑 telemetry、籌碼經濟驗證與牌局狀態壓力測試。

目前 AI、G1 補位、籌碼經濟、測試基準與已知風險等會變動的數值，**只以 `PROJECT_STATUS.md` 為準**；README 不再複製一份容易過期的參數表。

## 公平與安全原則

AI 只可使用自己的底牌、公共牌、公開位置、公開下注行動、可見籌碼與聚合後的玩家統計。

不得讀取：

- 對手隱藏底牌
- 實際牌堆順序
- 未發出的公共牌
- 未來勝負答案

Oracle、Chronos 與 Gemini 同樣受這個公平邊界約束。Gemini 服務端金鑰不得放進前端。

Supabase 淘汰賽存檔使用 RLS 隔離；存檔不得包含底牌、牌堆、未來公共牌或完整逐步牌局紀錄。

## 文件入口

正式閱讀順序：

1. `README.md` — 穩定的專案介紹、操作與驗證入口
2. `PROJECT_STATUS.md` — **唯一目前狀態頁**
3. `docs/README.md` — 技術文件索引
4. `AGENTS.md` — 維護與驗證規則
5. `versions/README.md` — 歷史快照政策

不要另外建立第二份目前狀態、聊天 Handoff 複本或每次小改動都新增 acceptance / release-note 文件。可由自動測試證明的結果，以測試、PR 與 Actions 紀錄為主。

## 開始工作前

```bash
git remote -v
git status
git pull --ff-only
```

並重新核對：

- 最新 `main` SHA
- 目前 open PR
- GitHub Actions 狀態
- `PROJECT_STATUS.md`

任何聊天紀錄、Handoff 或舊 PR 若與最新 GitHub `main` 衝突，以最新 Repository 為準。

## 驗證

### 靜態與部署契約

```bash
npm run validate
npm run validate:deployment
npm run validate:production-contract
```

`npm run validate` 會檢查正式資產、Build Manifest、AI runtime loader 對應、部署契約、Supabase RLS migration 與正式後端契約。

### Browser E2E

```bash
npm install
npx playwright install chromium webkit
npm run test:e2e
```

GitHub Actions 會分別執行 Chromium 與 WebKit。

### AI 校準與長跑

```bash
npm run test:ai-calibration
npm run test:ai-long-run:smoke
```

正式長跑與 Aggregate 依 GitHub Actions 規則執行；不要因單一 runner、browser install 或 artifact 上傳錯誤重跑已成功的 shard。

### 籌碼經濟與牌局狀態

```bash
npm run test:economy-ooda:smoke
npm run test:state-stress
npm run test:state-stress:100
```

Poker State Stress 正式排程為**每週日台北時間約 03:30**。

### 正式環境 Smoke

```bash
npm run test:production-smoke
```

Production Smoke 會以零寫入方式驗證：

- GitHub Pages 正式版本
- AI V2.7 相容核心與目前 V2.9.5 runtime
- Supabase Auth 與 Google Provider
- 未登入玩家不可讀取淘汰賽存檔
- Gemini Worker `/health` 與 Secret 設定

它會在每次 `main` 部署後及**每週日台北時間約 03:10**執行。Google 真人 OAuth 仍依 `docs/production-backend-smoke.md` 使用專用測試帳號人工驗證。

## 分支與發布流程

1. 重新核對最新 `main`。
2. 從最新 `main` 建立新分支。
3. 只修改本次需求需要的檔案。
4. 執行 `npm run validate` 與必要 E2E／AI／State Stress。
5. 建立 Pull Request。
6. 確認 PR head 未變且沒有落後。
7. 必要 CI 全綠後才合併。
8. 合併後重新核對正式 `main`、GitHub Pages、Production Smoke 與診斷頁。

詳細現況、目前參數、最新測試基準與下一步請看 `PROJECT_STATUS.md`。
