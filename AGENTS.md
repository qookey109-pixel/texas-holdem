# Codex / AI 開發規則

## 專案來源

- Repository：`qookey109-pixel/texas-holdem`
- Canonical development source：repository root
- GitHub Pages：`Deploy from a branch / main / (root)`
- Pages 預定網址：`https://qookey109-pixel.github.io/texas-holdem/`
- Local working copy：`/Users/qoo/Documents/GitHub/texas-holdem`
- 舊 Repository `qoo109/texas-holdem` 不再是正式來源。

## 每次開始前

1. 讀取 `PROJECT_STATUS.md`、`README.md`、`versions/README.md`。
2. 執行 `git status` 與 `git remote -v`。
3. 確認 `origin` 為 `https://github.com/qookey109-pixel/texas-holdem.git`。
4. 確認目前 branch 與最新 `main`，並檢查遠端是否有更新。
5. 以最新 GitHub 內容為準，不依聊天記憶重做功能。
6. 若新 Repository 的 CI 或 Pages 尚未驗證，必須明確標示「待確認」。

## 允許修改

- `index.html`
- `styles.css`
- `app.js`
- `js/`
- 專案文件
- 必要測試與 `.github/workflows/`

## 不應修改

- 不要建立 `docs/` 或其他完整網站副本。
- 不要把 `/Users/qoo/Desktop/德州` 當成正式工作副本。
- 不要刪除最近穩定快照。
- 不要提交 `.DS_Store`、`node_modules`、Playwright 報告、下載圖片、臨時檔或編輯器快取。
- 不要 force push。
- 不要直接把未驗證修改寫入 `main`；優先建立功能分支與 Pull Request。
- 不要讓 AI 教練看穿或洩露對手底牌。
- 不要把 API Key、Token 或其他憑證寫進前端或 Repository。

## 修改原則

- 延續既有 HTML、CSS 與 JavaScript 架構。
- 維持目前命名與程式風格。
- 只修改完成需求所需的最小範圍。
- 不覆蓋已驗證的 AI 表情、行動發光、牌組收藏、版面編輯、攤牌與本輪結算成果。
- 修改後執行 `npm run validate`。
- 涉及遊戲流程或 UI 互動時執行 `npm run test:e2e`；純文件修改可省略本機 E2E，但 PR 的 CI 仍須通過。
- 新 Repository 遷移完成前，不得沿用舊 Repository 的 CI 綠燈作為新 Repo 的驗證結果。

## 完成條件

- `git diff` 僅包含預期修改。
- `Static site check` 通過。
- 涉及互動的修改需讓 Chromium 與 WebKit E2E 通過。
- 沒有新增不必要的網站副本或產物檔。
- 合併後確認 GitHub Pages 部署狀態。
- 線上發布後檢查 Console、Network、診斷頁與核心功能。
- 不得在沒有證據時宣稱部署、CI 或手動驗證已完成。
