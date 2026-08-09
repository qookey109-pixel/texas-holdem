# 淘汰賽經濟 G1 早期可玩試驗

> **Historical / superseded.** 這是 G1 在隔離試驗階段的研究紀錄，不是目前正式參數來源。現行規格請看 `PROJECT_STATUS.md`、`README.md` 與 `js/replacement-stack-balance.js`。目前 Special / Gemini 等 role ranges 已高於本文件的早期 25～70BB 設計。

## 研究目的

研究 PR #89 最初直接讀取 `js/tournament-mode.js` 的底層 16 位名單，但正式執行還會追加 Vlad、Oracle、Chronos，因此實際玩法是 19 位 AI、13 位 replacement roles：

```text
中階 6
＋高階 4
＋特殊 Boss 2
＋Gemini 1
＝13 位補位角色
```

舊 F1 只模擬 10 位補位，低估後段籌碼注入，因此當時建立 G1 試驗修正研究模型。

## 當時的 G1 試驗參數

以下數字只代表**當時隔離試驗**，已被後續正式平衡取代：

| 階級 | min | target | max |
|---|---:|---:|---:|
| 中階 | 25BB | 35BB | 45BB |
| 高階 | 30BB | 40BB | 50BB |
| 特殊 Boss | 35BB | 45BB | 60BB |
| Gemini | 40BB | 50BB | 70BB |

當時理論最大累積 replacement depth：

```text
6 × 45
＋4 × 50
＋2 × 60
＋1 × 70
＝660 entry-BB
```

動態公式概念：

```text
full_table_target_bb = 170
blend_response = 0.15

raw_entry_bb
= role_target_entry_bb
+ 0.15 × (table_gap_bb - role_target_entry_bb)

actual_entry_bb
= clamp(raw_entry_bb, role_min_entry_bb, role_max_entry_bb)
```

這個研究原則後來保留，但 role ranges 已重新校準；不要把上表複製到正式設定。

## 當時的盲注研究

試驗採用逐段提高的 tournament blind table，避免第 85 手後永久停在 16,000。這項研究用來驗證「後段仍需繼續升盲」的方向；目前正式盲注表仍以程式碼與 regression tests 為準。

## 當時的模擬結果

使用 19 位結構、5 組固定種子、100,000 條合成淘汰路徑，早期 G1 相較 F1 顯著降低後段過深桌面：

| 指標 | 早期 G1 |
|---|---:|
| 單挑桌面 BB p5／p50／p95 | 26.1／58.6／130.5 |
| 落在 20～150BB | 95.9% |
| 低於 20BB | 2.2% |
| 高於 200BB | 0.1% |
| Gemini 進場中位數／p95 | 47.5／55.5BB |
| 累積 entry-BB p95 | 584.9／660 |

舊 F1 在同一 19 位路徑下只有 58.0% 單挑落在 20～150BB，29.3% 高於 200BB。這是當時改採 G1 研究方向的理由。

## 歷史價值與現行界線

這份文件保留的是：

- 為什麼 replacement 模擬必須使用完整 19 位角色結構。
- 為什麼同一手多位淘汰要依序把前一位 replacement 籌碼計入 running table chips。
- 為什麼不能讓後段盲注永久封頂。
- 為什麼 replacement 公式不應使用玩家隱藏資訊或預定勝負結果。

它**不再定義**：

- 現行 role min / target / max。
- 現行一般模式 replacement。
- 現行 Special / Gemini 最終進場深度。

目前正式 G1 ranges 與一般模式 median-v2 請以 `js/replacement-stack-balance.js` 以及 `tests/e2e/tournament-economy-g1.spec.js` 為準。
