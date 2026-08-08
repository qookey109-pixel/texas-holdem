# Poker Economy OODA Long-Run Runner V1

## 目的

用現有 full-hand poker telemetry lab 評估一般模式重新買入政策，而不先修改正式 `ReplacementStackBalance`。

正式基準維持 Normal Economy V2：

```text
table median ratio = 80%
buy-in cap = 75%
soft floor = 12BB
max = 60BB
```

V1 候選：

```text
80/75
85/75
80/85
85/85
```

其中第一個數字是牌桌正籌碼中位數比例，第二個數字是完整 Buy-in 上限比例。

## 架構

Runner 不建立第二套牌局模擬器。它直接重用：

```text
tests/support/ai-long-run-telemetry-v2-9.part-1..4
js/replacement-stack-balance.js
js/economy-fold-defense-v1.js
```

測試專用 adapter：

```text
tests/support/poker-economy-ooda-v1.js
```

只在 Playwright 測試頁面生命週期內覆寫 normal replacement 計算與 AI replacement wrapper。正式 `normalConfig` 不修改，G1 淘汰賽不進入此實驗。

Full-hand 接線：

```text
tests/e2e/poker-economy-ooda-v1.spec.js
```

每個 shard 會輸出既有 full-hand telemetry，另外加入 `economyOoda`：

- 候選參數。
- 正式設定快照。
- `productionConfigUnchanged`。
- AI replacement events / seats。
- 平均、最低、最高 entry BB。
- replacement 前 table median BB。
- fairness boundary。

## OODA

評估器：

```text
scripts/evaluate-poker-economy-ooda-v1.mjs
```

### Observe

收集：

- 完成手數、shards、deterministic fingerprints。
- state failures / scheduler errors。
- fairness / telemetry integrity。
- production config mutation guard。
- replacement depth。
- aggregate role BB/100 與 bust rate。

### Orient

硬 gate：

- 所有 hands 完成。
- 無 state / scheduler error。
- public-information fairness 通過。
- telemetry integrity 通過。
- 正式設定沒有被改動。
- replacement 不超過 60BB。
- 至少 5 個 active roles。

### Decide

Smoke 或小樣本只允許升級到下一證據階段，不允許直接推薦正式參數。

### Act

V1 永遠輸出：

```text
productionChange = none
automaticPromotion = false
```

任何正式 economy 修改必須另開正常 PR，並重新通過完整驗證。

## 分階段長跑

Workflow：

```text
.github/workflows/poker-economy-ooda.yml
```

Pull Request 自動執行 smoke：

```text
25 hands × 1 shard × 4 candidates
```

手動 workflow dispatch 可升級：

```text
smoke    25 hands × 1 shard / candidate
screen  100 hands × 2 shards / candidate
deep    250 hands × 4 shards / candidate
evidence 1000 hands × 10 shards / candidate
```

每個 candidate / shard 使用相同 base seed 與 shard 規則，讓比較可重現。

## 本機命令

單一 baseline smoke：

```bash
npm run test:economy-ooda:smoke
```

自訂 shard：

```bash
POKER_ECONOMY_OODA=1 \
POKER_ECONOMY_OODA_POLICY=85-85 \
POKER_ECONOMY_OODA_STAGE=screen \
POKER_ECONOMY_OODA_HANDS=100 \
POKER_ECONOMY_OODA_SHARD=0 \
POKER_ECONOMY_OODA_SHARD_COUNT=2 \
npm run test:economy-ooda:shard
```

彙整：

```bash
node scripts/evaluate-poker-economy-ooda-v1.mjs economy-ooda-results economy-ooda-summary
```

## 非目標

- 不改 G1。
- 不改正式盲注。
- 不改 AI 策略。
- 不自動把勝出候選寫回 production。
- 不因短期 BB/100 波動直接調參。
