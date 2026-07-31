# 德州撲克專案狀態

核對日期：`2026-07-31`

## 專案資訊

- 正式 Repository: `qookey109-pixel/texas-holdem`
- 舊 Repository: `qoo109/texas-holdem`（僅保留歷史紀錄，不再作為正式維護來源）
- 線上網站預定網址: `https://qookey109-pixel.github.io/texas-holdem/`
- 線上診斷預定網址: `https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`
- 正式分支: `main`
- 唯一正式開發與發布來源: Repository root
- GitHub Pages 發布來源: `Deploy from a branch / main / (root)`
- 新 Repository Pages 狀態: 使用者於 2026-07-31 表示應已啟用；本次外部連線環境無法直接讀取 Pages 網址，因此首頁與診斷頁仍標示「待重新實測」。

## Repository 遷移狀態

- 主要網站程式、測試、後端設定、版本快照與專案文件已遷移至 `qookey109-pixel/texas-holdem`。
- Repository、Pages 預定網址、Cloudflare Worker 與 OCI Gemini 後端允許來源已更新為新帳號網域，並保留本機測試來源。
- `main` 已恢復 `Static site check`、Chromium／WebKit `Browser E2E` 與 OCI Gemini 後端驗證 workflow。
- 過時的 PR #1 `Restore CI and update project after repository migration` 已於 2026-07-31 關閉並標記為 `Superseded`，未合併至 `main`。
- PR #1 的分支以舊 `08932e12...` 為基準，已落後且與現行 `main` 分岔，不得重新開啟後直接合併。
- PR #3 `Clarify repository migration and verification status` 已於 2026-07-31 通過 Static 與 Browser E2E，並以 squash 方式合併至 `main`。
- PR #3 合併 commit 為 `fb02c273217935d4266f6eba4ffabbf5a8eb9c2a`；此 SHA 僅作為歷史里程碑，不作為永久「最新 main」欄位。
- 後續變更應從最新 `main` 建立新分支與 Pull Request，不得沿用舊遷移分支。
- 正式 Mac 工作副本的 `origin` 是否已切換到新 Repository，仍需在本機執行 `git remote -v` 確認。

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
- 遷移前舊 Repository 的 `Static site check` 已由使用者確認多次通過。
- 遷移前舊網站的線上診斷頁已由使用者確認全部通過。
- 新牌局、AI 表情、音效/BGM、編輯版面、牌組收藏、新手教學與本輪結算已完成手動驗證。
- 遷移前舊網站的 Safari Console 與 Network 已由使用者確認沒有紅色 JavaScript error 或 404。
- 舊 Repository 的 GitHub Pages 曾設定並驗證使用 `main / (root)`；新 Repository 需獨立重新驗證。
- `docs/` 歷史副本已移除，專案完成單一網站來源整理。
- 已建立 Playwright Chromium 最小瀏覽器 E2E 測試與 `Browser E2E` GitHub Actions workflow。
- `Browser E2E` 第一次 GitHub Actions 執行已由使用者於 2026-07-22 在舊 Repository 確認通過。
- 版面編輯器不受牌局紀錄遮擋、五個大小調整滑桿可操作、關閉後側欄恢復，均已納入 E2E。
- 玩家加注與 All-in 的籌碼變化、牌局紀錄及執行階段錯誤檢查已納入 E2E，並由使用者於 2026-07-22 在舊 Repository 確認通過。
- 固定牌面攤牌 E2E 已驗證五張公共牌、順子勝者、底池分配、底池歸零與牌局進入結算狀態。
- 玩家籌碼歸零的本輪結算 E2E 已驗證統計面板、七邊形風格圖、七項行為圖表及回到第 1 局流程。
- 攤牌與本輪結算相關 `Browser E2E` 已由使用者於 2026-07-23 在舊 Repository 確認通過。
- `Browser E2E` 已升級為 Chromium 與 WebKit 獨立矩陣，兩個瀏覽器各自完整執行目前的 E2E 測試集合。
- Chromium 與 WebKit 共 12 次瀏覽器測試已由使用者於 2026-07-23 在舊 Repository 確認全部通過。
- 2026-07-27 已修正線上診斷頁的 AI 單一表情識別條件，改為檢查現行 `slot-single` 實作，不再依賴已移除的舊註解。
- 2026-07-27 已修正底池大小在沒有本機儲存值時被誤判為 `70%`；正式預設維持 `100%`。
- 2026-07-27 已讓後載入的 BGM、音量與牌組按鈕持續收進頂部設定選單，避免重新散落在頂部工具列。
- 2026-07-27 已更新 smoke E2E，依現行設定選單流程開啟與關閉版面編輯器。
- 2026-07-27 已更新 Gemini Final Boss E2E，使本地備援驗證等待現行安全後端狀態，不再受 Chromium／WebKit 載入時序影響。
- 2026-07-27 已以實際截圖確認下注標籤與 AI 資訊卡的 `3px` 陰影接縫屬於穩定視覺結果；E2E 門檻已與 Chromium、WebKit 的一致渲染對齊。
- 2026-07-27 已確認現行玩家手牌 DOM 仍為 `#playerCards .card`，不需更換 settlement selector。
- 2026-07-27 已確認 Gemini OCI 安全後端與本地備援仍是正式功能，不應淘汰 `gemini-final-boss.spec.js`。
- 2026-07-27 已確認桌機 `.seat-status` 正式規則為至少 `21px`，保留 E2E 的 `20px` 可讀性門檻。
- 2026-07-27 遷移前最後已確認回歸結果：`Static site check`、Chromium E2E、WebKit E2E 均通過。
- 2026-07-31 已關閉未合併且已過時的 PR #1，避免後續誤合併造成回退。
- 2026-07-31 PR #3 的 `Static site check` 與 Chromium／WebKit `Browser E2E` 已通過，並完成合併。

