# AI V2.5 中階後牌面智慧強化

## 目的

從中階角色開始提高 AI 的實戰判斷，初階六位仍保留較友善的學習難度。

正式模組：

```text
js/ai-board-intelligence-v2-5.js
AiBoardIntelligenceV25 2.5.0
```

## 支援角色

### 中階

```text
Ace
Momo
Nori
Bruno
Dodo
Viper
```

### 高階

```text
Nova
Unit-9
Merlin
Vlad
```

初階 Leo、Toto、Foxy、Wolf、Pao、Shark 不套用 V2.5。
Oracle、Chronos 與 Gemini 維持既有公平 Boss／Provider 決策鏈。

## 統一 Board Texture

中階與高階角色使用同一份公開牌面分析：

- 乾燥度與濕潤度。
- 同花密度與四同花牌面。
- 順子連接性。
- 配對、雙配對與三條公共牌。
- Broadway 密度。
- Turn／River 新牌造成的動態變化。

同一份客觀分析會依角色設定產生不同反應，不會讓所有 AI 採用同一條線。

## Blocker／Unblocker

只使用 AI 自己底牌與已公開公共牌，分析：

- Nut Flush Blocker。
- King／Queen Flush Blocker。
- Straight／Nut Straight Blocker。
- Top Pair、Second Pair 與配對公共牌 Blocker。
- 詐唬品質。
- Bluff Catch 的未阻擋詐唬牌訊號。
- 價值下注時是否保留對手可跟注組合。

## 中階強化

中階 AI 從本版本開始會：

- 在動態濕潤牌面收緊大尺寸邊緣跟注。
- 缺少關鍵 Blocker 時取消低品質純詐唬。
- 持有重要 Blocker 時保留部分極化線。
- 依乾濕牌面與 Unblocker 調整價值下注尺寸。
- 仍保留 Ace、Momo、Nori、Bruno、Dodo、Viper 的不同性格。

中階不使用精確 Solver，也不取得高階 V2.4 的完整 Combo Range 修正。

## 高階強化

高階角色會先使用 V2.4 公開 Combo Range，再接入 V2.5：

```text
V1.5 多人公開範圍
→ V2.4 Combo Range 決策
→ V2.5 Board／Blocker／Sizing
```

因此高階 AI 會同時考慮：

- 對手公開 Range。
- 當前牌面與 Runout。
- 自己的 Blocker／Unblocker。
- 價值、半詐唬與純詐唬的合理尺寸。

## 公平資訊限制

允許：

- AI 自己底牌。
- 已公開公共牌。
- 公開位置、下注與行動。
- 公開底池、籌碼與有效對手數。

禁止：

- 對手隱藏底牌。
- 實際牌堆順序。
- 未來公共牌。
- 預定勝負答案。

## 驗收

新增：

```text
tests/e2e/ai-board-intelligence-v2-5.spec.js
```

驗證：

- 只支援六位中階與四位高階角色。
- 乾燥與動態連接牌面可正確區分。
- 缺少 Blocker 時取消中階純詐唬。
- Nut Flush Blocker 可保留合理極化線。
- 中階在濕潤動態牌面收緊大尺寸邊緣 Call。
- 高階厚價值依牌面採用較大尺寸。
- 初階與 Boss 不受 V2.5 改寫。
- 不讀取對手隱藏底牌。
