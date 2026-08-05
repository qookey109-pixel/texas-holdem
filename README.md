# 德州撲克網頁遊戲

純 HTML、CSS、JavaScript 製作的德州撲克網頁遊戲，支援一般牌局、19 位永久淘汰賽、公平 Boss、Gemini 後端、牌局覆盤、雲端存檔、可調整牌桌介面與桌機鍵盤無障礙。

## 線上網站

- 正式網站：`https://qookey109-pixel.github.io/texas-holdem/`
- 診斷頁：`https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`

## 唯一正式來源

GitHub Pages 使用：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/ (root)`

正式程式來源：`index.html`、`styles.css`、`app.js`、`js/`。過去的 `docs/` 重複網站副本已移除，不得重新建立第二套正式網站。

## Repository 與本機路徑

```text
Repository: qookey109-pixel/texas-holdem
Local: /Users/qoo/Documents/GitHub/texas-holdem
```

不要使用：

```text
qoo109/texas-holdem
/Users/qoo/Desktop/德州
```

## 目前主要功能

### 牌局與介面

- 六人德州撲克牌桌。
- 合法下注、加注、All-in、主池／邊池、攤牌與籌碼結算。
- 新手教學、撲克教練、牌局覆盤與本輪結算。
- 牌桌版面編輯、官方預設版面與尺寸控制。
- 童趣手繪／午夜牌組收藏。
- AI 情緒表情、座位發光、BGM 與音效分離控制。
- Safari 音訊恢復與公共牌街道轉場效能優化。

### AI 難度主線

```text
獨立角色策略 V1
→ 多街策略 V1.1
→ 翻牌前位置化範圍 V1.2
→ 分街玩家模型 V1.3
→ 長期安全記憶 V1.4
→ 多人公開範圍與決策 V1.5
→ 固定種子校準 V1.6
→ 初階連續牌力與 Pot 相對尺寸 V1.7
→ 淨 EV、有效籌碼、SPR 與 All-in 單一調整鏈 V1.8
→ 公平 Boss 精確河牌與多人聯合 Equity V1.9
→ 公開行動條件化對手範圍 V2
→ Board Texture 與公開跨街範圍診斷 V2.1／V2.2
→ Gemini
```

AI 只可使用自己的底牌、公共牌、公開位置、公開下注行動與聚合後的玩家統計；不得讀取對手隱藏底牌、實際牌堆順序、未來公共牌或預定勝負答案。

### G1 挑戰賽經濟

- 19 位永久淘汰賽，Gemini 最後登場。
- 6 位開局、13 位依序補位。
- 一般模式保留既有補位規則；G1 只套用淘汰賽。
- 淘汰賽盲注只依手數推進，不依玩家籌碼占比加速。
- 新角色籌碼依當前大盲、桌面總 BB 與角色階級動態計算。
- 全桌目標 `170BB`、反應幅度 `15%`。
- 中階 `25／35／45BB`、高階 `30／40／50BB`、特殊 Boss `35／45／60BB`、Gemini `40／50／70BB`。
- 13 位補位角色理論最大累積注入為 `660 entry-BB`。
- 補位公式不使用玩家個人籌碼、籌碼占比、勝率或籌碼王狀態。

正式模組：

```text
ReplacementStackBalance 2.1.0
```

### 挑戰賽與雲端

- 分層候補、替換與對稱縮桌。
- Google 登入。
- Supabase 淘汰賽自動存檔、暫停、恢復與刪除。
- 雲端存檔 V2 保存累積 session 統計，並相容 V1 舊存檔。
- 存檔不包含底牌、牌堆、未來公共牌或完整逐步牌局紀錄。

Supabase migrations：

```text
supabase/migrations/20260803_create_tournament_saves_v1.sql
supabase/migrations/20260804_allow_tournament_save_v2.sql
```

### 桌機鍵盤與焦點無障礙

正式模組：

```text
DesktopAccessibilityFocus 2.1.0
```

支援 AI 座位 Enter／Space、Dialog focus trap、Escape 關閉與焦點還原、`aria-controls`、`aria-expanded` 與一致的 `:focus-visible`。

## 開始工作前

```bash
git remote -v
git status
git pull --ff-only
```

並先閱讀：

- `PROJECT_STATUS.md`
- `AGENTS.md`
- `versions/README.md`
- `build-manifest.json`

任何聊天紀錄、Handoff 或舊 PR 若與最新 GitHub `main` 衝突，以最新 Repository 為準。

## 驗證

### 靜態與部署契約

```bash
npm run validate
npm run validate:deployment
```

### Browser E2E

```bash
npm install
npx playwright install chromium webkit
npm run test:e2e
```

GitHub Actions 會分別執行 Chromium 與 WebKit。

### AI 固定種子校準

```bash
npm run test:ai-calibration
```

### 長時間狀態壓力測試

```bash
npm run test:state-stress
npm run test:state-stress:100
```

正式壓力測試包含：

- 一般模式最多 100 手自然下注。
- 牌張唯一、籌碼守恆、合法 Actor、Pot／Contribution／Current Bet、無負數籌碼、無卡死與殘留計時器。
- G1 19 位角色與 13 次補位循環。
- Gemini 最後登場、盲注不倒退、角色不重複、累積補位不超過 `660 entry-BB`。
- 每日台北時間約 03:30 自動執行。

相關文件：

```text
docs/poker-state-stress-v1.md
docs/ai-calibration-v1-6.md
docs/ai-calibration-v1-9.md
docs/ai-v2-public-range-equity.md
```

## 分支與發布流程

1. 重新核對最新 `main`。
2. 從最新 `main` 建立新分支。
3. 只修改本次需求需要的檔案。
4. 執行 `npm run validate` 與必要 E2E／AI Calibration／State Stress。
5. 建立 Pull Request。
6. 確認 PR head 未變且分支沒有落後。
7. 確認必要 CI 全綠。
8. 合併後重新核對正式 `main`、GitHub Pages 與診斷頁。

## 過時 PR 注意事項

不得直接合併：

- PR #9：已由 PR #82 取代。
- PR #32：舊公平 Boss 修正。
- PR #46：舊 Range Continuation V1.3。
- PR #86：玩家領先加速盲注，已由 G1 取代。
- PR #89：舊 16 位 F1 模擬，已由正式 19 位 G1 取代。

詳細狀態、已知風險與下一步請看 `PROJECT_STATUS.md`。
