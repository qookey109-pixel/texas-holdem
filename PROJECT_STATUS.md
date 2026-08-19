# Texas Hold'em — Current Project Status

> 更新：2026-08-19（Asia/Taipei）
> 正式 Repository：`qookey109-pixel/texas-holdem`
> 正式發布：`main` / repository root / GitHub Pages

## Authority 規則

- 本頁記錄的是「最後一次完整核對的狀態」，不是永久固定 SHA。
- 每次開始工作仍須重新讀取最新 `main`、open PR、Issue、CI 與正式站狀態；若本頁與 Repository 最新狀態衝突，以 Repository 為準。
- 2026-08-19 本頁刷新時，最後已確認合併節點為 PR #220，merge commit：`368b6d2de4f5ae230a7f06c8032f57e9da9b2743`。
- 不要從舊聊天、舊 Handoff、`versions/` 或 `archive/` 反向覆蓋最新 `main`。

## 目前正式主線

核心網站仍維持 vanilla HTML / CSS / JavaScript、無 build step 的 GitHub Pages 架構。

目前正式能力包含：

- 核心牌局、下注、攤牌、教學、設定、桌面 / 手機版面。
- Google 登入與 Supabase tournament cloud save。
- Gemini 後端整合；服務端 API key 不放前端。
- 公平 Boss 保護：Oracle / Chronos / Gemini 不應取得未公開底牌、未發公共牌或未來牌序。
- AI 正式策略主線：V2.9.5；V2.7 仍保留為 core / calibration lineage。
- Normal Economy replacement stack：median-v2。
- Challenge Tournament Economy：G1，與 Normal Economy 分離。

## 2026-08-19 最新 UI / Reliability 節點

### PR #219

官方 Layout V4 preset / migration 行為已進入 `main`。

### PR #220 — 已合併

修正冷啟動時 Hero 手牌位置與按下「官方預設」後不一致的問題。

已確認根因：舊 `LayoutReadabilityTrial 1.1.0` 在 Layout V4 套用後又把 `heroCards` 上移約 14px，造成 final rendered geometry 與官方 preset authority 不一致。

PR #220：

- 讓 Layout V4 成為桌面位置 final authority。
- readability trial 只保留 readability styling，不再改 Hero-card 座標。
- 更新整套 layout boot cache generation。
- 新增 cold boot vs official reset 的 rendered-geometry regression。
- PR 合併前 Static site check、Poker state stress、Chromium full E2E、WebKit critical E2E 全部 PASS。
- 沒有修改 AI V2.9.5、Normal Economy、G1、Gemini decision policy、betting core、chip economy 或 Long Session promotion/default。

## AI 現況

正式 AI 主線仍為 V2.9.5：

- V2.9 telemetry / long-run validation framework
- V2.9.2 runtime evidence calibration
- V2.9.3 middle / elite preflop recovery
- V2.9.4 opening balance telemetry integrity
- V2.9.5 opening balance + WTSD discipline/recovery

V1.x～V2.8 文件主要作歷史設計與 lineage 參考；正式 runtime 行為以最新 `main`、AI loader、dispatcher、tests 與最新 V2.9.x 證據為準。

`build-manifest.json` 仍保留 V2.7 core / calibration lineage，同時要求正式 loader 能追到 V2.9.5，且 current action dispatcher 在 runtime chain 最後載入。

## 籌碼經濟

### Normal Economy

現行 replacement stack 為 median-v2：

```text
min(
  正籌碼牌桌中位數 × 80%,
  當前完整買入 × 75%,
  60BB
)
```

保留 12BB soft floor，但不把補位硬抬到高於桌面中位數。玩家與 AI 共用同一原則。

### Challenge Tournament G1

| Tier | Min | Target | Max |
| --- | ---: | ---: | ---: |
| Middle | 80BB | 90BB | 100BB |
| Elite | 90BB | 105BB | 120BB |
| Special | 100BB | 115BB | 135BB |
| Gemini | 110BB | 130BB | 150BB |

