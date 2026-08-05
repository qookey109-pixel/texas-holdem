# AI V2.4 高階 Combo Range 決策接線

## 目的

把 AI V2.2 已建立的 1,326 Combo 公開範圍權重，正式接入高階角色的 Call、Fold 與 Bluff 決策。

本階段只支援：

```text
Nova
Unit-9
Merlin
Vlad
```

中階、初階、Oracle、Chronos 與 Gemini 維持既有決策，避免整體難度一次跳升。

## 正式模組

```text
js/ai-range-decision-integration-v2-4.js
AiRangeDecisionIntegrationV24 2.4.0
```

## 使用方式

每次高階 AI 決策時，模組會：

1. 從仍在牌局中的公開玩家選擇主要對手；玩家仍在牌局時優先分析玩家。
2. 讀取公開位置、下注、行動歷史與街道。
3. 使用 `AiRangeHistoryFilterV1` 建立跨街範圍診斷。
4. 使用 `AiRangeWeightV1` 對可用 Combo 正規化加權。
5. 把加權範圍轉成保守的 Range Pressure、Bluff Signal 與 Capped Signal。
6. 只修正邊緣 Call、純詐唬與少量價值捕捉，不把 Preflop Combo 強度冒充精確 Postflop Equity。

## 角色差異

- Nova：保留不規則壓力，對 Range 的修正幅度較低。
- Unit-9：最重視 Range Pressure 與價格，防守調整最精準。
- Merlin：延遲施壓仍保留，但強範圍前會收斂純詐唬。
- Vlad：更重視公開詐唬密度與被封頂範圍，保留剝削式 Bluff Catch。

## 決策原則

- 強且窄的公開範圍：降低邊緣跟注與低成功率詐唬。
- 弱且寬、偏被動的公開範圍：保留合理 Bluff Catch 與價值捕捉。
- 已成立的價值下注：不因對手 Range 強而直接取消。
- 強聽牌：仍可依既有 V1.5 多人底池與 SPR 規則繼續。
- 所有修正均有上下限，避免單一診斷值主宰全部決策。

## 公平資訊限制

允許：

- AI 自己底牌。
- 已公開公共牌。
- 公開位置。
- 公開下注與行動歷史。
- 公開未棄牌玩家、籌碼與當前下注。

禁止：

- 對手隱藏底牌。
- 實際牌堆順序。
- 未來公共牌。
- 預定勝負答案。

## 驗證

新增：

```text
tests/e2e/ai-range-decision-v2-4.spec.js
```

驗收項目：

- 只支援四位高階角色。
- 強窄範圍會讓邊緣跟注棄牌。
- 弱寬範圍仍可合理繼續。
- 強範圍會取消低成功率純詐唬。
- 已成立的價值加注仍保留。
- 對手 `cards` getter 設為拋錯時仍可完成，確認沒有讀取隱藏底牌。
- 中階角色不會被 V2.4 改寫。
