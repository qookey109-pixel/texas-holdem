# Documentation Index

`README.md` 與 `PROJECT_STATUS.md` 是主要入口；`docs/` 不建立第二套專案狀態系統。

## Canonical hierarchy

遇到版本／參數衝突時，依序核對：

1. `main` 的實際程式與 regression tests。
2. `PROJECT_STATUS.md` 的現行狀態。
3. `README.md` 的高層摘要與啟動方式。
4. 本索引列出的 current maintenance documents。
5. historical / research documents 僅用來理解設計背景。

任何舊文件都不得單獨覆蓋較新的程式、測試與正式狀態證據。

## 現行 / 維運文件

- `ai-long-run-telemetry-v2-9.md` — V2.9 長跑 telemetry 與驗證邏輯。
- `ai-opening-balance-v2-9-5.md` — V2.9.5 opening / WTSD 修正。
- `ai-v2-9-2-evidence-calibration.md` — V2.9.2 runtime evidence / calibration 背景。
- `economy-fold-defense-v1.md` — 現行一般模式 median-v2 接線、fold defense 與 Boss catch-up 邊界。
- `poker-economy-ooda-v1.md` — economy OODA 驗證。
- `poker-state-stress-v1.md` — 牌局狀態壓力測試。
- `production-backend-smoke.md` — 正式站與後端 smoke contract。
- `auth-entry-v2.md` — 登入入口與相關安全邊界。

## 保留的較舊技術設計

V1.x～V2.8 的 AI board / range / memory / tier 等文件保留作架構背景，但**不代表最新參數**。現行 AI 外層 runtime 是 V2.9.5；V2.7 核心／校準 lineage 仍正式保留，因此不要批次重命名歷史模組。

## Research / superseded history

- `research/tournament-economy-g1-playtest.md` — G1 早期隔離試驗；保留 19 位角色與後段經濟研究理由，**舊 25～70BB ranges 已 superseded**。現行 G1 參數以 `js/replacement-stack-balance.js`、`PROJECT_STATUS.md` 與 regression tests 為準。

Research 文件應清楚標記 historical / superseded，不因版本舊就刪除有價值的決策背景。

## 文件瘦身政策

- 同一功能不要同時保留「設計稿 + acceptance + post-fix + release note」多份近似文件。
- 可由自動測試直接證明的驗收結果，以測試與 PR / Actions 紀錄為主。
- 已被新版完整吸收、且沒有額外歷史價值的短期 QA / trial / acceptance 文件才可列為刪除候選。
- ADR 或具有 why / trade-off 價值的歷史決策應保留；被取代時標記 superseded。
- 不新增 `docs/` 網站副本。
