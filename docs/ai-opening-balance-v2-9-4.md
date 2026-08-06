# AI V2.9.4 Opening Balance & Telemetry Integrity

## 目的

V2.9.3 修復中階與菁英翻牌前路由後，25,000 手正式資料仍顯示四位初階角色過度鬆散：

| 角色 | VPIP | PFR | BB/100 |
|---|---:|---:|---:|
| Toto | 59.5% | 13.2% | -77.62 |
| Foxy | 64.5% | 30.0% | -97.29 |
| Leo | 63.5% | 29.9% | -121.03 |
| Wolf | 65.1% | 22.8% | -145.83 |

同一份報告的 WTSD 也包含翻牌前已 All-in、之後僅自動發完公共牌的牌局，因此不能直接解讀為翻牌後一路跟到攤牌。

## 策略範圍

正式模組：

```text
js/ai-opening-balance-v2-9-4.js
AiOpeningBalanceV294 2.9.4
```

只接管：

- Toto
- Foxy
- Leo
- Wolf

不修改：

- Pao、Shark 的 V2.9.2 實證校準
- 中階與菁英的 V2.9.3 路由
- Oracle、Chronos 的公平 Boss 引擎
- 角色難度評分

## 角色差異

- Toto：仍可用合理價格跟注，但弱牌進池與河牌支付受到上限保護。
- Foxy：保留 BTN／CO／HJ 的條件詐唬，取消面對壓力時的低權益再加注。
- Leo：保留主動價值加注，收緊弱邊緣牌的高成本進攻。
- Wolf：維持位置施壓，但使用四位中最嚴格的跟注與河牌支付門檻。

所有判斷只使用自己的底牌、公共牌、公開位置、公開下注、可見籌碼與公開對手數量。

## WTSD 新定義

正式完整報告的 WTSD 改為：

```text
postflopShowdownHands / showdownEligibleHands
```

其中 `showdownEligibleHands` 為：

- 確實看到翻牌；
- 翻牌前尚未 All-in；
- 因此具有翻牌後決策機會的牌局。

另保留：

- `legacyWtsd`：舊公式，便於版本比較。
- `preflopAllInShowdownHands`：翻牌前 All-in 後進入攤牌的牌局。
- `postflopFoldHands`：翻牌、轉牌或河牌棄牌的牌局。
- W$SD：仍以所有真實攤牌計算，不排除翻牌前 All-in。

## 驗證

Pull Request：

- 2 shards × 25 hands smoke。
- Chromium 與 WebKit E2E。
- V2.9.2 runtime coverage 與公平性閘保留。
- V2.9.4 targeted decisions、fallback 與公開資訊閘。
- WTSD 計數不變量。

合併後：

- 50 shards × 500 hands，共 25,000 手。
- 四位角色各自檢查 VPIP、PFR 與 corrected WTSD 合理區間。
- smoke 僅驗證路由與計數，不作為最終平衡結論。