## 尚未完成

- 需在可連線環境重新實測新 Pages 首頁與 `diagnostics.html`。
- 需確認 PR #3 合併後最新 `main` 的 push workflow 執行結果；PR 分支上的 Static 與 Browser E2E 已通過。
- 需在正式 Mac 工作副本執行 `git remote -v`、`git status` 與 `git pull --ff-only`，確認本機已切換至新 Repository 且沒有未提交修改。
- 後續功能改動需持續進行 Chromium 與 WebKit 線上回歸測試。
- GitHub 無法反映尚未推送的本機修改；接續前仍需在正式 Mac 工作副本執行 `git status` 確認。

## 已知風險

- 本機若開啟 `/Users/qoo/Desktop/德州`，可能看到未同步的舊版雙表情畫面，或修改到 GitHub 工作副本以外的舊檔案。
- GitHub Desktop 只會提交實際變更的檔案，不會替專案同步其他資料夾。
- GitHub Pages 或瀏覽器快取可能暫時顯示舊版。
- 新 Repository 的 Pages 與 CI 必須獨立驗證，不能沿用舊 Repository 的通過紀錄。
- 已關閉的 PR #1 分支仍可能存在；不得重新開啟後直接合併。
- 現有 E2E 已在 Chromium 與 WebKit 覆蓋核心 smoke、版面編輯、加注、All-in、固定攤牌、本輪結算、頂部設定與 Gemini 本地備援，但仍不能取代所有隨機牌局與長時間壓力測試。

## 開發規則

1. Codex 與編輯器應直接開啟 `/Users/qoo/Documents/GitHub/texas-holdem`。
2. `origin` 必須指向 `https://github.com/qookey109-pixel/texas-holdem.git`。
3. 新功能只修改 Repository root 正式來源。
4. 每次修改前先執行 `git status`、`git remote -v` 並讀取本文件。
5. 不要在未核對最新 `main` 前覆蓋既有成果。
6. 不要 force push，除非使用者明確同意。
7. 不要提交 `.DS_Store`、臨時檔或下載素材原檔。
8. AI 教練不得讀取或洩露對手底牌。
9. 提交前必須執行 `node scripts/validate-static-site.mjs`。
10. 涉及遊戲流程或 UI 互動時必須執行 `npm run test:e2e`。
11. 不得重新建立 `docs/` 或其他完整網站副本。
12. 不得重新開啟並直接合併已標記 `Superseded` 的 PR #1。

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

先完成新 Repository 的 Pages、診斷頁、合併後 Actions 與正式 Mac remote 實測；確認遷移基礎穩定後，再從最新 `main` 建立新分支，進入依賴鎖定、診斷檢查與手機 E2E 等第二優先修正。
