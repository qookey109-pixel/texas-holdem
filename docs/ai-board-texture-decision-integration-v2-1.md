# AI V2.1 Board Texture 決策接線

## 目標

把已驗證的公開牌面分類器接入基礎 `botAction`，但不改下注尺寸模型，也不在分類器內硬寫角色答案。

## 接入範圍

本階段只影響：

- 乾燥牌面的低成本詐唬傾向。
- 濕潤／動態牌面的無支撐詐唬門檻。
- 強成牌與強聽牌的保護牌壓力。
- 多人底池的詐唬、侵略與邊緣跟注收緊。

本階段不影響：

- 翻牌前策略。
- 下注尺寸選擇。
- Range History Chain。
- Blocker／Unblocker。
- Oracle／Chronos 的公平 Equity 引擎。

## 模組

```text
js/ai-board-texture-engine-v1.js
js/ai-postflop-texture-policy-v1.js
js/ai-logic.js
```

`AiPostflopTexturePolicyV1.adjust()` 是純政策函式，只接受呼叫端傳入的：

- 公開牌面分析結果。
- 目前牌力估計。
- 公開可推導的聽牌潛力。
- 活躍對手數。
- 目前需跟注金額。

它不直接讀取全域 `state`。

## 公平資訊限制

禁止使用：

- 對手隱藏底牌。
- 實際牌堆順序。
- 未來公共牌。
- 預定勝負答案。

模組載入失敗時，`botAction` 使用中性調整值，維持原策略，不得切換為任何全知或作弊模式。

## 可觀察輸出

每次基礎 AI 決策會在 `player.lastStrengthEstimate.texture` 記錄：

```text
engineVersion
policyVersion
dryness
wetness
tags
policyTags
strengthDelta
bluffMultiplier
aggressionMultiplier
callMarginDelta
protectionPressure
publicInformationOnly
```

這些欄位只供測試、校準與診斷使用，不包含隱藏牌資訊。

## 驗收情境

- A-7-2 rainbow：乾燥單挑牌面可小幅提高無下注時的詐唬壓力。
- J-T-9 two-tone：沒有強聽牌時降低詐唬與侵略。
- 8-7-6 monotone：強成牌提高保護牌壓力。
- 多人濕潤底池：比單挑更緊，降低詐唬與邊緣跟注。
- Proxy 公平測試：政策函式不得讀取全域遊戲狀態。
