# AI V1.9 Boss 校準與發布基準

## 目的

AI V1.9 已完成以下正式改動：

- 初階連續牌力與 Pot 相對下注尺寸。
- Call／Raise 淨 EV 會計。
- 有效籌碼與 SPR。
- 連續 All-in 單一調整鏈。
- Oracle／Chronos 河牌單挑精確枚舉。
- 真正多人聯合 Equity 模擬。
- 新 Equity 引擎失敗時回退既有公平 Boss。

本校準層不直接改動 AI 參數。它建立可重現的數據基準，之後若調整門檻、樣本數、詐唬率或下注尺寸，可以比較改動前後的行為，而不是只憑體感判斷。

## 測試檔案

```text
tests/support/ai-calibration-lab-v1-9.js
tests/e2e/ai-calibration-v1-9.spec.js
```

校準器只在測試時載入，正式網站不會下載或執行。

完整 AI 校準會同時執行：

```text
AI V1.6：10 位中高階角色的翻牌前／翻牌後矩陣
AI V1.9：Oracle／Chronos 的公平 Equity、行動分布與耗時
```

## 固定種子

V1.9 預設種子：

```text
1904
```

同一版本、種子、輸入與迭代次數必須產生相同的 deterministic fingerprint。

耗時數字不納入 fingerprint，因為 CI 與本機硬體速度不同；行動分布、Equity、方法、樣本數與 fallback 狀態會納入。

## 固定情境

Oracle 與 Chronos 都會測試：

1. 河牌堅果面對下注。
2. 翻牌超對多人底池。
3. 轉牌堅果同花聽牌。
4. 河牌頂對 Bluff Catch。

每個情境輸出：

- Fold／Check／Call／Raise 比例。
- 平均 Equity。
- Equity 計算方法。
- Monte Carlo 樣本數。
- Legacy fallback 次數。
- 決策耗時中位數、P95 與最大值。

這些頻率只作為回歸與調參基準，不宣稱為 GTO 或 solver 解答。

## Equity 驗證

### 河牌單挑

已知牌：Boss 兩張底牌加五張公共牌。

```text
52 - 2 - 5 = 45 張未知牌
C(45, 2) = 990 組
```

校準必須確認：

```text
method = exact-river-heads-up
combinations = 990
```

### 多人底池

多人情境必須使用：

```text
method = joint-multiway-monte-carlo
```

正式樣本數：

```text
Oracle  = 360
Chronos = 480
```

同一次模擬會聯合抽取所有對手底牌與未發公共牌，不再用單挑勝率減固定多人扣分。

## 公平資訊探針

測試會把對手 `cards` 設成一旦讀取就拋錯的 getter。

校準仍必須完成，並確認：

```text
hiddenOpponentCardRead = false
publicInformationOnly = true
```

允許：

- Boss 自己的底牌。
- 已公開公共牌。
- 公開未棄牌人數。
- 公開下注、位置與聚合玩家統計。

禁止：

- 對手隱藏底牌。
- 實際牌堆順序。
- 未來公共牌答案。
- 預定勝者。

## 執行方式

完整 AI 校準：

```bash
npm run test:ai-calibration
```

只執行舊 V1.6：

```bash
npm run test:ai-calibration:v1.6
```

只執行 Boss V1.9：

```bash
npm run test:ai-calibration:v1.9
```

V1.9 測試預設不加入一般 Chromium／WebKit E2E 的耗時路徑；只有設定 `AI_V19_CALIBRATION=1` 或使用上述 npm 指令時才執行。

## GitHub Actions

Workflow：

```text
.github/workflows/ai-calibration.yml
```

會在 AI／Boss／校準檔案相關 Pull Request 及手動執行時：

1. 安裝 Node.js 22 與鎖定依賴。
2. 安裝 Chromium。
3. 執行 AI V1.6 與 V1.9 固定種子校準。
4. 上傳 Playwright HTML 報表與附件。

附件包括：

```text
ai-calibration-v1-6.json
ai-calibration-v1-6.md
ai-calibration-v1-9.json
ai-calibration-v1-9.md
```

Artifact 保存 14 天。

## 驗收原則

校準必須確認：

- 相同種子的 deterministic fingerprint 完全一致。
- 河牌單挑完整枚舉 990 組。
- Oracle 多人模擬 360 次。
- Chronos 多人模擬 480 次。
- 所有行動比例介於 0 與 1，且總和為 1。
- 所有固定情境都沒有 legacy fallback。
- 不讀取對手隱藏底牌。
- 校準能在測試上限內完成，沒有卡死。

耗時應記錄與比較，但第一版不設過度嚴格的毫秒門檻。只有出現明顯退化、超時或玩家端卡頓證據時，再建立獨立效能修正 PR。

## 後續使用方式

進入 AI V2.0 前，先保存此版本報表作為基準。

後續調整以下功能時，都應附上改動前後報表：

- Position-aware Range。
- Board Texture Engine。
- Range-level MDF 與詐唬頻率。
- Blocker 權重。
- Boss Monte Carlo 樣本與提前停止策略。
- 角色侵略率、價值下注率與 Bluff Catch 門檻。

不得為了讓報表數字好看，直接硬寫固定答案或重新加入任何全知資訊。
