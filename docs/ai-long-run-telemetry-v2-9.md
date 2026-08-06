# AI V2.9 長跑實證遙測

## 目的

AI V2.8 已把專案內部目標難度調整為：

- 初階 `6.6～7.5`
- 中階 `8.0+`
- 高階 `9.0+`
- Oracle `9.6`
- Chronos `9.8`

V2.9 不再增加新的策略包裝層，而是使用真實牌局引擎、真實下注流程與固定種子，建立可重現的長跑證據。任何角色升到 `10.0` 都必須先通過這套證據，而不是只修改顯示數字。

## 正式檔案

```text
tests/support/ai-long-run-telemetry-v2-9.js
tests/e2e/ai-long-run-telemetry-v2-9.spec.js
scripts/aggregate-ai-long-run-telemetry-v2-9.mjs
.github/workflows/ai-long-run-telemetry.yml
```

## 完整規模

完整模式採：

```text
50 shards × 500 hands = 25,000 hands
```

每個 shard：

- 使用獨立固定 seed。
- 輪替本地 18 位角色的開局順序。
- 使用 5 種玩家基準打法之一。
- 關閉重複 DOM 重繪與純視覺動畫。
- 保留真正的牌組、下注、合法行動、主池／邊池、攤牌、AI 決策與籌碼結算。
- 使用虛擬計時器驅動真正的 AI 行動回呼，不建立第二套假撲克引擎。

5 種玩家基準：

```text
tight
balanced
loose-aggressive
calling
pressure
```

這些基準不是拿來宣稱 AI 對所有真人都能獲利，而是讓每位 AI 面對不同公開行為與不同剝削條件。

## 主要指標

每位角色會產出：

```text
Hands
VPIP
PFR
Open raise
3-bet
Fold to 3-bet
C-bet
Fold to C-bet
Check-raise
WTSD
W$SD
WWSF
Negative-EV call rate
Sizing distribution
BB/100
BB/100 95% confidence interval
```

另外保留：

- 各玩家基準打法下的分組結果。
- 每條街的 Fold／Check／Call／Raise／All-in 次數。
- 角色 Bust 次數。
- 完整 shard seed 與 deterministic fingerprint。
- 籌碼守恆、牌張唯一、合法 Actor、非負籌碼與計時器錯誤。

## 評分規則

長跑報表不會自動修改正式角色評分。

Oracle／Chronos 進入 `10.0` 人工審查至少需要：

- 該角色至少 `5,000` 手有效樣本。
- 覆蓋全部 5 種玩家基準。
- 公平資訊邊界完整通過。
- Negative-EV call rate 不高於 `3%`。
- BB/100 的 95% 信賴區間下界高於 `0`。

即使全部通過，也只標記為：

```text
eligible for manual 10.0 review
```

不會由 workflow 自動改成 `10.0`。

## 公平邊界

長跑會再次檢查：

- `omniscient` 角色清單必須為空。
- 不允許隱藏對手底牌。
- 不允許實際牌堆順序。
- 不允許未來公共牌答案。
- 不允許預定勝負。

長跑本身只統計既有公開決策結果，不向 AI 提供額外資訊。

## GitHub Actions

Pull Request：

```text
2 shards × 25 hands = 50-hand smoke
```

手動 `smoke`：

```text
2 shards × 50 hands = 100 hands
```

手動 `full` 或每週排程：

```text
50 shards × 500 hands = 25,000 hands
```

每個 shard 上傳 JSON／Markdown；最後由 aggregator 合併成：

```text
ai-long-run-telemetry-v2-9.json
ai-long-run-telemetry-v2-9.md
```

完整報表會放入 GitHub Actions artifact，並同步寫入 workflow summary。

## 本機指令

單一 smoke shard：

```bash
npm run test:ai-long-run:smoke
```

自訂 shard：

```bash
AI_LONG_RUN_TELEMETRY=1 \
AI_LONG_RUN_HANDS=500 \
AI_LONG_RUN_SHARD=0 \
AI_LONG_RUN_SHARD_COUNT=50 \
npm run test:ai-long-run:shard
```

合併已下載的 shard：

```bash
npm run aggregate:ai-long-run -- telemetry-shards telemetry-summary
```

## 解讀限制

- 25,000 手是第一個實證門檻，不代表已達到線上現金桌 solver 等級。
- BB/100 只代表對這 5 種固定玩家基準的結果。
- 角色之間不一定直接互相對戰到相同樣本量。
- Gemini 後端不屬於這次本地 18 位角色長跑；Gemini 仍由獨立後端 Smoke、契約與淘汰賽測試驗證。
- 淘汰賽生存率與淘汰順序應在後續獨立 Tournament Telemetry 階段處理，避免把現金桌 BB/100 和淘汰賽 ICM 混在同一分數。
