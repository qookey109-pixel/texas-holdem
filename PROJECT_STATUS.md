# 德州撲克專案狀態

核對日期：`2026-08-05`

## 專案資訊

- 正式 Repository：`qookey109-pixel/texas-holdem`
- 正式網站：`https://qookey109-pixel.github.io/texas-holdem/`
- 線上診斷頁：`https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`
- 正式分支與發布來源：`main / (root)`
- 正式 Mac 工作副本：`/Users/qoo/Documents/GitHub/texas-holdem`
- 舊 Repository：`qoo109/texas-holdem`，僅保留歷史紀錄
- 舊資料夾：`/Users/qoo/Desktop/德州`，不得作為修改或驗證來源

## 目前正式基準

本次整合工作開始時的正式 `main`：

```text
5d2179b917b86b8b187a1936918ab6dbd32fee3a
```

此基準已包含 AI V2.7、模式 UI observer 穩定化、正式 Chromium／WebKit 完整回歸，以及每週 100 手 Poker State Stress。每次開始工作仍須重新讀取 GitHub `main`，不得把此 SHA 視為永久最新版本；合併後以新的 `main` commit 為準。

## 已完成的主要功能

### 核心牌局與介面

- 六人 No-limit Texas Hold'em。
- 合法下注、跟注、加注、All-in、主池／邊池與攤牌結算。
- 一般模式與 19 位永久淘汰賽。
- 新手教學、撲克教練、牌局覆盤與本輪結算。
- 牌桌版面編輯、官方預設版面與尺寸控制。
- 童趣手繪／午夜牌組收藏。
- AI 情緒、座位發光、BGM／音效分離與 Safari 音訊恢復。
- 同一手內玩家與 AI 底牌只建立及發牌一次；FLOP／TURN／RIVER 只追加公共牌。
- 模式與 Gemini 控制 observer 只在相關控制項變動時同步，無關 DOM 變動不再造成每幀重寫。

### AI 難度主線

目前正式策略堆疊：

```text
角色獨立策略 V1
→ 多街策略 V1.1
→ 翻牌前位置化範圍 V1.2
→ 分街玩家模型 V1.3
→ 長期安全記憶 V1.4
→ 多人公開範圍與決策 V1.5
→ 固定種子校準 V1.6
→ 初階連續牌力與 Pot 相對尺寸 V1.7
→ 淨 EV、有效籌碼、SPR 與 All-in 單一調整鏈 V1.8
→ 公平 Boss 精確河牌與多人聯合 Equity V1.9
→ 公開行動條件化對手範圍 V2
→ Board Texture 與公開跨街範圍診斷 V2.1／V2.2
→ 中高階開局、角色強度與公開 Range 決策 V2.3／V2.4
→ Board／Blocker／Sizing 與完整中高階鏈 V2.5
→ 中階有界公開 Range 與樣本信心 V2.6
→ 中高階分級、決定性多人 Equity V2.7
```

AI 僅可使用自己的底牌、公共牌、公開位置、公開下注行動與聚合後的玩家統計。不得讀取對手隱藏底牌、實際牌堆順序、未來公共牌或預定勝負答案。

### AI V2.7 分級多人 Equity

正式模組：

```text
js/ai-tiered-multiway-equity-v2-7.js
AiTieredMultiwayEquityV27 2.7.0
```

適用角色：

- 中階：Ace、Momo、Nori、Bruno、Dodo、Viper。
- 高階：Nova、Unit-9、Merlin、Vlad。

不適用：

- 初階角色。
- Oracle、Chronos。
- Gemini。
- 翻牌前與單挑底池。

中階樣本範圍約 `48～120`，最大 Equity 修正 `±0.065`；高階樣本範圍約 `80～240`，最大修正 `±0.115`。V2.7 接在公開 Range 後、淨 EV 前，不自行創造新加注線。

### AI V2.7 實戰校準基準

正式實驗室：

```text
tests/support/ai-gameplay-calibration-v2-7.js
AiGameplayCalibrationV27 1.0.0
```

正式 E2E：

```text
tests/e2e/ai-gameplay-calibration-v2-7.spec.js
```

校準矩陣：

- 6 位中階、4 位高階。
- 6 種翻牌前／翻牌後固定公開局面。
- 5 組固定種子。
- 共 300 次決策。
- 產出 VPIP／Open raise／3-bet 情境代理值、動作率、Equity 修正、樣本數、安全閘與決策耗時。
- 對手 `cards` 與 `state.deck` 使用拋錯 getter，任何隱藏資訊讀取都會讓測試失敗。

