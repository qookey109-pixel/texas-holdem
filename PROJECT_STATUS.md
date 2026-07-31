# 德州撲克專案狀態

## 專案資訊

- Repository: `qookey109-pixel/texas-holdem`
- 線上網站: `https://qookey109-pixel.github.io/texas-holdem/`
- 線上診斷: `https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`
- 正式分支: `main`
- 唯一正式開發與發布來源: Repository root
- GitHub Pages 發布來源: `Deploy from a branch / main / (root)`
- Pages 設定確認: 使用者已於 2026-07-22 在 `Settings → Pages` 完成確認

## 正式維護範圍

所有功能修改只在以下位置完成：

- `index.html`
- `styles.css`
- `app.js`
- `js/`

過去的 `docs/` 重複網站副本已於 2026-07-22 移除。需要時可從 Git history 還原，但不得重新建立第二套正式網站。

## 目前已完成

- AI 每次反應最多只顯示一個情緒表情，固定浮在頭像上方。
- AI 表情可浮在頭像框外，且不會被下一位玩家的座位發光框或手牌區遮住；使用者已於 2026-07-23 確認正常。
- AI 思考進度條已移除，改用座位發光表示思考與行動。
- 已修正 AI 行動提示藍光／黃光瞬間跳動。
- AI 連續行動間的額外空白已調整為 `80–100ms`，不影響角色原本的思考時間。
- 收藏牌組精簡為 `童趣手繪牌組` 與 `午夜牌組`。
- 版面編輯器、新手教學、本輪結算均已保留。
- 版面編輯開啟時，右側欄只顯示完整編輯器；撲克教練與牌局紀錄暫時隱藏，完成編輯後自動恢復。
- 已建立 `scripts/validate-static-site.mjs` 靜態網站檢查器。
- 已建立 `Static site check` GitHub Actions，自動檢查 root 缺檔、路徑與 JavaScript 語法。
- `Static site check` 已由使用者確認多次通過。
- 線上診斷頁已由使用者確認全部通過。
- 新牌局、AI 表情、音效/BGM、編輯版面、牌組收藏、新手教學與本輪結算已完成手動驗證。
- Safari Console 與 Network 已由使用者確認沒有紅色 JavaScript error 或 404。
- GitHub Pages 已設定並驗證使用 `main / (root)`。
- `docs/` 歷史副本已移除，專案完成單一網站來源整理。
- 已建立 Playwright Chromium 最小瀏覽器 E2E 測試與 `Browser E2E` GitHub Actions workflow。
- `Browser E2E` 第一次 GitHub Actions執行已由使用者於 2026-07-22 確認通過。
- 版面編輯器不受牌局紀錄遮擋、五個大小調整滑桿可操作、關閉後側欄恢復，均已納入 E2E。
- 玩家加注與 All-in 的籌碼變化、牌局紀錄及執行階段錯誤檢查已納入 E2E，並由使用者於 2026-07-22 確認通過。
- 固定牌面攤牌 E2E 已驗證五張公共牌、順子勝者、底池分配、底池歸零與牌局進入結算狀態。
- 玩家籌碼歸零的本輪結算 E2E 已驗證統計面板、七邊形風格圖、七項行為圖表及回到第 1 局流程。
- 攤牌與本輪結算相關 `Browser E2E` 已由使用者於 2026-07-23 確認通過。
- `Browser E2E` 已升級為 Chromium 與 WebKit 獨立矩陣，兩個瀏覽器各自完整執行目前的 E2E 測試集合。
- Chromium 與 WebKit 共 12 次瀏覽器測試已由使用者於 2026-07-23 確認全部通過。
- 2026-07-27 已修正線上診斷頁的 AI 單一表情識別條件，改為檢查現行 `slot-single` 實作，不再依賴已移除的舊註解。
- 2026-07-27 已修正底池大小在沒有本機儲存值時被誤判為 `70%`；正式預設維持 `100%`。
- 2026-07-27 已讓後載入的 BGM、音量與牌組按鈕持續收進頂部設定選單，避免重新散落在頂部工具列。
- 2026-07-27 已更新 smoke E2E，依現行設定選單流程開啟與關閉版面編輯器。
- 2026-07-27 已更新 Gemini Final Boss E2E，使本地備援驗證等待現行安全後端狀態，不再受 Chromium／WebKit 載入時序影響。
- 2026-07-27 已以實際截圖確認下注標籤與 AI 資訊卡的 `3px` 陰影接縫屬於穩定視覺結果；E2E 門檻已與 Chromium、WebKit 的一致渲染對齊。
- 2026-07-27 已確認現行玩家手牌 DOM 仍為 `#playerCards .card`，不需更換 settlement selector。
- 2026-07-27 已確認 Gemini OCI 安全後端與本地備援仍是正式功能，不應淘汰 `gemini-final-boss.spec.js`。
- 2026-07-27 已確認桌機 `.seat-status` 正式規則為至少 `21px`，保留 E2E 的 `20px` 可讀性門檻。
- 2026-07-27 最新回歸結果：`Static site check`、Chromium E2E、WebKit E2E 均通過。

