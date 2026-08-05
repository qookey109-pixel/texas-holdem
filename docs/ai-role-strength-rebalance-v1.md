# AI 角色強度重新分級 V1

## 目標

讓角色星級、實際決策穩定度與玩家感受到的難度一致，同時保留每位角色原本的個性。

本次不把所有角色調成同一種「高侵略」打法。強度主要由以下因素組成：

- 決策誤差幅度。
- 負 EV 跟注的控制能力。
- 正 EV 加注線的辨識能力。
- 詐唬頻率是否符合角色設計。
- 情緒與侵略參數的穩定程度。

## 模組

```text
js/ai-role-strength-balance-v1.js
AiRoleStrengthBalanceV1 1.0.0
```

## 強度表

| 角色 | 評分 | 星級 | 分層 |
|---|---:|---:|---|
| Toto | 18 | 1 | 初階 |
| Pao | 22 | 1 | 初階 |
| Leo | 30 | 2 | 初階 |
| Foxy | 34 | 2 | 初階 |
| Wolf | 42 | 3 | 初階 |
| Shark | 48 | 3 | 初階 |
| Dodo | 46 | 3 | 中階 |
| Momo | 52 | 4 | 中階 |
| Ace | 56 | 4 | 中階 |
| Bruno | 58 | 4 | 中階 |
| Nori | 60 | 4 | 中階 |
| Viper | 66 | 5 | 中階 |
| Nova | 74 | 6 | 高階 |
| Merlin | 78 | 6 | 高階 |
| Unit-9 | 82 | 6 | 高階 |
| Vlad | 86 | 6 | 高階 |
| Oracle | 91 | 7 | 特殊 Boss |
| Chronos | 94 | 7 | 特殊 Boss |
| Gemini | 98 | 7 | Final Boss |

## 設計重點

### 初階角色

初階角色保留明顯、可觀察、可利用的漏洞：

- Toto 過度保守、詐唬不足。
- Pao 跟注過多、主動進攻不足。
- Leo 容易過度施壓。
- Foxy 容易過度詐唬。
- Wolf 開始具備位置紀律。
- Shark 是初階區最後一道門檻，決策穩定度明顯提高。

### 中階角色

中階角色開始使用角色專屬策略與多街判斷，但強度仍有差異：

- Dodo 保留過度控制底池與偏緊漏洞，因此為 3 星。
- Momo、Ace、Bruno、Nori 為不同風格的 4 星角色。
- Viper 的 Check-Raise、陷阱與後街壓力更完整，提升為 5 星。

### 高階角色

高階角色不靠偷看隱藏資訊，而是：

- 決策誤差更低。
- 更少執行低品質 Raise。
- 更容易保留正 EV Call。
- 更穩定地選擇公開資訊下較佳的 Raise 候選。

Unit-9 與 Vlad 的評分高於 Nova，但仍同屬 6 星高階區，避免 UI 星級過度細碎。

### 特殊 Boss 與 Gemini

本模組只登記其強度與診斷資料，不改寫公平 Equity 或後端 Gemini 決策。

Oracle、Chronos 仍必須由公平 Boss 模組限制：

- 不讀取對手隱藏底牌。
- 不讀取實際牌堆順序。
- 不預知未來公共牌。
- 不使用預定勝負答案。

## 校準方式

`decisionSignals()` 只使用：

- 角色名稱。
- 手牌編號。
- 目前街道。
- 公開位置。
- 公開底池。
- 公開跟注金額。
- 公開最高下注。
- 活躍對手數。

它會產生可重現的微小決策誤差，不需要讀取任何隱藏牌資料。

## 策略接線

角色專屬策略的基礎 Decision 會加入：

```text
rawCallScore
rawRaiseScore
callScore
raiseScore
roleStrength
```

只有邊緣決策會被重新校準：

- 明顯負 EV 的 Call 可改為 Fold。
- 明顯正 EV 的邊緣 Fold 可保留 Call。
- Value 或合格 Bluff 遇到更佳 Raise 候選時可改為 Raise。
- 缺乏 Value／Bluff 支撐的低品質 Raise 可取消。

## 不包含

本次不處理：

- 籌碼初始分配。
- 淘汰賽補位籌碼。
- 盲注速度。
- Range History Chain。
- 新下注尺寸模型。
- Blocker 新功能。
- Gemini 後端 Prompt。

## 驗收

```text
tests/e2e/ai-role-strength-balance-v1.spec.js
```

驗收包含：

- 19 位角色都有獨立評分與星級。
- 強度越高，決策誤差幅度越低。
- 原本的角色個性差異仍存在。
- 策略 Decision 會留下透明校準資料。
- 純校準函式不讀取隱藏底牌、牌堆或未來公共牌。
