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
- 累積補位不得超過 `660 entry-BB`。

### UI observer 穩定化 — 2026-08-05

正式合併：

```text
PR #104 — 模式 UI observer 閒置循環修正
PR #107 — observer idle 測試基準穩定化
```

目前模式控制只在設定面板、淘汰賽按鈕、Gemini 按鈕與 Gemini 人物卡等相關 DOM 變動時同步。完整 Chromium 與 WebKit 回歸已通過。

## 目前正式功能基準

本次整合分支建立前的正式 `main`：

```text
5d2179b917b86b8b187a1936918ab6dbd32fee3a
```

截至該基準，正式 `main` 已包含：

- Chromium／WebKit 完整 Browser E2E。
- 19 位永久淘汰賽、G1 動態補位與延伸純手數盲注。
- Google 登入與 Supabase 淘汰賽雲端存檔 V2。
- Oracle／Chronos 公平七星 Boss。
- Gemini 安全後端與本地備援。
- AI V1.1～V2.7 策略、公開 Range、Board／Blocker、SPR 與分級多人 Equity。
- Safari 公共牌街道轉場與 UI observer 穩定化。
- DesktopAccessibilityFocus 2.1.0。
- PR 25 手與每週 100 手 G1 狀態壓力測試。

此 SHA 只代表本次整合開始前的正式發布點。接續工作前必須重新讀取 GitHub `main`；本次 PR 合併後以新 commit 為準。

## 已被取代的研究與 PR

不得直接重新合併：

- PR #9：已由 PR #82 取代。
- PR #32：舊公平 Boss 修正。
- PR #46：舊 Range Continuation V1.3。
- PR #86：玩家籌碼領先加速盲注，已由 G1 取代。
- PR #89：舊 16 位 F1 經濟研究，已由正式 19 位 G1 取代。

## 回退原則

優先使用 Git 與已驗證 commit 回退，不要把舊資料夾內容直接覆蓋到 root。

正確流程：

1. 確認問題與最後正常 commit。
2. 從最新 `main` 建立修復或回退分支。
3. 使用 Git 還原指定檔案或 cherry-pick 安全修正。
4. 執行 Static、Chromium、WebKit 與必要 AI Calibration／State Stress／Production Smoke。
5. 透過 Pull Request 合併。

## 未來快照建議

若建立新快照，至少記錄：

- 基準 commit SHA。
- Build ID。
- 主要新增功能。
- CI、AI Calibration、State Stress 與 Production Smoke 結果。
- 需要一起還原的模組清單。
- 是否包含資料庫 migration 或後端設定。

實際程式仍以 Git commit／tag 為主，`versions/` 只作人工可讀的輔助紀錄。
