# Poker State Stress V1

## 目的

此測試使用真實下注狀態機、真實 AI 決策入口與虛擬計時器，快速連續完成多手一般模式牌局，用來抓出一般 Browser E2E 不容易遇到的長時間狀態錯誤。

正式測試檔：

```text
tests/e2e/natural-betting-state-stress.spec.js
```

## 目前固定條件

- 瀏覽器：Chromium。
- 模式：一般六人桌。
- 隨機種子：`0x4e415455`。
- 預設 CI：100 手。
- 單手事件上限：2,000。
- 不重複執行 UI DOM 繪製；UI 本身由一般 Browser E2E 驗證。
- 不使用 Gemini 遠端後端。

## 每個狀態節點檢查

- 玩家數量維持六人。
- 牌堆、公共牌與所有底牌合計為 52 張。
- 所有牌唯一，不得重複。
- 公共牌數量只能為 0、3、4 或 5。
- Pot、Stack、Bet 與 Total Contribution 必須為非負整數。
- 所有玩家籌碼加 Pot 必須守恆。
- 牌局進行中，所有 Total Contribution 合計必須等於 Pot。
- Current Bet 必須等於桌上最大 Bet。
- Current Actor 必須是有效座位。
- 等待真人時，真人必須確實需要行動。
- 牌局結束後不得仍等待真人。
- Bet 不得大於 Total Contribution。

## 每手結束檢查

- 每手必須在事件上限內完成。
- 必須有至少一名勝者。
- 清除 AI、Gemini、對話、獎池與視覺計時器後，不得殘留牌局計時器。
- 排空純視覺計時器時不得再次改變牌局結果、Pot、籌碼或勝者。
- Scheduler callback 不得拋出錯誤。
- 頁面不得出現未處理 JavaScript 錯誤。
- AI timing experience 必須有資料，確保實際 AI 路徑有執行。

## 執行方式

本機 50 手：

```bash
npm run test:state-stress
```

本機 100 手：

```bash
npm run test:state-stress:100
```

GitHub Actions：

```text
.github/workflows/poker-state-stress.yml
```

觸發方式：

- 修改 `app.js`、`js/**`、壓力測試、依賴或 workflow 的 Pull Request。
- 每日排程：UTC 19:30，即台北時間次日 03:30。
- 手動執行：可選 10、25、50 或 100 手。

每次執行會保存 Playwright report 與 `natural-betting-state-stress.json` Artifact 14 天。

## V1 尚未覆蓋

以下項目不得宣稱已由本測試完成驗證：

- 多種隨機種子與牌局分布。
- 500～1,000 手以上的單次長跑。
- 淘汰賽角色替換、縮桌、盲注升級與恢復。
- Supabase 真實寫入與讀回。
- 多主池／邊池的每一種強制牌型案例。
- 多人平分底池時的奇數籌碼順序。
- 真實 DOM、動畫與長時間瀏覽器記憶體成長。

以上項目應在後續 V2／V3 分開加入，避免單一測試同時承擔狀態機、UI、後端與淘汰賽全部責任。
