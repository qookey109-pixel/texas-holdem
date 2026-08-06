# AI V2.8 分級策略強化

## 目標

AI V2.8 不以單純修改顯示分數代替策略品質，而是在既有 V2.7、公平 Boss、EV、SPR、Range、Board／Blocker 與籌碼經濟層之上，新增單一最外層的分級決策執行器。

正式模組：

```text
js/ai-tier-strategy-v2-8.js
AiTierStrategyV28 2.8.0
```

## 目標評分

評分採 10 分制，是專案內部的「目標難度／決策品質級距」，不是 GTO solver 勝率保證，也不能只靠標示數字證明達標。

| 層級 | 目標 |
|---|---:|
| 初階 | 6.6～7.5 |
| 中階 | 8.0 以上 |
| 高階 | 9.0 以上 |
| Oracle／Chronos | 9.5～10.0 |

角色目標：

```text
Toto 6.6 / Pao 6.7 / Leo 7.0 / Foxy 7.1 / Wolf 7.4 / Shark 7.5
Dodo 8.0 / Momo 8.0 / Ace 8.1 / Bruno 8.1 / Nori 8.2 / Viper 8.3
Nova 9.0 / Merlin 9.1 / Unit-9 9.2 / Vlad 9.3
Oracle 9.6 / Chronos 9.8
```

## 實際策略改進

### 初階

- 保留既有 V2.3 角色範圍、風險上限與個性。
- 使用淨 EV 閘阻止明顯負期望跟注。
- 加注尺寸依牌面乾濕、SPR、可投入上限及預期跟注人數調整。
- 不把初階變成同一種緊弱 AI；Leo、Foxy 仍偏主動，Toto、Pao 仍偏保守／跟注。

### 中階

- 沿用 V2.7 完整 Range／多人 Equity／EV／Board／SPR 決策鏈。
- 增加正期望防守恢復與負期望投入安全閘。
- 在候選加注 EV 接近時，使用牌面適配度選擇尺寸。
- 保留角色混合頻率，但不接受明顯劣於 Call／Check 的 Raise。

### 高階

- 使用比中階更小的 EV 容錯與更高的尺寸適配權重。
- 河牌、濕潤牌面與低 SPR 可使用更完整的極化尺寸。
- 在接近最高 EV 的候選之間做固定種子混合，避免完全機械化，又維持可重現。

### Oracle／Chronos

- 仍只使用自己的底牌、公共牌、公開行動、下注尺寸、可見籌碼與公開攤牌記憶。
- Oracle 使用 560 次多人聯合 Equity 樣本；Chronos 使用 800 次。
- 河牌單挑仍由 Boss Equity Engine 進行完整未知底牌組合枚舉。
- 使用 Range-conditioned Equity、被跟注 Equity、聯合棄牌率、Call EV 與多尺寸 Raise EV 比較。
- Chronos 使用更小的混合容錯；Oracle 保留較高的範圍剝削與混合詐唬能力。

## 公平邊界

允許：

- 自己的兩張底牌。
- 已公開公共牌。
- 位置、下注、籌碼、公開行動與公開攤牌統計。
- 從未知牌池進行隨機模擬及河牌未知組合枚舉。

禁止：

- 目前對手隱藏底牌。
- `state.deck` 或實際牌堆順序。
- 尚未發出的真實公共牌。
- 預定勝負答案。

Oracle／Chronos 的 `omniscient` 欄位會再次移除，並標記 `fairPlay` 與 `publicInformationOnly`。

## 驗證

正式 E2E：

```text
tests/e2e/ai-tier-strategy-v2-8.spec.js
```

驗證內容：

- 四個層級的目標分數範圍。
- Oracle／Chronos 不含 `omniscient`。
- 公開資訊公平政策。
- 初階、中階與 Boss 都能輸出合法 Fold／Call／Raise。
- Chronos 多人情境使用至少 700 次已完成樣本。
- 對手 `cards` 使用拋錯 getter 時，V2.8 決策仍能完成。

## 後續仍需完成

V2.8 的 10 分制是已落地策略能力與驗證門檻的目標評級，但最終是否真正達到對應實戰強度，仍須以多種子完整牌局長跑驗證：

```text
VPIP / PFR / 3-bet / C-bet / WTSD / W$SD / WWSF / BB100
```

建議下一步建立至少 25,000 手的 AI 長跑 telemetry，再依角色重疊、過度跟注、過度棄牌與尺寸偏差進行 V2.8.1 校準。
