# 德州撲克版本快照

`versions/` 用來保存少量歷史檔案快照，方便重大介面改動後人工比較或緊急回退。

## 重要區分

版本資料夾不是正式網站來源，也不等於最新穩定 `main`。

唯一正式來源：

```text
Repository: qookey109-pixel/texas-holdem
Branch: main
Publish folder: / (root)
Local: /Users/qoo/Documents/GitHub/texas-holdem
```

不得從以下位置修改或發布：

```text
qoo109/texas-holdem
/Users/qoo/Desktop/德州
versions/<任何歷史資料夾>
```

## 目前保留的歷史資料夾

```text
v75-smaller-table-2026-07-18
v76-ux-readability-tuning-2026-07-18
v77-pixel-card-theme-2026-07-19
```

`v77-pixel-card-theme-2026-07-19` 是最新的資料夾快照，但不是最新正式版本。

## 正式發布紀錄

### AI V1.9 — 2026-08-04

正式基準：

```text
10f6f77abebc93a16fda9e138953d2df82e85987
```

包含初階連續牌力、Pot 相對尺寸、Call／Raise 淨 EV、有效籌碼、SPR、連續 All-in、河牌 `990` 組精確枚舉、多人聯合 Equity，以及 Oracle／Chronos 公平 Boss 接線。

### AI V2 公開範圍 Equity — 2026-08-05

正式基準：

```text
bd8f70d8b26eaf0da4261acb159996437ef168c6
```

包含 Raise EV called-pot 會計、公開位置／街道／行動／下注尺寸條件化範圍，以及 Call 與 Raise-call 範圍分離。

### 桌機鍵盤與焦點無障礙 V2.1.0 — 2026-08-05

正式基準：

```text
a3742e758e7d1bb27d59068a0f073da1ea5e3c38
```

包含 AI 座位鍵盤操作、Dialog focus trap、Escape 關閉、焦點還原與完整 Chromium／WebKit E2E。

### AI V2.2 與 G1 淘汰賽經濟 — 2026-08-05

主要正式合併：

```text
PR #91 — G1 淘汰賽經濟與正式 19 位角色補位
PR #92 — AI V2.2 公開跨街歷史與範圍診斷
```

G1 包含：

- 19 位永久淘汰賽，6 位開局、13 位依序補位，Gemini 最後登場。
- 純手數盲注，不依玩家籌碼占比加速。
- 依當前大盲、桌面總 BB 與角色階級計算補位籌碼。
- 全桌目標 `170BB`、反應幅度 `15%`。
- 中階 `25／35／45BB`、高階 `30／40／50BB`、特殊 Boss `35／45／60BB`、Gemini `40／50／70BB`。
- 正式補位理論上限 `660 entry-BB`。
- 同手多位淘汰依序計算與補位索引防重複。
- 不使用玩家個人籌碼、籌碼占比、勝率或籌碼王狀態。

正式模組：

```text
ReplacementStackBalance 2.1.0
```

### AI V2.3～V2.5 — 2026-08-05

正式主線加入：

- V2.3 中高階開局策略與更清楚的翻牌前分層。
- V2.4 公開 Range 決策整合與高階完整 Combo Range。
- V2.5 Board Texture、Blocker／Unblocker、下注尺寸與完整中高階決策鏈。
- 初階仍保留簡單、友善與較低計算量的決策。

正式模組：

```text
js/ai-opening-strategies-v2-3.js
js/ai-range-decision-integration-v2-4.js
js/ai-board-intelligence-v2-5.js
js/ai-mid-elite-decision-chain-v2-5.js
```

### AI V2.6 中階公開 Range — 2026-08-05

正式合併：

```text
PR #99 — AI V2.6 中階公開 Range 與樣本信心
```

正式基準：

```text
90eb8e691e6a7f37f92b6719644ec394b357575a
```

包含：

- Ace、Momo、Nori、Bruno、Dodo、Viper 六位中階角色。
- 公開 Range 樣本信心門檻。
- 強窄 Range 收緊邊緣跟注與低品質詐唬。
- 弱寬 Range 保留合理防守。
- 中階修正幅度小於高階，避免直接升級成 Boss。
- 隱藏對手底牌 getter 防讀取測試。

### AI V2.7 分級多人 Equity — 2026-08-05

正式合併：

```text
PR #101 — AI V2.7 分級、決定性多人 Equity
```

正式發布 commit：

```text
e4c67c4188af4c7247b939917c0eefc9ba91577e
```

