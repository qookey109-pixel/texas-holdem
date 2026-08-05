# AI V2.7 實戰校準基準

## 目的

AI V2.3～V2.7 已陸續加入開局策略、角色分層、公開 Range、Board／Blocker／Sizing、SPR 與分級多人 Equity。下一階段不應直接繼續疊加策略，而應先建立可重現的行為基準，確認中階與高階差距是否合理。

正式校準實驗室：

```text
tests/support/ai-gameplay-calibration-v2-7.js
AiGameplayCalibrationV27 1.0.0
```

正式 E2E：

```text
tests/e2e/ai-gameplay-calibration-v2-7.spec.js
```

## 執行方式

```bash
npm run test:ai-calibration:v2.7
```

完整 AI 校準：

```bash
npm run test:ai-calibration
```

GitHub Actions 會將 JSON 與 Markdown 報表放入：

```text
ai-calibration-report-<run-id>
```

Artifact 保留 14 天。

## 固定測試矩陣

角色：

- 中階：Ace、Momo、Nori、Bruno、Dodo、Viper。
- 高階：Nova、Unit-9、Merlin、Vlad。

固定種子：

```text
2711, 2717, 2729, 2741, 2753
```

局面：

1. BTN 類型的翻牌前入池／開局機會。
2. 面對公開加注的翻牌前 3-bet 機會。
3. 多人翻牌頂對面對小尺寸下注。
4. 多人轉牌強聽牌面對中尺寸下注。
5. 多人河牌邊緣 bluff catch。
6. 河牌強價值牌面對下注。

共計：

```text
10 roles × 6 scenarios × 5 seeds = 300 decisions
```

## 報表指標

### 翻牌前代理值

- VPIP proxy：固定翻牌前局面中沒有棄牌的比例。
- Open raise proxy：固定開局機會中的加注比例。
- 3-bet proxy：固定面對加注局面中的再加注比例。

這些是固定情境的回歸代理值，不是實際玩家人口的 VPIP／PFR／3-bet，也不能直接解讀為一百手真實頻率。

### 翻牌後

- Raise／Call／Fold／Fallback 比例。
- V2.7 平均 Equity 修正。
- 平均絕對 Equity 修正。
- 最大絕對 Equity 修正。
- 平均 Monte Carlo 樣本數。
- 負期望跟注安全閘、正期望防守恢復與加注 EV 安全閘次數。
- Median／P95／Max 決策時間。

### 公平性

校準期間會：

- 將對手 `cards` 設為會拋錯的 getter。
- 將 `state.deck` 設為會拋錯的 getter。
- 只允許 AI 自己底牌、公共牌、公開行動、下注、位置、籌碼與在局人數。

任何隱藏資訊讀取都會讓測試直接失敗。

## 分級安全門檻

中階：

```text
Equity 最大修正 ±0.065
```

高階：

```text
Equity 最大修正 ±0.115
```

校準必須確認：

- 中階平均樣本數低於高階。
- 中階與高階都低於 Oracle 360／Chronos 480 的 Boss 樣本。
- 中階不會因多人 Equity 直接升級成 Boss。
- 相同公開狀態與固定種子會產生相同動作紀錄。
- 報表中的時間不參與行為一致性比較。

## 使用原則

調整 AI 前，至少比較：

1. 前一版與新版本的固定種子行為紀錄。
2. 中階與高階的平均樣本、動作比例與 Equity 修正。
3. 負期望跟注是否顯著增加或減少。
4. P95 決策時間是否惡化。
5. Browser E2E 與 25／100 手狀態壓力測試是否仍通過。

不得只依一手牌的主觀感受調整全部角色。

## 與真實長跑的關係

V2.7 校準是快速、固定、可比較的策略基準；一般模式 100 手與 G1 補位 State Stress 則負責驗證完整牌局流程、籌碼守恆、合法下注與不卡局。

後續若要取得真正的 VPIP／PFR／3-bet 長跑數據，應建立多種子完整牌局 telemetry，而不是把本文件的 proxy 當成真實手數統計。
