# Codex / AI 開發規則

## 專案來源

- Repository: `qoo109/texas-holdem`
- Canonical development source: repository root
- GitHub Pages: `Deploy from a branch / main / (root)`
- Local working copy: `/Users/qoo/Documents/GitHub/texas-holdem`

## 每次開始前

1. 讀取 `PROJECT_STATUS.md`、`README.md`、`versions/README.md`。
2. 執行 `git status`。
3. 確認目前 branch 為 `main`，並確認遠端是否有更新。
4. 以最新 GitHub 內容為準，不依聊天記憶重做功能。

## 允許修改

- `index.html`
- `styles.css`
- `app.js`
- `js/`
- 專案文件與必要測試

## 不應修改

- 不要建立 `docs/` 或其他完整網站副本。
- 不要把 `/Users/qoo/Desktop/德州` 當成正式工作副本。
- 不要刪除最近穩定快照。
- 不要提交 `.DS_Store`、下載圖片、臨時檔或編輯器快取。
- 不要 force push。
- 不要讓 AI 教練看穿對手底牌。

## 修改原則

- 延續既有 HTML、CSS 與 JavaScript 架構。
- 維持目前命名與程式風格。
- 只修改完成需求所需的最小範圍。
- 不覆蓋已驗證的 AI 表情、行動發光、牌組收藏與版面編輯成果。
- 修改後執行 `node scripts/validate-static-site.mjs`。
- 涉及遊戲流程或 UI 互動時執行 `npm run test:e2e`；純文件修改可省略。

## 完成條件

- 靜態網站檢查通過。
- 涉及互動的修改需讓 Browser E2E 通過。
- `git diff` 僅包含預期修改。
- 沒有新增不必要的副本。
- 線上發布後檢查 Console、Network 與核心功能。
- 不得在沒有證據時宣稱部署或測試已完成。
