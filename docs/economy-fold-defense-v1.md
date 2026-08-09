# 籌碼經濟與長期棄牌反制 V1

> Current maintenance document. 現行 replacement 參數以 `js/replacement-stack-balance.js` 為單一來源；本文件只描述 Economy/Fold Defense 如何接在其外層。

## 目的

這個模組處理三件事：

1. 一般模式玩家與 AI 使用同一套 replacement 計算來源。
2. 玩家長期低 VPIP／高翻牌前棄牌率時，非 Boss AI 可做有限度公開資訊反制。
3. Gemini Worker 只保留經清理的公開 `tournamentObservation`。

正式模組：

```text
js/economy-fold-defense-v1.js
EconomyFoldDefenseV1 1.1.1
```

## 一般模式 replacement

正式計算不再由 Economy/Fold Defense 自己維護第二套參數，而是委派給：

```text
ReplacementStackBalance.normalConfig
strategy = median-v2
```

現行公式：

```text
min(
  正籌碼桌面中位數 × 80%,
  當前完整買入 × 75%,
  60BB
)
```

另使用 `12BB` soft floor，且最終結果不會高於正籌碼桌面中位數。結果依大盲單位向下取整。

這只影響籌碼歸零後的重新買入／補位；初始六人與一般牌局核心規則不由此模組改寫。

## 挑戰賽 replacement 與舊 Boss catch-up

現行 G1 role min / target / max 由 `ReplacementStackBalance 2.1.0` 定義：

| Tier | min | target | max |
|---|---:|---:|---:|
| Middle | 80BB | 90BB | 100BB |
| Elite | 90BB | 105BB | 120BB |
| Special Boss | 100BB | 115BB | 135BB |
| Gemini | 110BB | 130BB | 150BB |

Economy/Fold Defense 仍保留較早期的 Boss catch-up profile，作為相容層；它只能**提高**既有 base stack，不能把 `ReplacementStackBalance` 算出的 base stack 降低。

`1.1.1` 修正這個邊界：舊 profile 的 Special / Gemini cap（75BB / 90BB）若低於新版 G1 base，會保留新版 base，不再反向壓低進場籌碼。

因此目前 Special Boss / Gemini 的正式進場基準仍以 `ReplacementStackBalance` 為準；catch-up 不構成第二個 G1 source of truth。

## 低 VPIP／高棄牌偵測

至少觀察 `8` 手後，符合任一條件才標記偏緊被動：

```text
VPIP <= 18%
翻牌前棄牌率 >= 70%
```

只記錄玩家每手第一個翻牌前公開行動，不讀取隱藏牌。

## AI 反制方式

反制維持小尺寸、低頻率與角色差異：

- 未開池且位於 HJ／CO／BTN／SB，合格牌力可用約 `2.2～2.4BB` 偷盲。
- 翻牌或轉牌為乾燥牌面、仍有玩家在池內且尚無下注時，可用約 `33～40% pot` 小尺寸施壓。
- Leo、Foxy、Momo、Nova、Vlad 的啟動頻率較高。
- Toto、Pao、Dodo、Bruno 維持較保守性格。
- Oracle、Chronos、Gemini 不由這個通用 pressure layer 接管。

## Gemini 公開觀察接線

Worker 可保留經白名單清理的：

- 各街／位置公開行動率。
- VPIP、棄牌、跟注、加注與 All-in 聚合率。
- 最近公開行動。
- 重複翻牌前 All-in 聚合資訊。
- 已公開攤牌的樣本數與牌力分類計數。

禁止傳遞：

- 對手目前隱藏底牌。
- 實際牌堆順序。
- 未來公共牌。
- 預定勝負結果。
- 未經白名單保留的原始 hidden / revealed card payload。

## 驗證

主要 regression：

```text
tests/e2e/economy-fold-defense-v1.spec.js
tests/e2e/tournament-economy-g1.spec.js
```

涵蓋：

- median-v2 一般模式 replacement。
- 舊 catch-up 的漸進行為。
- **新版 G1 的 100BB Special / 110BB Gemini base 不得被舊 cap 降低。**
- 低 VPIP／高棄牌分類與小尺寸 pressure。
- 公平資訊政策。
- Gemini Worker 公開 observation 清理。

完整驗證仍以 `npm run validate`、Chromium / WebKit E2E、相關 state stress / economy workflow 與正式 Production smoke 為準。
