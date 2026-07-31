# Codex / AI 開發規則

## 專案來源

- Repository: `qookey109-pixel/texas-holdem`
- 舊 Repository: `qoo109/texas-holdem`（僅供歷史查閱，不得作為修改或發布來源）
- Canonical development source: repository root
- GitHub Pages: `Deploy from a branch / main / (root)`
- Pages 預定網址: `https://qookey109-pixel.github.io/texas-holdem/`
- Local working copy: `/Users/qoo/Documents/GitHub/texas-holdem`
- Required origin: `https://github.com/qookey109-pixel/texas-holdem.git`

## 每次開始前

1. 讀取 `PROJECT_STATUS.md`、`README.md`、`versions/README.md`。
2. 執行 `git status` 與 `git remote -v`。
3. 確認 `origin` 指向 `qookey109-pixel/texas-holdem`。
4. 確認最新 `main`，再從最新 `main` 建立本次工作的分支。
5. 檢查現有 Pull Request，避免重做或沿用已過時分支。
6. 以最新 GitHub 內容為準，不依聊天記憶重做功能。

## 允許修改

- `index.html`
- `styles.css`
- `app.js`
- `js/`
- 專案文件與必要測試
- 與目前任務直接相關的 `.github/workflows/` 與後端設定

## 不應修改

- 不要建立 `docs/` 或其他完整網站副本。
- 不要把 `/Users/qoo/Desktop/德州` 當成正式工作副本。
- 不要刪除最近穩定快照。
- 不要提交 `.DS_Store`、`node_modules`、Playwright 報告、下載圖片、臨時檔或編輯器快取。
- 不要 force push。
- 不要直接把未驗證修改寫入或合併至 `main`。
- 不要重新開啟並直接合併已標記 `Superseded` 的 PR #1。
- 不要讓 AI 教練看穿或洩露對手底牌。
- 不要把 API Key、Token 或其他憑證寫入前端或 Repository。

## 修改原則

- 延續既有 HTML、CSS 與 JavaScript 架構。
- 維持目前命名與程式風格。
- 只修改完成需求所需的最小範圍。
- 不覆蓋已驗證的 AI 表情、行動發光、牌組收藏、版面編輯、攤牌與本輪結算成果。
- 修改後執行 `node scripts/validate-static-site.mjs`。
- 涉及遊戲流程或 UI 互動時執行 `npm run test:e2e`；純文件修改可省略本機 E2E，但 Pull Request 的 CI 仍須通過。
- 新 Repository 的 Pages 與 CI 必須獨立驗證，不得沿用舊 Repository 的綠燈紀錄。

## 完成條件

- `git diff` 僅包含預期修改。
- 靜態網站檢查通過。
- 涉及互動的修改需讓 Chromium 與 WebKit Browser E2E 通過。
- 沒有新增不必要的副本或產物檔。
- 合併後確認 GitHub Pages 部署狀態。
- 線上發布後檢查 Console、Network、診斷頁與核心功能。
- 不得在沒有證據時宣稱部署、CI 或手動驗證已完成。
