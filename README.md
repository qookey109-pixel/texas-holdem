# 德州撲克網頁遊戲

純 HTML、CSS、JavaScript 製作的 No-limit Texas Hold'em 網頁遊戲。正式網站由 repository root 的 `main` 直接發布到 GitHub Pages；不要建立第二份網站副本。

## 正式入口

- 網站：`https://qookey109-pixel.github.io/texas-holdem/`
- 診斷頁：`https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`
- Pages：`main` / `/ (root)`
- 主入口：`index.html`
- 核心前端：`app.js`、`js/`、`styles.css` 與入口明確載入的附加 CSS

## 目前版本與狀態

這個 repository 沒有用單一 SemVer 代表整個遊戲版本：

- `package.json` 的 `1.0.0` 是 npm package metadata，不是遊戲功能版本。
- 目前正式 AI 外層 runtime 是 **V2.9.5**。
- **V2.7** 仍是正式保留的核心／校準 lineage；V2.9.5 是其後續外層策略與 opening balance 演進，不應把歷史 V2.7 檔名批次改名。
- `versions/v77-pixel-card-theme-2026-07-19/` 是人工歷史回退快照，不是目前正式網站來源。

每次開始維護仍應先重新讀取 `main` HEAD、PR 與 Actions，不要把 README 中的 commit 當永久 baseline。

## Canonical documents

重要資訊只使用下列來源：

1. `README.md` — 專案入口、啟動與高層現況。
2. `PROJECT_STATUS.md` — 目前正式系統狀態、已完成工作與維護風險。
3. `docs/README.md` — 技術文件索引；區分 current docs 與 historical architecture。
4. `AGENTS.md` — 工程與驗證規則。
5. `versions/README.md` — 歷史快照政策。

舊 AI 文件可保留作架構歷史，但不得拿來覆蓋 `PROJECT_STATUS.md` 或目前程式／測試的正式參數。

## 架構

前端是無 build step 的靜態網站：

```text
index.html
├─ styles.css + 少量明確載入的修正 CSS
├─ app.js
└─ js/
   ├─ 牌局、下注、結算、渲染、教學、音效
   ├─ AI runtime / calibration / public-memory layers
   ├─ 挑戰賽與籌碼經濟
   ├─ Google / Supabase 登入與雲端存檔
   └─ Gemini backend client + 本地 fallback
```

後端只有 Gemini provider 與 Supabase 所需部分：

- `backend/gemini-worker/` — Cloudflare Worker 實作。
- `backend/oci-gemini-function/` — 相同 API contract 的 OCI Functions 實作。
- `supabase/migrations/` — tournament save schema / RLS migrations。

兩套 Gemini backend 是替代部署方式，不是重複程式；前端只依賴共同的 `/health` 與 `/v1/decision` contract。API Key 不得放入前端或 GitHub。

## 已完成的主要能力

- 6 人 No-limit Hold'em：下注、加注、All-in、side pot、showdown 與重新開局。
- 一般模式與 19 位永久淘汰挑戰賽。
- AI 角色分層、公開資訊 range / board / EV / multiway 決策與 V2.9.5 opening balance。
- Oracle / Chronos 公平 Boss；不得讀取對手隱藏底牌、實際牌堆順序或未來公共牌。
- Gemini 最終 Boss 後端整合；失敗時回退本地 AI。
- Poker Coach、教學、牌局紀錄／結算、牌桌版面調整、桌機鍵盤操作。
- Google / Supabase 身分與淘汰賽雲端存檔。
- Chromium / WebKit Playwright E2E、Static validation、Production smoke、AI calibration、state stress、long-run telemetry 與 economy OODA 驗證鏈。

## 目前籌碼經濟

### 一般模式 replacement — median-v2

一般模式以正籌碼桌面中位數為基準：

```text
min(
  positive-stack table median × 80%,
  current full buy-in × 75%,
  60BB
)
```

並使用 `12BB` soft floor；結果不會高於當前桌面中位數。正式實作來源是 `js/replacement-stack-balance.js`。

### 挑戰賽 G1 replacement

目前 role min / target / max：

| Tier | min | target | max |
|---|---:|---:|---:|
| Middle | 80BB | 90BB | 100BB |
| Elite | 90BB | 105BB | 120BB |
| Special Boss | 100BB | 115BB | 135BB |
| Gemini | 110BB | 130BB | 150BB |

其他現行參數：

- full-table target：`170BB`
- blend response：`0.15`
- 13 位 replacement 的理論角色上限合計：`1500 entry-BB`

`docs/research/tournament-economy-g1-playtest.md` 保留的是較早隔離試驗，不是現行參數來源。

## 本機啟動與驗證

需要 Node.js `>=22`。CI 目前使用 Node 24。

安裝鎖定測試相依：

```bash
npm ci
```

本機靜態伺服器：

```bash
node scripts/serve-static.mjs
```

Playwright 預設使用 `http://127.0.0.1:4173`；`package.json` 沒有 `start` script。

### Repository 現有 commands

```bash
npm run validate
npm run validate:deployment
npm run validate:production-contract
npm run test:e2e
npm run test:e2e:headed
```

另有 AI calibration、long-run telemetry、economy OODA、production smoke 與 poker state stress 等專用 scripts；以 `package.json` 為準。

目前 root **沒有**獨立的 `lint`、`typecheck`、`unit test`、`integration test` 或 `build` script。不要把不存在的 command 記成 PASS；靜態網站直接由 root 發布，而整合／遊戲行為主要由 Playwright E2E 覆蓋。

Browser E2E：

```bash
npx playwright install --with-deps chromium webkit
npx playwright test --project=chromium
npx playwright test --project=webkit
```

PR 上 Chromium 跑全套；WebKit 跑關鍵 regression pack。合併到 `main` 後 Chromium 與 WebKit 都跑全套。

## 自動驗證與排程

- `Static site check`：push / PR。
- `Browser E2E`：push / PR。
- `Production smoke`：驗證正式站、backend 與 deployment contract。
- `Poker state stress`：正式排程為**每週日台灣時間 03:30**，不是每日。
- AI long-run telemetry / calibration / economy workflows 依各 workflow 定義執行。

若只有 runner、瀏覽器安裝、artifact upload 或其他環境性錯誤，只重跑失敗 job；不要重跑已成功部分。若是行為測試失敗，先讀 log／artifact／diff 找 root cause，再做最小修正。

## 文件與歷史政策

- `docs/` 是技術文件，不是第二份網站。
- ADR／有價值的架構歷史不要因為舊就刪；被取代時應標記 historical / superseded。
- 自動測試結果留在 Actions / PR，不建立大量重複 acceptance、audit、post-fix、release-note 文件。
- `archive/chat-imports/` 是一次性 recovery evidence；除非另有明確遷移計畫，不為了視覺整齊而刪。
- `.github/ai-long-run-*-triggers/` 是 Actions trigger files，不是文件垃圾。

更細的正式狀態請讀 `PROJECT_STATUS.md`；技術主題索引請讀 `docs/README.md`。
