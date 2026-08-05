# AI V2.2 公開行動歷史基礎層

## 目標

本階段建立跨街 Range 收窄所需的可重建公開行動資料，但**不接入 Range Filter，也不改變任何 AI 決策**。

專案已存在 `AiActionMemory`，因此本 PR 不另造重複系統，而是將既有模組向後相容升級：

```text
js/ai-action-memory-v1.js
AiActionMemory 1.1.0
事件 Schema 2.2.0
```

既有 API 與功能繼續保留：

- 同街行動查詢。
- 玩家行動查詢。
- 最新加注查詢。
- Check-Raise 機會辨識。
- V1.1 多街角色策略使用的公開記憶。

## 本階段新增資料

每個公開事件現在包含：

```text
sequence
streetActionIndex
handNumber
street
actor
actorKey
seatIndex
positionLabel
isHuman
action
isAggressive
isForcedBet
isAllIn
amount
contribution
previousActorBet
betTo
amountToCallBefore
raiseBy
currentBetBefore
currentBetAfter
potBefore
potAfter
contributionPotFraction
raiseByPotFraction
activePlayerCount
activeOpponentCount
board
note
publicInformationOnly
```

這些欄位讓後續 Range Filter 可以知道：

- 玩家在什麼位置採取行動。
- 行動發生於哪一街、該街第幾個動作。
- 行動前需要跟注多少。
- 玩家實際投入多少籌碼。
- Raise 是加到多少、加注幅度是多少。
- 行動前後的底池與最高下注。
- 當時仍有多少公開活躍玩家。
- 行動當下已公開的公共牌。

## 強制下注

舊版只包裝 `logAction()`，盲注並不會進入歷史。

V2.2 額外包裝公開的 `postBlind()`，記錄：

```text
small-blind
big-blind
```

因此翻牌前路線可以從真實起始投入重建，不會把大盲玩家的首次 Call／Raise 誤認為從 0 籌碼開始。

## 跨街查詢

新增：

```text
allActions()
actorLine(playerOrName)
streetSummary(street)
snapshot()
```

用途：

- `allActions()`：依全手牌順序取得所有公開事件。
- `actorLine()`：取得單一玩家從 Preflop 到 River 的完整公開路線。
- `streetSummary()`：取得單街的行動、侵略與強制下注摘要。
- `snapshot()`：輸出不含內部追蹤狀態的公開歷史快照。

## 公平資訊限制

允許：

- 公開 Check／Call／Raise／Fold／All-in。
- 公開位置與座位。
- 公開下注額、底池與需跟注金額。
- 行動當時已公開的公共牌。
- 活躍玩家數。

禁止：

- 對手隱藏底牌。
- 任何玩家未公開底牌。
- 實際牌堆順序。
- 未來 Turn／River。
- 預定勝負答案。
- 從 DOM、存檔或除錯欄位間接取得上述資訊。

## 本 PR 刻意不做

- 不建立 Range Filter。
- 不刪除任何牌組。
- 不計算 Range Width。
- 不建立 Combo 權重。
- 不修改 `botAction()`。
- 不修改下注尺寸。
- 不修改 Oracle／Chronos Equity。
- 不增加角色強度。

因此本 PR 合併後，玩家實際感受到的 AI 行為應保持不變。

## 驗收情境

### 翻牌前公開路線

```text
SB 10
BB 20
BTN Raise to 60
BB Call 40
```

歷史必須重建：

- BTN 行動前需跟注 20。
- BTN 實際投入 60。
- BTN Raise By 40。
- BB 已投入 20，再投入 40。
- 底池依序為 10 → 30 → 90 → 130。

### 跨街路線

```text
Preflop Call
Flop Raise
Turn Check
```

`actorLine()` 必須依序保存三條街，公開牌快照張數為：

```text
0 → 3 → 4
```

### 公平性

測試會讓底牌、牌堆與未來牌欄位在讀取時直接拋錯；公開行動仍必須成功寫入。

## 下一階段

下一個獨立 PR 才建立：

```text
AI V2.2 Range Filter V1
```

它會只讀取此公開 Schema，先輸出每街 Range Width、Range Strength、Nut Density、Bluff Density 與 Confidence；第一版仍不直接改變最終 AI 決策。
