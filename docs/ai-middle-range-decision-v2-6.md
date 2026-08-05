# AI V2.6 中階公開 Range 決策

## 目的

讓 AI 強度從中階開始更明顯提升，但不把六位中階角色直接複製成高階角色。

正式模組：

```text
js/ai-middle-range-decision-v2-6.js
AiMiddleRangeDecisionV26 2.6.0
```

完整決策鏈：

```text
js/ai-mid-elite-decision-chain-v2-5.js
AiMidEliteDecisionChainV26 2.6.0
```

## 支援角色

```text
Ace
Momo
Nori
Bruno
Dodo
Viper
```

不套用：

- 初階 Leo、Toto、Foxy、Wolf、Pao、Shark。
- 高階 Nova、Unit-9、Merlin、Vlad；高階仍使用 V2.4 完整 Range 修正。
- Oracle、Chronos 與 Gemini。

## 中階與高階的差異

中階會使用與高階相同來源的公開 Range 訊號，但限制更嚴格：

- 只在翻牌後啟用。
- 公開樣本不足時完全不套用推測。
- Call 分數修正限制在 `-0.075～+0.035`。
- Raise 分數修正限制在 `-0.085～+0.045`。
- 不會像高階一樣主動把過牌／跟注轉成新的價值加注。
- Bluff Catch 需要更高公開樣本、較好的價格與較明確詐唬訊號。

高階 V2.4 的修正上限仍較大，並保留完整 Combo Range 壓力、價值捕捉與更積極剝削。

## 公開樣本門檻

每位角色有不同最低信心：

```text
Momo 0.28
Ace 0.30
Viper 0.30
Bruno 0.32
Nori 0.34
Dodo 0.38
```

Range Evidence 由以下公開資訊形成：

- 跨街 Range 診斷信心。
- 對手公開加注次數。
- 對手公開跟注次數。
- Range 寬度、牌力、Nut Density 與 Bluff Density。

Evidence 低於門檻時，原決策保持不變並標記：

```text
middleRangeDecisionSkipped: insufficient-public-sample
```

## 角色差異

- Ace：平衡型，適度依 Range 收緊 Call。
- Momo：較願意攻擊被封頂 Range，也較能進行保守 Bluff Catch。
- Nori：需要較可靠樣本才調整，偏風險控制。
- Bruno：價值導向，強 Range 前更常取消低品質詐唬。
- Dodo：最重視公開 Range 壓力，邊緣大額 Call 最保守。
- Viper：保留剝削性，面對被封頂 Range 仍可施壓。

## 正式決策順序

翻牌後的中階完整決策鏈：

```text
V1.5 多人公開範圍
→ V2.6 中階 bounded Range
→ 淨 EV
→ 角色強度校準
→ V2.5 Board／Blocker／Sizing
→ 有效籌碼與 SPR
```

高階則維持：

```text
V1.5 多人公開範圍
→ V2.4 高階 Combo Range
→ 淨 EV
→ 角色強度校準
→ V2.5 Board／Blocker／Sizing
→ 有效籌碼與 SPR
```

翻牌前仍交回原本的位置化 Range、開局風險控制、合法加注與重複 All-in 防守鏈。

## 公平資訊限制

允許：

- AI 自己底牌。
- 已公開公共牌。
- 公開位置。
- 公開下注與行動歷史。
- 公開籌碼、底池與有效對手數。

禁止：

- 對手隱藏底牌。
- 實際牌堆順序。
- 未來公共牌。
- 預定勝負答案。

## 驗收

新增：

```text
tests/e2e/ai-middle-range-decision-v2-6.spec.js
```

並更新：

```text
tests/e2e/ai-mid-elite-decision-chain-v2-5.spec.js
```

驗證項目：

- 只支援六位中階角色。
- 強且窄的公開 Range 會收緊邊緣大額 Call。
- 弱且寬的 Range 仍可保留合理防守。
- 公開樣本不足時不套用推測。
- 翻牌前不套用 V2.6。
- 強 Range 會取消低品質純詐唬。
- 中階修正幅度小於高階。
- 完整決策鏈在淨 EV 與 Board Intelligence 前套用中階 Range。
- 對手隱藏 `cards` getter 不會被讀取。
- 初階、Boss 與 Gemini 不受改寫。