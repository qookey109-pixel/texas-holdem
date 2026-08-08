# Documentation Index

`README.md` 與 `PROJECT_STATUS.md` 是主要入口；`docs/` 不再當第二套專案狀態系統。

## 現行 / 維運文件

- `ai-long-run-telemetry-v2-9.md` — V2.9 長跑 telemetry
- `ai-opening-balance-v2-9-5.md` — V2.9.5 opening / WTSD 修正
- `ai-v2-9-2-evidence-calibration.md` — V2.9.2 runtime evidence
- `economy-fold-defense-v1.md` — 一般模式 economy / fold defense
- `poker-economy-ooda-v1.md` — economy OODA 驗證
- `poker-state-stress-v1.md` — 牌局狀態壓力測試
- `production-backend-smoke.md` — 正式後端 smoke
- `auth-entry-v2.md` — 登入入口

## 保留的較舊技術設計

較舊 AI 文件仍可作架構背景參考，但不代表最新參數。現行參數以 `PROJECT_STATUS.md`、`main` 程式與測試為準。

## 文件瘦身政策

- 同一功能不要同時保留「設計稿 + acceptance + post-fix + release note」四份近似文件。
- 可由自動測試直接證明的驗收結果，以測試與 PR 紀錄為主。
- 被新版本完全取代的短期 QA / trial / acceptance 文件可從工作樹移除；Git history 仍可追溯。
- 不新增 `docs/` 網站副本。
