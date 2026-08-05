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

正式 G1 發布基準：

```text
c9e0a961db7f026d97a822dbd8a90ab5c1c7edbf
```

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

### 長時間狀態壓力測試 — 2026-08-05

正式合併 PR：

```text
PR #84 — Automate normal and G1 tournament state stress testing
```

正式基準：

```text
79fd4d1a77a2223033440085e99e7b431b0cfd64
```

包含：

- 一般模式 100 手自然下注壓力測試。
- 牌張唯一、籌碼守恆、Pot／Contribution／Current Bet、合法 Actor、非負籌碼、卡死與殘留計時器檢查。
- 19 位角色與 13 次 G1 補位循環。
- Gemini 最後登場、盲注不得倒退、角色不得重複。
- 累積補位不得超過 `660 entry-BB`。
- Pull Request 觸發、手動執行，以及每日台北時間約 03:30 排程。
- 合併前 Static、AI calibration、Poker state stress、Chromium 與 WebKit 全部通過。

## 目前正式功能基準

截至 2026-08-05，正式 `main` 已包含：

- 新 Repository 與 GitHub Pages root 發布。
- Chromium／WebKit Browser E2E。
- 19 位永久淘汰賽、G1 動態補位與延伸純手數盲注。
- Google 登入與 Supabase 淘汰賽雲端存檔 V2。
- Oracle／Chronos 公平七星 Boss。
- Gemini 安全後端、本地備援與可切換 Provider。
- AI V1.1～V2.2 策略、公開範圍、Board Texture 與跨街診斷基礎。
- Safari 公共牌街道轉場效能優化。
- DesktopAccessibilityFocus 2.1.0。
- 一般模式 100 手與 G1 13 次補位自動壓力測試。

目前最新已驗證正式基準：

```text
79fd4d1a77a2223033440085e99e7b431b0cfd64
```

此 SHA 只代表本次文件同步前的正式發布點。接續工作前必須重新讀取 GitHub `main`。

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
4. 執行 Static、Chromium、WebKit 與必要 AI Calibration／State Stress。
5. 透過 Pull Request 合併。

## 未來快照建議

若建立新快照，至少記錄：

- 基準 commit SHA。
- Build ID。
- 主要新增功能。
- CI、AI Calibration 與 State Stress 結果。
- 需要一起還原的模組清單。
- 是否包含資料庫 migration 或後端設定。

實際程式仍以 Git commit／tag 為主，`versions/` 只作人工可讀的輔助紀錄。