- full-table target：170BB
- blend response：0.15
- theoretical replacement ceiling：1500BB

G1 與 Normal Economy 分開，不應互相覆蓋。

## Long Session

- Issue #183 仍是 Long Session 設計 / evidence 主 authority。
- Long Session 不得因 repository health / UI cleanup 被順手改成正式 default。
- PR #210 屬於既有 Gate evidence 線；在重新確認最新 base、diff、CI 與 evidence 前，不應直接以舊狀態合併。
- Normal Economy 仍是正式預設；Long Session production promotion 必須走獨立證據與授權。

## Repository Health Audit — 2026-08-19

本次完整掃描確認專案整體測試覆蓋已相當完整，但仍有幾個基礎可靠性改善點：

- PR #221（目前獨立 Draft）：新增正式 GitHub Pages 關鍵 runtime 檔案 SHA-256 parity check，以及 OCI Gemini Python syntax CI；不改 gameplay/runtime policy。
- Issue #222：集中追蹤後續 project-health 改善，避免散成聊天待辦。
- `js/events-boot.js` 的動態 script loader 目前在 `error` 時仍會 resolve，可能造成 critical module 靜默失敗後繼續 boot；應另開 focused PR 處理。
- `diagnostics.html` 目前會同時抓 Manifest 全部 asset，並把 response 完整讀成 text；對 MP4 等 binary 資產不必要，應改 bounded concurrency + HEAD / range 型檢查。
- Supabase browser client 使用浮動 `@supabase/supabase-js@2/+esm`；後續應 pin 到已完整驗證版本。
- OCI Python requirements 目前未鎖精確版本；後續應記錄 / pin 已部署且驗證過的 dependency set。
- cache query labels 仍分散在多個 loader；後續應收斂成單一 cache / release authority，而不是全面改寫架構。

## 測試基準

必要驗證仍維持：

- Static site check
- Browser E2E / Chromium
- Browser E2E / WebKit
- Poker state stress
- Production Smoke
- GitHub Pages deployment
- AI / economy / state-specific regressions when affected

Poker state stress 正式排程仍為**每週日 03:30（台灣時間）**，不是每日長跑。

任何產品 runtime 變更在 PR 階段至少要通過對應 Static + Browser / domain-specific checks；合併後仍須確認 Production Smoke 與 Pages deployment，才算正式驗收完成。

## 架構決策

目前不建議為了「整理」改寫成 React / Vite 或其他全新 framework。

建議維持 no-build static architecture，依序做低風險增量改善：

1. deployment identity / parity gate
2. critical vs optional boot-loader contract
3. dependency pinning
4. diagnostics network hygiene
5. cache-generation authority 收斂
6. 有證據再做局部模組化

優點是可延續現有大量 E2E 與已驗證成果；缺點是 globals / layered CSS 的歷史負擔會逐步而不是一次消失。現階段這個取捨比全面重寫安全。

## 文件規則

正式閱讀順序：

1. `README.md` — 專案介紹、玩法與操作
2. `PROJECT_STATUS.md` — 目前狀態頁，但仍須即時核對 Repository
3. `docs/README.md` — 技術文件索引
4. `AGENTS.md` — 維護與驗證規則
5. `versions/README.md` — 歷史快照政策

不要再建立第二份「目前狀態」文件。可由 CI / tests / PR 證明的結果，優先保留在對應 evidence，而不是複製大量 acceptance 文件。

## 保留 / 禁止誤刪

- `archive/chat-imports/`：歷史復原 evidence，未完成 provenance review 前保留。
- `versions/`：歷史 snapshot policy 範圍，不能因為「看起來重複」直接刪除。
- `.github/ai-long-run-*-triggers/`：Actions 觸發檔，不是一般文件。
- 任何 Long Session evidence / deterministic seed / artifact lineage，不得在一般 cleanup 中破壞。
