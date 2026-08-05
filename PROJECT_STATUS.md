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

最新正式 `main`：

```text
79fd4d1a77a2223033440085e99e7b431b0cfd64
```

此版本已包含 AI V2.2、G1 淘汰賽經濟，以及一般模式 100 手與 19 位淘汰賽 13 次補位循環的自動壓力測試。每次開始工作仍須重新讀取 GitHub `main`，不得把此 SHA 視為永久最新版本。

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
```

AI 僅可使用自己的底牌、公共牌、公開位置、公開下注行動與聚合後的玩家統計。不得讀取對手隱藏底牌、實際牌堆順序、未來公共牌或預定勝負答案。

### 公平 Boss 與 Gemini

- Oracle、Chronos 使用公開資訊、公平 Equity 與條件化對手範圍，不具全知能力。
- 河牌單挑精確枚舉 `990` 組未知底牌。
- Oracle 多人樣本 `360`，Chronos 多人樣本 `480`。
- 不得重新加入 `omniscient: true`、隱藏底牌讀取或未來牌面答案。
- Gemini 使用安全後端或玩家自行設定的相容 Provider。

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
- 不保存底牌、牌堆、未來牌面或完整逐步牌局紀錄。

### 桌機鍵盤與焦點無障礙

正式模組：

```text
DesktopAccessibilityFocus 2.1.0
```

包含 AI 座位鍵盤操作、Dialog focus trap、Escape 關閉與焦點還原，以及 `aria-controls`、`aria-expanded` 與 `:focus-visible`。

## 驗證方式

### 靜態與部署契約

```bash
npm run validate
```

### Browser E2E

```bash
npm run test:e2e
```

GitHub Actions 分別執行 Chromium 與 WebKit。

### AI 固定種子校準

```bash
npm run test:ai-calibration
```

### 長時間牌局壓力測試

```bash
npm run test:state-stress
npm run test:state-stress:100
```

PR #84 已將以下驗證納入 CI：

- 一般模式 100 手自然下注。
- 牌張唯一、籌碼守恆、合法下注狀態、無負數籌碼、無卡死與殘留計時器。
- G1 19 位角色與 13 次補位循環。
- 盲注不得倒退、角色不得重複、Gemini 必須最後登場。
- 累積補位深度不得超過 `660 entry-BB`。
- 每日台北時間約 03:30 自動執行。

## 尚未完成

### 第一優先：正式後端 smoke test

目前 Browser E2E 使用 Supabase mock。仍需建立不寫入私人資料的正式環境 smoke test，確認 migration、登入後 V2 寫入／讀回／暫停／恢復／刪除，以及 GitHub Pages 正式載入版本。

### 第二優先：更長與更多種子壓力測試

目前正式 CI 基準為一般模式 100 手與固定 13 次淘汰賽補位循環。後續可加入：

- 多種隨機種子。
- 500～1,000 手以上長跑。
- 真實縮桌、恢復與多主池／邊池組合。
- 長時間 DOM、動畫與瀏覽器記憶體監測。

### 第三優先：規則與結算細節

- 多人平分底池的奇數籌碼依莊家左側順序分配。
- 多主池／邊池勝者動畫金額與實領一致。
- 動態模組載入失敗提供統一錯誤與診斷訊號。

### AI 後續增強

- Board Texture 與下注尺寸／Range 更深入聯動。
- Blocker／Unblocker 決策。
- 將 V2.2 公開跨街歷史逐步接入正式決策，而不是只作診斷基礎。

### G1 實戰觀察

- 快速、一般、慢速淘汰節奏的實際手感。
- Oracle／Chronos 與 Gemini 登場深度。
- 高盲注下 K／M 籌碼顯示與 BB 輔助資訊。
- 在 G1 實戰資料不足前，不重新加入玩家籌碼王懲罰或玩家領先加速盲注。

## 已知風險

- GitHub Pages 或瀏覽器快取可能短暫顯示舊檔。
- 舊 PR 或舊分支若直接合併，可能覆蓋目前 AI、Boss、淘汰賽或 UI。
- 多層相容載入器依賴正確載入順序，修改時必須跑完整 Chromium／WebKit E2E。
- CI 綠燈不能取代正式 Safari 手動操作與正式後端 smoke test。
- 本機舊資料夾不得拿來判斷正式網站狀態。

## Pull Request 整理

### 已被取代，不得直接合併

- PR #9：舊桌機無障礙分支，已由 PR #82 取代。
- PR #32：舊公平 Boss 修正。
- PR #46：舊 Range Continuation V1.3。
- PR #86：玩家籌碼領先加速盲注，已由 G1 取代並關閉。
- PR #89：舊 16 位 F1 經濟研究，已由正式 19 位 G1 取代並關閉。

### 近期正式合併

- PR #82：桌機鍵盤與焦點無障礙 V2.1.0。
- PR #91：G1 淘汰賽經濟與正式 19 位角色補位。
- PR #92：AI V2.2 公開跨街歷史與範圍診斷。
- PR #84：一般模式與 G1 淘汰賽長時間狀態壓力測試。

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
11. 合併後重新核對正式 `main`、GitHub Pages、診斷頁與正式後端狀態。
