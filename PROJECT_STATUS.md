# Texas Hold'em — Current Project Status

> 更新：2026-08-11（Asia/Taipei）
> 正式 Repository：`qookey109-pixel/texas-holdem`
> 正式發布：`main` / repository root / GitHub Pages

## 目前基準

- 目前正式 `main`：`5507f28ee6139bf9946f340bc47aab5aaede809c`（PR #196）。
- 2026-08-11 本次狀態更新時沒有 open PR；每次開始工作仍須重新讀取最新 `main`、open PR 與 CI，不可把這個 SHA 永久當成最新基準。
- 核心牌局、下注、攤牌、教學、設定、版面、登入入口、挑戰賽與後端整合均維持在既有架構內。
- 公平 Boss 保護維持啟用；Oracle / Chronos 不應取得未公開底牌、未發公共牌或未來牌序。
- Gemini 仍走後端整合，不把服務端金鑰放進前端。

## AI 現況

目前正式 AI 主線已到 V2.9.5：

- V2.9 telemetry / 長跑驗證框架
- V2.9.2 runtime evidence calibration
- V2.9.3 middle / elite preflop recovery
- V2.9.4 opening balance telemetry integrity
- V2.9.5 opening balance + WTSD discipline/recovery

舊版 V1.x～V2.8（包含 V2.7）的文件只作歷史設計參考；正式行為以 `main` 的程式、測試與最新 V2.9.x 文件為準。

`build-manifest.json` 保留 V2.7 核心與校準的歷史真實名稱，同時把目前策略鏈標示為 V2.9.5，並列入 V2.8、V2.9.2～V2.9.5、economy fold defense、provider、observation memory 與最新 dispatcher 等實際 runtime 模組。

Production Smoke 現在同時守住兩層真相：V2.7 是仍存在的核心 runtime；目前正式外層必須能追到 V2.9.5，且 action dispatcher 必須在 loader 最後載入。線上 smoke 會直接抓正式 loader 與 manifest 驗證，不再把 `js/config.js` 的舊 cache query 當成目前 AI 版本。

## 籌碼經濟

### Normal Economy

現行一般模式補位為 median-v2：

```text
min(
  正籌碼牌桌中位數 × 80%,
  當前完整買入 × 75%,
  60BB
)
```

並保留 12BB soft floor，但不把補位硬抬到高於桌面中位數。玩家與 AI 共用同一補位原則。

### Challenge Tournament G1

PR #158 已把後進角色補位提高，避免新角色一進桌就被迫短碼生存：

| Tier | Min | Target | Max |
| --- | ---: | ---: | ---: |
| Middle | 80BB | 90BB | 100BB |
| Elite | 90BB | 105BB | 120BB |
| Special | 100BB | 115BB | 135BB |
| Gemini | 110BB | 130BB | 150BB |

- full-table target：170BB
- blend response：0.15
- theoretical replacement ceiling：1500BB

這套 G1 與一般模式 economy 分開，不應互相覆蓋。

## 近期 UI / Reliability 收尾

2026-08-11 已完成下列低風險收尾，均未改動 AI V2.9.5 或籌碼經濟：

- PR #191：版面編輯器加入右上角 `×` 直接完成編輯。
- PR #192：玩家 UI 暫時隱藏 Long Session 入口，但保留底層模式與 API。
- PR #193：版面編輯器次要工具收進「更多工具」，保留既有能力。
- PR #194：快捷下注 selected / `aria-pressed`、reduced-motion 與 UI 動畫 / accessibility polish。
- PR #195：加固分離式 Audio mute fallback；`audio-recovery.js` 載入失敗時 replacement SFX 仍能正確靜音與 cleanup。
- PR #196：只調整 Playwright regression，消除 quick-bet accessibility 測試受真實牌局重繪影響的 flaky；沒有產品行為變更。

上述節點完成後，不應再為相同問題重做新實作；後續若有回歸，先以 CI log / artifact / diff 證據定位根因。

## 測試基準

目前正式 `main`（`5507f28ee6139bf9946f340bc47aab5aaede809c`）已確認：

- Static site check：PASS
- Browser E2E / Chromium full：PASS
- Browser E2E / WebKit full：PASS
- Production smoke：PASS
- GitHub Pages deployment：PASS
- Production smoke 的 local production contracts、Pages propagation 與 non-destructive live smoke：PASS
- PR #158 對 G1 80BB floor 有專用 regression test
- Poker state stress：正式排程為**每週日 03:30（台灣時間）**，不是每日長跑

`validate-manifest-runtime.mjs` 由 `npm run validate` 自動比對正式 AI loader 與 manifest；Production Smoke 則進一步驗證本機契約與正式 Pages 上的 loader / manifest 確實同時包含 V2.7 core、V2.9.5 runtime 與最後 dispatcher。

任何後續變更仍須重新通過 Static + Browser E2E；合併後還必須確認 Production Smoke 與 Pages deployment 為綠色，才算正式驗收完成。

## 文件規則

正式閱讀順序：

1. `README.md` — 專案介紹、玩法與操作
2. `PROJECT_STATUS.md` — **唯一目前狀態頁**
3. `docs/README.md` — 技術文件索引
4. `AGENTS.md` — 維護與驗證規則
5. `versions/README.md` — 歷史快照政策

避免再建立第二份「目前狀態」、聊天 Handoff 複本或每次小調整都新增一份 acceptance 文件。可由測試證明的結果，優先留在測試與 PR 紀錄。

## 目前已知風險 / 待辦

- `archive/chat-imports/` 是 2026-07-29 的一次性復原資料。目前先保留在 archive，避免把歷史復原證據和一般文件整理混成破壞性變更。
- `.github/ai-long-run-*-triggers/` 是 Actions 觸發檔，不是一般文件；不要為了「看起來乾淨」直接刪除。