## 尚未完成

- 後續功能改動需持續進行 Chromium 與 WebKit 線上回歸測試。
- GitHub 無法反映尚未推送的本機修改；接續前仍需在正式 Mac 工作副本執行 `git status` 確認。

## 已知風險

- 本機若開啟 `/Users/qoo/Desktop/德州`，可能看到未同步的舊版雙表情畫面，或修改到 GitHub 工作副本以外的舊檔案。
- GitHub Desktop 只會提交實際變更的檔案，不會替專案同步其他資料夾。
- GitHub Pages 或瀏覽器快取可能暫時顯示舊版。
- 現有 E2E 已在 Chromium 與 WebKit 覆蓋核心 smoke、版面編輯、加注、All-in、固定攤牌、本輪結算、頂部設定與 Gemini 本地備援，但仍不能取代所有隨機牌局與長時間壓力測試。

## 開發規則

1. Codex 與編輯器應直接開啟 `/Users/qoo/Documents/GitHub/texas-holdem`。
2. 新功能只修改 Repository root 正式來源。
3. 每次修改前先執行 `git status` 並讀取本文件。
4. 不要在未核對最新 `main` 前覆蓋既有成果。
5. 不要 force push，除非使用者明確同意。
6. 不要提交 `.DS_Store`、臨時檔或下載素材原檔。
7. AI 教練不得讀取或洩露對手底牌。
8. 提交前必須執行 `node scripts/validate-static-site.mjs`。
9. 涉及遊戲流程或 UI 互動時必須執行 `npm run test:e2e`。
10. 不得重新建立 `docs/` 或其他完整網站副本。

## 變更時需注意

以下是目前已驗證正常的設計基準與回退參考，不代表永久鎖定；之後仍可依需求調整，但應避免無意間讓舊問題復發：

- 單一 AI 情緒表情與不被遮擋的頂層顯示。
- AI 行動發光提示。
- 思考進度條移除成果。
- 牌組收藏精簡成果。
- 版面編輯器。
- 頂部設定選單須持續容納後載入的音訊、牌組與版面控制。
- 底池大小在沒有儲存值時須維持 `100%` 預設。
- Gemini Final Boss 須保留安全後端與本地 Solver 備援，不得把 API Key 放入前端。
- `v75-smaller-table-2026-07-18`
- `v76-ux-readability-tuning-2026-07-18`
- `v77-pixel-card-theme-2026-07-19`

## 下一步

靜態檢查、Chromium 與 WebKit 雙瀏覽器 E2E 已恢復通過。合併目前回歸修正後，回到遊戲功能與 UI 迭代；任何新修改仍須維持相同驗證門檻。
