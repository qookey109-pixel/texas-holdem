# 德州撲克網頁遊戲

純 HTML、CSS、JavaScript 製作的德州撲克網頁遊戲。

## 正式 Repository

`qookey109-pixel/texas-holdem`

舊的 `qoo109/texas-holdem` 僅保留為歷史來源，不再作為正式維護位置。

## 線上網站

GitHub Pages 預定網址：

`https://qookey109-pixel.github.io/texas-holdem/`

診斷頁預定網址：

`https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`

新 Repository 必須先在 `Settings → Pages` 設定：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/ (root)`

設定並完成部署前，不應把預定網址視為已正式上線。

## 唯一正式來源

正式程式來源：

- `index.html`
- `styles.css`
- `app.js`
- `js/`

過去的 `docs/` 重複副本已移除。請勿重新建立第二套完整網站。

## 本機開發

正式 Mac 工作副本：

```text
/Users/qoo/Documents/GitHub/texas-holdem
```

不要把 `/Users/qoo/Desktop/德州` 當成另一份正式版本。

Repository 遷移後，先確認遠端：

```bash
cd /Users/qoo/Documents/GitHub/texas-holdem
git remote set-url origin https://github.com/qookey109-pixel/texas-holdem.git
git remote -v
git status
git pull --ff-only
```

開始工作前先閱讀：

- `PROJECT_STATUS.md`
- `AGENTS.md`
- `versions/README.md`

## 安裝測試套件

```bash
npm install
npx playwright install chromium webkit
```

目前 Repository 尚未提交 `package-lock.json`，因此 CI 與首次本機安裝使用 `npm install`，不是 `npm ci`。

## 靜態檢查

```bash
npm run validate
```

檢查內容包括：

- root 必要檔案是否存在
- HTML、CSS 與動態 JavaScript 引用是否缺檔
- 是否誤用不適合 GitHub Project Pages 的 `/` 絕對路徑
- root JavaScript 語法是否正確

## 瀏覽器 E2E

```bash
npm run test:e2e
```

Playwright 會執行 Chromium 與 WebKit，檢查頁面啟動、六位 AI、玩家手牌、新牌局、玩家行動、遊戲紀錄、新手教學、版面編輯、AI 資訊卡、攤牌、本輪結算、Console error 與失敗的網路請求。

GitHub Actions：

- `Static site check`
- `Browser E2E`（Chromium／WebKit 矩陣）

失敗時會保留 Playwright report、trace、截圖與影片。

## 發布流程

1. 從最新 `main` 建立功能分支。
2. 只在 Repository root 修改需要的內容。
3. 執行 `npm run validate`。
4. 涉及遊戲流程或介面互動時執行 `npm run test:e2e`。
5. 建立 Pull Request，不直接覆蓋已驗證成果。
6. 確認 `Static site check` 與 `Browser E2E` 通過。
7. 合併後等待 GitHub Pages 更新。
8. 強制重新整理網站，檢查 Console、Network 與核心功能。

詳細狀態請看 `PROJECT_STATUS.md`。