代理值不是實際一百手人口統計；它的用途是版本回歸比較。

### 公平 Boss 與 Gemini

- Oracle、Chronos 使用公開資訊、公平 Equity 與條件化對手範圍，不具全知能力。
- 河牌單挑精確枚舉 `990` 組未知底牌。
- Oracle 多人樣本 `360`，Chronos 多人樣本 `480`。
- 不得重新加入 `omniscient: true`、隱藏底牌讀取或未來牌面答案。
- Gemini 使用 Cloudflare Worker 安全後端或本地 AI 備援。
- 正式 Worker 提供 `/health`，前端只保存 Worker URL，不接收或保存 Gemini API Key。

### G1 淘汰賽經濟

- 19 位永久淘汰賽，6 位開局、13 位依序補位，Gemini 最後登場。
- 一般模式維持既有補位規則；G1 只套用淘汰賽。
- 淘汰賽採純手數盲注，不依玩家籌碼占比加速。
- 補位籌碼依當前大盲、全桌總 BB 與角色階級動態計算。
- 全桌目標深度 `170BB`，動態反應 `15%`。
- 中階 `25／35／45BB`；高階 `30／40／50BB`；特殊 Boss `35／45／60BB`；Gemini `40／50／70BB`。
- 正式 13 位補位角色的理論最大累積注入為 `660 entry-BB`。
- 支援同一手多位淘汰依序計算，並防止同一角色重複消費補位索引。
- 玩家籌碼、玩家籌碼占比、勝率與籌碼王狀態不進入補位公式。

正式模組：

```text
ReplacementStackBalance 2.1.0
```

### 淘汰賽雲端存檔

- Google 登入與 Supabase 淘汰賽雲端存檔。
- 雲端存檔 V2 保存挑戰進度、玩家籌碼與累積 session 統計。
- V1 舊存檔仍可讀取並遷移已知手數。
- 正式 migration 允許 `save_version` 1 與 2，預設為 2。
- RLS policy 只允許 authenticated 使用者存取自己的 `user_id`。
- anon 的資料表權限已撤銷。
- 不保存底牌、牌堆、未來牌面或完整逐步牌局紀錄。

### 正式環境 Smoke Test

正式腳本：

```text
scripts/production-backend-smoke.mjs
```

正式 workflow：

```text
.github/workflows/production-smoke.yml
```

本機契約檢查已納入 `npm run validate`，驗證 V2.7 文件／Build Manifest、正式端點、Supabase RLS migration 與每週壓力測試排程一致。

合併到 `main` 後及每週日台北時間約 03:10，Production Smoke 會以零寫入方式驗證：

- GitHub Pages 正式首頁、config cache key 與 Build Manifest。
- Supabase Auth settings 與 Google Provider。
- 未登入請求不能看到 `tournament_saves`。
- Gemini Worker `/health`、`ok: true`、`configured: true` 與模型名稱。

Production Smoke 不保存 OAuth Token，也不新增、更新或刪除 Supabase 資料。

### 桌機鍵盤與焦點無障礙

正式模組：

```text
DesktopAccessibilityFocus 2.1.0
```

包含 AI 座位鍵盤操作、Dialog focus trap、Escape 關閉與焦點還原，以及 `aria-controls`、`aria-expanded` 與 `:focus-visible`。

## 驗證方式

### 靜態、部署與正式後端契約

```bash
npm run validate
npm run validate:deployment
npm run validate:production-contract
```

### Browser E2E

```bash
npm run test:e2e
```

GitHub Actions 分別執行 Chromium 與 WebKit。

### AI 固定種子校準

```bash
npm run test:ai-calibration
npm run test:ai-calibration:v2.7
```

AI Calibration CI 會執行 V1.6、V1.9 與 V2.7，並上傳 JSON／Markdown artifact。

### 長時間牌局壓力測試

```bash
npm run test:state-stress
npm run test:state-stress:100
```

正式 CI 基準：

- PR：一般模式 25 手自然下注，加上 G1 19 位與 13 次補位循環。
- 每週日台北時間約 03:30：一般模式 100 手，加上 G1 補位循環。
- 驗證牌張唯一、籌碼守恆、合法下注狀態、無負數籌碼、無卡死與無殘留計時器。
- 驗證盲注不得倒退、角色不得重複、Gemini 最後登場，累積補位不得超過 `660 entry-BB`。

