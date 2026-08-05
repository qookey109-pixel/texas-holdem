# AI V2.2 Range Weight V1

## 目標

把已合併的 Range Filter 診斷轉成可正規化的逐 Combo 權重，仍不接入正式決策。

## 模組

```text
js/ai-range-weight-v1.js
AiRangeWeightV1 1.0.0
```

## 能力

- 建立完整 52 張牌與 1,326 組兩張牌 Combo。
- 依 AI 自己底牌與已公開公共牌移除不可能 Combo。
- 依公開位置、Range Width、Range Strength、公開行動與下注尺寸產生權重。
- 將所有可用 Combo 權重正規化為 1。
- 輸出逐 Combo Top List 與 169 類起手牌彙總。
- 同一輸入產生可重現結果。

## 公平資訊限制

允許：

- AI 自己底牌。
- 已公開公共牌。
- 公開行動歷史。
- 公開位置、底池與下注尺寸。

禁止：

- 目標對手隱藏底牌。
- 實際牌堆順序。
- 未來公共牌。
- 預定勝負答案。

## 本階段不包含

- 不使用目標對手底牌移除 Combo。
- 不做翻牌後牌型百分位排序。
- 不接入 `botAction()`。
- 不接入 `AiMultiwayRangeModel` 或 Boss Equity。
- 不改 Call、Raise、Fold、下注尺寸與角色強度。

所有輸出均標示：

```text
decisionIntegrated: false
```

## 驗收

- 52 張牌、1,326 Combo、無重複。
- 已知 5 張牌時可用 Combo 為 C(47,2)=1,081。
- 權重總和為 1。
- 窄且侵略的公開線比寬且被動的線有更高加權牌力。
- 同一輸入結果完全一致。
- 隱藏資訊 getter 防護。
