# Poker State Stress V1.1

## 目的

此測試把長時間牌局與淘汰賽補位循環正式納入 CI，用來抓一般 Browser E2E 不容易遇到的累積狀態錯誤。

正式測試檔：

```text
tests/e2e/natural-betting-state-stress.spec.js
tests/e2e/tournament-replacement-state-stress.spec.js
```

## 一般模式自然下注壓力

固定條件：

- 瀏覽器：Chromium。
- 模式：一般六人桌。
- 隨機種子：`0x4e415455`。
- 預設 CI：100 手。
- 單手事件上限：2,000。
- 使用真實下注狀態機、真實 AI 決策入口與虛擬計時器。
- 不重複執行 UI DOM 繪製；UI 由一般 Browser E2E 驗證。
- 不使用 Gemini 遠端後端。

檢查：

- 52 張牌唯一性與公共牌數量。
- Pot、Stack、Bet、Contribution 與 Current Bet 一致。
- 所有玩家籌碼加 Pot 守恆。
- 非負整數籌碼與合法 Actor／真人等待狀態。
- 每手在事件上限內完成。
- 無殘留計時器、Scheduler error 或 Page error。
- AI timing experience 確實產生資料。

## G1 淘汰賽補位循環壓力

固定條件：

- 正式 19 位 AI 名單。
- 六位開局角色＋13 次連續補位。
- 每次循環推進手數，涵蓋 G1 純手數盲注的多個級距。
- 不依賴 Gemini 遠端後端。

檢查：

- 每次淘汰只新增一位 appeared 角色。
- 13 次補位均產生且只消費一次診斷紀錄。
- 補位角色實際籌碼等於 G1 計算結果。
- 盲注不得倒退。
- 所有 entry BB 為有限正數。
- 19 位 appeared 名單不得重複。
- Gemini 必須最後登場。
- 累積 entry-BB 不得超過理論上限 660。
- 不得出現未處理 JavaScript 錯誤。

## 執行方式

本機 50 手＋淘汰賽循環：

```bash
npm run test:state-stress
```

本機 100 手＋淘汰賽循環：

```bash
npm run test:state-stress:100
```

GitHub Actions：

```text
.github/workflows/poker-state-stress.yml
```

觸發方式：

- 修改 `app.js`、`js/**`、兩個壓力測試、依賴或 workflow 的 Pull Request。
- 每日排程：UTC 19:30，即台北時間次日 03:30。
- 手動執行：可選 10、25、50 或 100 手。

每次執行保留 Playwright report、一般模式 JSON 與淘汰賽補位 JSON Artifact 14 天。

## 尚未覆蓋

- 多種隨機種子的 500～1,000 手長跑。
- 淘汰賽完整自然下注至縮桌與最終結算。
- Supabase 正式環境寫入、讀回、暫停與恢復。
- 多主池／邊池所有強制牌型案例。
- 多人平分底池的奇數籌碼順序。
- 真實 DOM、動畫與長時間瀏覽器記憶體成長。

以上項目應分階段加入，避免單一測試同時承擔狀態機、UI、後端與完整淘汰賽全部責任。