### 正式線上 Smoke

```bash
npm run test:production-smoke
```

詳細方法：`docs/production-backend-smoke.md`。

## 尚未完成

### 第一優先：Google 真人 OAuth 人工 Smoke

公開環境 Smoke 可以確認 Google Provider 已啟用，但不能安全自動保存個人 Google OAuth 憑證。仍需使用專用測試帳號人工驗證：

- 登入後返回正式 GitHub Pages。
- V2 寫入／讀回／暫停／恢復／刪除。
- 登出後不能讀取私人存檔。

未完成真人流程前，只能宣告公開後端契約通過，不能宣告 OAuth 真人流程已驗證。

### 第二優先：多種子完整牌局 Telemetry

V2.7 目前有 300 次固定局面校準，以及每週單種子 100 手完整狀態壓力測試。後續真正的實戰平衡資料應加入：

- 多種完整牌局種子。
- 角色真實 VPIP、PFR、3-bet、All-in 與攤牌率。
- 玩家第 5／10／20 手平均籌碼與首次淘汰手數。
- 各角色平均底池、最大投入與存活手數。
- 500～1,000 手長跑。
- 長時間 DOM、動畫與瀏覽器記憶體監測。

在這些資料不足前，不應直接推出 AI V2.8 或大幅調高難度。

### 第三優先：規則與結算細節

- 多人平分底池的奇數籌碼依莊家左側順序分配。
- 多主池／邊池勝者動畫金額與實領一致。
- 動態模組載入失敗提供統一錯誤與診斷訊號。

### G1 實戰觀察

- 快速、一般、慢速淘汰節奏的實際手感。
- Oracle／Chronos 與 Gemini 登場深度。
- 高盲注下 K／M 籌碼顯示與 BB 輔助資訊。
- 在 G1 實戰資料不足前，不重新加入玩家籌碼王懲罰或玩家領先加速盲注。

## 已知風險

- GitHub Pages 或瀏覽器快取可能短暫顯示舊檔；Production Smoke 會重試，但不能完全消除 CDN 傳播時間。
- 舊 PR 或舊分支若直接合併，可能覆蓋目前 AI、Boss、淘汰賽或 UI。
- 多層相容載入器依賴正確載入順序，修改時必須跑完整 Chromium／WebKit E2E。
- CI 綠燈不能取代正式 Safari 手動操作與 Google 真人 OAuth Smoke。
- V2.7 VPIP／PFR／3-bet 是固定局面 proxy，不是完整牌局人口統計。
- 本機舊資料夾不得拿來判斷正式網站狀態。

## Pull Request 整理

### 已被取代，不得直接合併

- PR #9：舊桌機無障礙分支，已由 PR #82 取代。
- PR #32：舊公平 Boss 修正。
- PR #46：舊 Range Continuation V1.3。
- PR #86：玩家籌碼領先加速盲注，已由 G1 取代並關閉。
- PR #89：舊 16 位 F1 經濟研究，已由正式 19 位 G1 取代並關閉。

### 近期正式合併

- PR #91：G1 淘汰賽經濟與正式 19 位角色補位。
- PR #92：AI V2.2 公開跨街歷史與範圍診斷。
- PR #96：正式版面穩定化。
- PR #99：AI V2.6 中階公開 Range 與樣本信心。
- PR #101：AI V2.7 分級、決定性多人 Equity。
- PR #104：模式 UI observer 閒置循環修正。
- PR #107：observer idle 測試基準穩定化。

## 開發規則

1. 每次開始前重新讀取最新 GitHub `main`。
2. 從最新 `main` 建立獨立分支與 Pull Request。
3. 不直接修改或未驗證合併到 `main`。
4. 不 force push。
5. 不使用舊 Repository 或舊桌面資料夾。
6. 不得讓任何 AI 讀取對手底牌、實際牌堆或未來公共牌。
7. 提交前執行 `npm run validate`。
8. 涉及遊戲流程或 UI 時執行完整 Browser E2E。
9. AI 策略調整前執行固定種子校準並保存可比較報表。
10. 合併前確認 PR head 未變、分支未落後且必要 CI 全綠。
11. 合併後重新核對正式 `main`、GitHub Pages、診斷頁、Production Smoke 與正式後端狀態。
