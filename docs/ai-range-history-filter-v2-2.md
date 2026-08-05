# AI V2.2 Range Filter V1

## 目標

以正式的公開行動歷史 Schema `2.2.0` 建立可解釋的跨街 Range 收窄鏈。

本階段只產生診斷資料，不接入 `botAction()`、角色策略、Boss Equity 或下注尺寸，因此合併後不應改變玩家實際感受到的 AI 行動。

為避免新增另一條動態載入與部署契約，本版將獨立的 `AiRangeHistoryFilterV1` IIFE 放在既有 `js/ai-range-tools-v1.js` 資產中；兩個全域 API 互不覆蓋。

正式模組：

```text
js/ai-range-tools-v1.js
AiRangeTools 1.0.0（既有 API 保留）
AiRangeHistoryFilterV1 1.0.0（新增診斷 API）
```

## 與既有模型的關係

專案已存在：

```text
AiMultiwayRangeModel 1.0.0
BossPublicRangeModelV1 1.0.0
```

既有模型目前仍負責正式決策與 Boss Equity。

Range Filter V1 不取代它們，也不建立第二套決策入口；它只讀取 `AiActionMemory` 的公開事件，輸出更完整的跨街診斷鏈，供後續 Range Weight 與 Decision Integration 使用。

## 輸入

只允許：

- 公開 Check、Call、Bet、Raise、Fold、All-in。
- 公開位置。
- 行動前需跟注金額。
- 公開投入、Raise By、底池與尺寸比例。
- 公開街道與行動順序。
- 行動當下已公開的公共牌時間點。
- 活躍對手數。

禁止：

- 對手隱藏底牌。
- 任何未公開底牌。
- 實際牌堆順序。
- 未來 Turn／River。
- 預定勝負答案。
- 從 DOM、存檔、除錯欄位或後端答案間接取得上述資訊。

## 輸出

每位玩家會得到：

```text
rangeWidth
rangeStrength
nutDensity
valueDensity
bluffDensity
confidence
equivalentComboCount
preflopWidth
flopWidth
turnWidth
riverWidth
```

其中：

- `rangeWidth`：相對起始範圍仍保留的比例。
- `rangeStrength`：目前範圍的相對強度訊號。
- `nutDensity`：頂端價值組合密度。
- `valueDensity`：可合理價值下注或繼續的組合密度。
- `bluffDensity`：侵略路線中保留的非零詐唬／半詐唬尾端。
- `confidence`：公開行動對收窄結果的可辨識程度。
- `equivalentComboCount`：以 1,326 組起手牌為基準換算的相對診斷數字，不代表已完成逐 Combo 權重。

## 行動分類

正式牌局把「第一次下注」與「面對下注後再加注」都記為 Raise，因此 Filter 會依：

```text
amountToCallBefore
```

區分：

```text
Bet
Raise
All-in Bet
All-in Raise
```

這讓同樣的公開 `raise` 事件可以得到正確語意。

## 收窄原則

### 翻牌前

- 盲注不視為自願 Range 收窄。
- 大盲免費 Check 保持寬範圍。
- Call 移除 Fold，但保留封頂牌與少量 Trap。
- Open Raise 依位置套用第一次收窄。
- 3-bet／4-bet 等重複侵略會再次收窄。
- All-in 形成很窄的繼續範圍，但不得把詐唬密度硬歸零。

### 翻牌後

- Check 只小幅收窄，保留 Showdown、Draw 與 Trap。
- Call 依公開 Pot Odds 與下注尺寸收窄。
- Bet 保留 Value 與 Semi-bluff。
- Raise 比 Bet 更窄。
- Overbet／All-in 形成較極化的 Value＋Bluff Range。
- Fold 會結束該玩家的有效 Range。

## 單調性

同一條公開路線中：

```text
Range Width 不得因後續行動自行變寬
```

例如：

```text
Preflop 0.40
Flop    0.22
Turn    0.20
River   0.10
```

被動路線則應保留較寬範圍：

```text
Preflop Call
Flop Check
Turn Check
River Check
```

不得與 River Pot Bet 得到相同結果。

## API

```text
analyzeEvents(playerOrName, events, options)
actorEventsFromHistory(playerOrName, history)
analyzeActor(playerOrName, options)
analyzeAll(options)
```

### `analyzeEvents()`

純函式入口，適合固定測試與校準。

### `analyzeActor()`

讀取指定 `AiActionMemory.snapshot()` 或 caller 提供的公開歷史。

### `analyzeAll()`

批次輸出目前歷史中所有公開 Actor 的診斷。

## 不包含

本 PR 刻意不做：

- 不建立 1,326 Combo 的逐組權重。
- 不移除實際牌張衝突組合。
- 不接入 `AiMultiwayRangeModel`。
- 不接入 `BossPublicRangeModelV1`。
- 不修改 Call、Raise、Fold。
- 不修改下注尺寸。
- 不修改角色星級或強度。
- 不修改 Oracle／Chronos Equity。
- 不修改 Gemini Prompt 或後端。

因此：

```text
decisionIntegrated: false
```

必須出現在診斷輸出。

## 驗收

新增：

```text
tests/e2e/ai-range-history-filter-v2-2.spec.js
```

涵蓋：

- 模組與公平資訊政策載入。
- 極化 River Bet 比被動 Check Line 明顯更窄。
- 大尺寸 Call 比小尺寸 Call 更窄。
- Range Width 跨街單調不增加。
- Value／Nut Density 隨侵略線提高。
- Bluff Density 保留非零尾端。
- 正確讀取 Action History Schema `2.2.0`。
- 隱藏底牌、牌堆與未來公共牌 getter 讀取即拋錯。

## 下一階段

下一個獨立 PR：

```text
AI V2.2 Range Weight V1
```

才會建立逐 Combo／牌型類別權重，並以本 Filter 的收窄鏈作為先驗條件。

再下一階段才會評估：

```text
Decision Integration
Range Visualizer
```
