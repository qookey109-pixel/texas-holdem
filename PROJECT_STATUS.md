# 德州撲克專案狀態

核對日期：`2026-07-31`

## 專案資訊

- 正式 Repository：`qookey109-pixel/texas-holdem`
- 舊 Repository：`qoo109/texas-holdem`（歷史來源，目前不可作為正式維護位置）
- 正式分支：`main`
- 唯一正式開發與發布來源：Repository root
- GitHub Pages 預定網址：`https://qookey109-pixel.github.io/texas-holdem/`
- 線上診斷預定網址：`https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`
- GitHub Pages 發布來源：應設定為 `Deploy from a branch / main / (root)`
- 新 Repository 最新已核對 main：`08932e12b2c8f9f474fdaaa089f2fefa051a4224`

> 新帳號的 GitHub Pages 是否已啟用與成功部署，仍須在 Repository 的 `Settings → Pages` 完成確認；確認前不得宣稱新網址已正式上線。

## Repository 遷移狀態

- 2026-07-30 已將主要網站程式、測試、版本快照與專案文件上傳至 `qookey109-pixel/texas-holdem`。
- 新 Repository 已可由 ChatGPT GitHub Connector 讀寫。
- 遷移後文件仍殘留舊帳號 `qoo109` 與舊 Pages 網址，本次修正為新 Repository 資訊。
- 網頁上傳沒有帶入 `.github/workflows/` 與 `.gitignore`；本次重新建立靜態檢查、雙瀏覽器 E2E 與忽略規則。
- 遷移前的舊 CI 通過紀錄只能作為歷史證據；新 Repository 必須重新執行 CI，不能沿用舊 Repo 的綠燈狀態。
- 正式 Mac 工作副本若仍指向舊遠端，須改為：

```bash
git remote set-url origin https://github.com/qookey109-pixel/texas-holdem.git
git remote -v
git pull --ff-only
```

## 正式維護範圍

所有功能修改只在以下位置完成：

- `index.html`
- `styles.css`
- `app.js`
- `js/`

過去的 `docs/` 重複網站副本已移除。需要時可從 Git history 或版本快照還原，但不得重新建立第二套正式網站。

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
- 已建立 Playwright Chromium 與 WebKit 瀏覽器 E2E 測試。
- 版面編輯器不受牌局紀錄遮擋、五個大小調整滑桿可操作、關閉後側欄恢復，均已納入 E2E。
- 玩家加注與 All-in 的籌碼變化、牌局紀錄及執行階段錯誤檢查已納入 E2E。
- 固定牌面攤牌 E2E 已驗證五張公共牌、順子勝者、底池分配、底池歸零與牌局進入結算狀態。
- 玩家籌碼歸零的本輪結算 E2E 已驗證統計面板、七邊形風格圖、七項行為圖表及回到第 1 局流程。
- 2026-07-27 已修正線上診斷頁的 AI 單一表情識別條件，改為檢查現行 `slot-single` 實作，不再依賴已移除的舊註解。
- 2026-07-27 已修正底池大小在沒有本機儲存值時被誤判為 `70%`；正式預設維持 `100%`。
- 2026-07-27 已讓後載入的 BGM、音量與牌組按鈕持續收進頂部設定選單，避免重新散落在頂部工具列。
- 2026-07-27 已更新 smoke E2E，依現行設定選單流程開啟與關閉版面編輯器。
- 2026-07-27 已更新 Gemini Final Boss E2E，使本地備援驗證等待現行安全後端狀態，不再受 Chromium／WebKit 載入時序影響。
- 2026-07-27 已確認下注標籤與 AI 資訊卡的 `3px` 陰影接縫屬於穩定視覺結果。
- 2026-07-27 已確認現行玩家手牌 DOM 仍為 `#playerCards .card`。
- 2026-07-27 已確認 Gemini OCI 安全後端與本地 Solver 備援仍是正式功能，不應淘汰 `gemini-final-boss.spec.js`。
- 2026-07-27 已確認桌機 `.seat-status` 正式規則為至少 `21px`，保留 E2E 的 `20px` 可讀性門檻。
- 舊 Repository 在 2026-07-27 的最後已知回歸結果為：靜態檢查、Chromium E2E、WebKit E2E 均通過。

## 尚未完成

- 合併 Repository 遷移修正 PR。
- 在新 Repository 的 `Settings → Pages` 確認 `main / (root)`，並驗證新網站與診斷頁。
- 在新 Repository 重新跑過 `Static site check`、Chromium E2E 與 WebKit E2E。
- 在正式 Mac 工作副本執行 `git status`、核對 `origin`，確認沒有尚未推送的本機修改。
- 遷移驗證完成後，再回到遊戲功能與 UI 迭代。

## 已知風險

- 舊帳號 `qoo109` 的 Repository、Pages 與 Actions 狀態不可再視為新專案的即時狀態。
- 新 Repository 的 Pages 若尚未設定，預定網址會回傳 404 或尚未部署。
- 本機若仍使用舊 remote，可能把修改推往錯誤位置或無法推送。
- 本機若開啟 `/Users/qoo/Desktop/德州`，可能看到未同步的舊版或修改到正式工作副本以外的檔案。
- GitHub Pages 或瀏覽器快取可能暫時顯示舊版。
- 現有 E2E 涵蓋核心流程，但不能取代所有隨機牌局與長時間壓力測試。

## 開發規則

1. 正式 Repository 固定使用 `qookey109-pixel/texas-holdem`。
2. Codex 與編輯器應直接開啟 `/Users/qoo/Documents/GitHub/texas-holdem`。
3. 新功能只修改 Repository root 正式來源。
4. 每次修改前先執行 `git status`、`git remote -v` 並讀取本文件。
5. 不要在未核對最新 `main` 前覆蓋既有成果。
6. 優先使用功能分支與 Pull Request；不要 force push，除非使用者明確同意。
7. 不要提交 `.DS_Store`、`node_modules`、Playwright 報告、臨時檔或下載素材原檔。
8. AI 教練不得讀取或洩露對手底牌。
9. 提交前必須執行 `node scripts/validate-static-site.mjs`。
10. 涉及遊戲流程或 UI 互動時必須執行 `npm run test:e2e`。
11. 不得重新建立 `docs/` 或其他完整網站副本。

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

先完成新 Repository 的 CI 與 GitHub Pages 遷移驗證。三項檢查重新通過且新 Pages 可正常開啟後，再接續遊戲功能與 UI 更新。
