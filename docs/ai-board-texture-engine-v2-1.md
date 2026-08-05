# AI V2.1 Board Texture Engine 基礎層

## 本 PR 範圍

本階段只建立公開牌面分類器與驗收測試，不接入正式 AI 決策，也不改動任何角色的下注、跟注、加注或棄牌頻率。

正式模組：

```text
js/ai-board-texture-engine-v1.js
AiBoardTextureEngineV1 1.0.1
```

測試：

```text
tests/e2e/ai-board-texture-engine-v1.spec.js
```

## 公平資訊邊界

分析器只接受呼叫端傳入的公共牌陣列。

允許：

- 已公開公共牌的牌值與花色。

禁止：

- 玩家或對手隱藏底牌。
- 實際牌堆順序。
- 尚未公開的 Turn／River。
- 預定勝負答案。
- 從全域 `state`、DOM、存檔或除錯欄位間接取得未公開資訊。

測試會以讀取即拋錯的 Proxy 暫時取代全域 `state`；分析器仍必須只靠傳入牌面完成分類。

## 輸出欄位

```text
cardCount
乾燥度 dryness
濕潤度 wetness
同花威脅 flushThreat
順子威脅 straightThreat
配對層級 pairedLevel
連接度 connectivity
高張密度 highCardDensity
堅果變動性 nutVolatility
最大同花張數 maxSuitCount
不同牌值數 uniqueRanks
分類標籤 textureTags
publicInformationOnly
```

所有連續分數介於 `0～1`。

`pairedLevel`：

```text
0 = 未配對
1 = 單一 Pair Board
2 = Double-paired Board
3 = Trips Board 或更高重複層級
```

## 第一版標籤

```text
dry
wet
two-tone
three-flush
four-flush
connected
straight-dense
paired
double-paired
trips-board
high-card-heavy
low-board
static
dynamic
```

## 固定驗收牌面

```text
A♠ 7♦ 2♣
→ dry / static

J♠ T♠ 9♦
→ two-tone / straight-dense / dynamic

K♣ K♦ 4♠
→ paired / static

8♥ 7♥ 6♥
→ wet / three-flush / straight-dense / dynamic
```

## 設計限制

這不是 GTO Solver，也不直接決定應該下注多少。

第一版只提供透明、可重現的牌面特徵。下一個獨立 PR 才能把這些特徵接入：

- C-bet 頻率。
- 保護牌需求。
- 半詐唬與純詐唬門檻。
- 多人底池保守程度。
- 價值下注門檻。

不得在分類器內硬寫特定角色行動或特定手牌答案。