包含：

- 中階約 `48～120` 次聯合抽樣。
- 高階約 `80～240` 次聯合抽樣。
- 中階最大 Equity 修正 `±0.065`。
- 高階最大 Equity 修正 `±0.115`。
- 公開 Range 後、淨 EV 前接入決策鏈。
- 只修正既有 Call／Raise EV，不自行創造新加注線。
- 相同公開資訊使用相同 seed，可重現。
- 不讀取對手底牌、`state.deck` 或未來公共牌答案。

正式模組：

```text
js/ai-tiered-multiway-equity-v2-7.js
AiTieredMultiwayEquityV27 2.7.0
```

### V2.7 實戰校準與正式後端 Smoke — 2026-08-05

本次整合加入：

- 10 位中高階角色。
- 6 種固定公開局面。
- 5 組固定種子。
- 300 次可重現決策。
- VPIP／Open raise／3-bet 情境代理值。
- 動作率、Equity 修正、樣本數、安全閘與決策時間報表。
- 與機器速度無關的 deterministic fingerprint。
- GitHub Pages、Supabase Auth／RLS 與 Gemini Worker 的零寫入 Production Smoke。

正式檔案：

```text
tests/support/ai-gameplay-calibration-v2-7.js
tests/support/ai-gameplay-calibration-v2-7-determinism.js
tests/e2e/ai-gameplay-calibration-v2-7.spec.js
scripts/production-backend-smoke.mjs
.github/workflows/production-smoke.yml
docs/ai-gameplay-calibration-v2-7.md
docs/production-backend-smoke.md
```

### 長時間狀態壓力測試 — 2026-08-05

正式合併 PR：

```text
PR #84 — Automate normal and G1 tournament state stress testing
PR #102～#106 — 每週排程與 25／100 手成本調整
```

目前正式安排：

- Pull Request 執行一般模式 25 手自然下注。
- 每週日台北時間約 03:30 執行一般模式 100 手自然下注。
- 每次同時驗證 19 位角色與 13 次 G1 補位循環。
- 牌張唯一、籌碼守恆、Pot／Contribution／Current Bet、合法 Actor、非負籌碼、卡死與殘留計時器檢查。
- Gemini 最後登場、盲注不得倒退、角色不得重複。
- G1 基礎補位累積不得超過 `660 entry-BB`。

### UI observer 穩定化 — 2026-08-05

正式合併：

```text
PR #104 — 模式 UI observer 閒置循環修正
PR #107 — observer idle 測試基準穩定化
```

目前模式控制只在設定面板、淘汰賽按鈕、Gemini 按鈕與 Gemini 人物卡等相關 DOM 變動時同步。完整 Chromium 與 WebKit 回歸已通過。

### 籌碼經濟與長期棄牌反制 V1 — 2026-08-06

整合 PR：

```text
PR #109 — Balance rebuys and counter persistent overfolding
```

包含：

- 一般模式玩家與 AI 改用相同重新買入公式。
- 目標為正籌碼牌桌平均 `70%`，並受完整買入 `60%`、最低 `20BB`、最高 `50BB` 約束。
- 初始籌碼 `2,000` 與初始盲注 `10 / 20` 不變。
- 玩家籌碼至少為最大 AI 的 `1.8 倍`時，Oracle／Chronos 與 Gemini 才啟動有限入場追趕。
- Oracle／Chronos 為 `40／55／75BB`，Gemini 為 `50／65／90BB`。
- 至少觀察 `8` 手後，以 VPIP `<= 18%` 或翻牌前棄牌率 `>= 70%` 偵測偏緊被動打法。
- 初中高階角色依性格使用小尺寸後位偷盲與乾燥牌面壓力。
- Gemini Worker 白名單清理並保留 `tournamentObservation` 公開聚合統計。
- 不傳遞對手隱藏底牌、牌堆順序、未來公共牌或原始攤牌牌張清單。
- 修正棄牌反制與 AI V2.7 wrapper 載入順序，避免遞迴與卡死。

正式模組與文件：

```text
js/economy-fold-defense-v1.js
EconomyFoldDefenseV1 1.0.1
docs/economy-fold-defense-v1.md
tests/e2e/economy-fold-defense-v1.spec.js
tests/e2e/replacement-stack-balance.spec.js
```

驗收範圍：

- Static Site Check。
- Chromium 全套 Browser E2E。
- WebKit 關鍵回歸。
- 一般模式 25 手自然下注與 G1 13 次補位壓力測試。
