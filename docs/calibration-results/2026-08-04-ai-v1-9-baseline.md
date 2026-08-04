# AI V1.9 固定種子校準基準（修正前）

執行日期：`2026-08-04`

Pull Request：`#78`

Workflow run：`30927098667`

Artifact：`ai-calibration-report-30927098667`

固定種子：`1904`

每個固定情境迭代：`4`

## 版本

```text
Boss integration: 1.0.0
Equity engine:   1.0.1
EV accounting:   1.0.0
Fair Boss:       2.0.0
```

## 驗證通過

- 相同種子 deterministic fingerprint 完全一致。
- 河牌單挑使用 `exact-river-heads-up`。
- 河牌完整枚舉 `990` 組。
- Oracle 多人模擬 `360` 次。
- Chronos 多人模擬 `480` 次。
- 對手隱藏底牌 getter 沒有被讀取。
- 所有固定情境 legacy fallback 次數為 `0`。
- 完整 V1.6 + V1.9 Chromium 校準通過。

## Equity probes

| Probe | Method | Samples / combinations | Equity |
| --- | --- | ---: | ---: |
| River heads-up | exact-river-heads-up | 990 | 1.000000 |
| Oracle multiway | joint-multiway-monte-carlo | 360 | 0.627778 |
| Chronos multiway | joint-multiway-monte-carlo | 480 | 0.645833 |

## 行動分布

| Character | Scenario | Fold | Check | Call | Raise | Avg equity | Median ms | P95 ms | Fallback |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Oracle | 河牌堅果面對下注 | 0% | 0% | 100% | 0% | 0.9990 | 133.9 | 156.4 | 0 |
| Oracle | 翻牌超對多人底池 | 0% | 0% | 100% | 0% | 0.6486 | 74.5 | 86.7 | 0 |
| Oracle | 轉牌堅果同花聽牌 | 0% | 0% | 75% | 25% | 0.2616 | 28.8 | 44.3 | 0 |
| Oracle | 河牌頂對抓詐唬 | 0% | 0% | 100% | 0% | 0.8646 | 63.5 | 87.1 | 0 |
| Chronos | 河牌堅果面對下注 | 0% | 0% | 100% | 0% | 0.9990 | 69.8 | 86.7 | 0 |
| Chronos | 翻牌超對多人底池 | 0% | 0% | 100% | 0% | 0.6669 | 64.5 | 77.7 | 0 |
| Chronos | 轉牌堅果同花聽牌 | 0% | 0% | 100% | 0% | 0.2468 | 39.7 | 49.7 | 0 |
| Chronos | 河牌頂對抓詐唬 | 0% | 0% | 100% | 0% | 0.8646 | 62.5 | 94.8 | 0 |

完整兩次校準的瀏覽器計算時間：

```text
約 6.9 秒（Playwright test duration）
單次 report totalMs：約 2,459.4 ms
```

## 發現：Raise EV 低估對手跟注後底池

這份報表不是「理想行為答案」。它暴露出一個需獨立修正的 EV 會計問題：

```text
Oracle／Chronos 河牌堅果面對下注：100% Call、0% Raise
```

目前 `AiEvAccountingV1.raiseEv()` 的 called branch 使用：

```text
investment = callAmount + raiseBy
finalPot   = pot + investment
```

這只把 AI 自己新增的 Call + Raise 放進最終底池，沒有把至少一名對手跟注加注時補進來的 `raiseBy` 計入。

因此強價值牌的 Raise EV 會被系統性低估，甚至略低於 Call EV，導致價值加注被降級成跟注。

正確的單一跟注者保守基準應至少包含：

```text
investment = callAmount + raiseBy
opponentCallContribution = raiseBy
finalPot = pot + investment + opponentCallContribution
```

多人跟注模型可在後續再加入預期跟注者數量；第一階段先以一名跟注者作為保守且維度正確的基準。

## 後續修正驗收

Raise EV 修正應放在獨立 PR，並至少確認：

- Call EV 公式維持不變。
- Raise EV called branch 加入對手跟注 raise 的貢獻。
- 河牌堅果 Raise EV 明顯高於 Call EV。
- Oracle／Chronos 堅果情境不再固定 100% 跟注。
- 不直接提高侵略率或硬寫堅果必加注。
- V1.6、V1.9、Static、Chromium、WebKit 全部通過。
- 保存修正後報表與本文件對照。

本文件保留修正前數字，不能在修正後覆蓋；後續應新增另一份 `post-fix` 結果。
