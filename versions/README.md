# Historical Snapshots

正式開發與 GitHub Pages 來源永遠是 repository root 的 `main`；`versions/` 只保留少量人工回退快照，不是第二份正式網站。

## 目前保留

- `v77-pixel-card-theme-2026-07-19/` — 最新保留的歷史穩定快照

## 已精簡

`v75-smaller-table-2026-07-18` 與 `v76-ux-readability-tuning-2026-07-18` 已從目前工作樹移除，避免三份近似完整網站長期重複佔用 repository。若真的需要，仍可從 Git history 找回。

## 原則

- 不在 `versions/` 做新功能。
- 不從歷史快照覆蓋目前 `main`。
- 至少保留一個最近且已知穩定的人工快照；其餘版本依 Git history 回溯。
