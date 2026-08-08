# Texas Hold'em — Current Project Status

> 更新：2026-08-09（Asia/Taipei）
> 正式 Repository：`qookey109-pixel/texas-holdem`
> 正式發布：`main` / repository root / GitHub Pages

## 目前基準

- 整理前正式基準：`d0a832b31813ca114d67209ec2a5850f8a326d77`（PR #158）
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

舊版 V1.x～V2.8 的文件只作歷史設計參考；正式行為以 `main` 的程式、測試與最新 V2.9.x 文件為準。

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

最新 PR #158 已把後進角色補位提高，避免新角色一進桌就被迫短碼生存：

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

## 測試基準

整理前最新 `main` 已確認：

- Static site check：PASS
- Browser E2E / Chromium：PASS
- Browser E2E / WebKit：PASS
- PR #158 對 G1 80BB floor 有專用 regression test

整理文件後仍必須重新跑 Static + Browser E2E；未通過前不得合併回 `main`。

## 文件規則

正式閱讀順序：

1. `README.md` — 專案介紹、玩法與操作
2. `PROJECT_STATUS.md` — **唯一目前狀態頁**
3. `docs/README.md` — 技術文件索引
4. `AGENTS.md` — 維護與驗證規則
5. `versions/README.md` — 歷史快照政策

避免再建立第二份「目前狀態」、聊天 Handoff 複本或每次小調整都新增一份 acceptance 文件。可由測試證明的結果，優先留在測試與 PR 紀錄。

## 目前已知風險 / 待辦

- `build-manifest.json` 的 diagnostics feature 命名仍帶有較早的 V2.7 語意；目前驗證是綠的，但後續若要讓診斷頁完整反映 V2.9.5，可另開小 PR 更新 manifest，不應混在本次文件瘦身裡。
- `archive/chat-imports/` 是 2026-07-29 的一次性復原資料。本次先保留在 archive，避免把歷史復原證據和文件整理混成同一個破壞性變更。
- `.github/ai-long-run-*-triggers/` 是 Actions 觸發檔，不是一般文件；不要為了「看起來乾淨」直接刪除。
