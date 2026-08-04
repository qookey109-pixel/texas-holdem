# 德州撲克專案狀態

核對日期：`2026-08-04`

## 專案資訊

- 正式 Repository：`qookey109-pixel/texas-holdem`
- 正式網站：`https://qookey109-pixel.github.io/texas-holdem/`
- 線上診斷頁：`https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`
- 正式分支與發布來源：`main / (root)`
- 正式 Mac 工作副本：`/Users/qoo/Documents/GitHub/texas-holdem`
- 舊 Repository：`qoo109/texas-holdem`，僅保留歷史紀錄
- 舊資料夾：`/Users/qoo/Desktop/德州`，不得作為修改或驗證來源

## 目前正式基準

本次整理開始時，最新正式 `main` 為：

```text
96195405721fdb22e57717cc35a267a6f5e0af11
```

該版本已包含 PR #64 的核心底牌／公共牌動畫旗標分離。這個 SHA 只代表本次整理起點；每次開始工作仍須重新讀取 GitHub `main`。

## 已完成的主要功能

### 核心牌局與介面

- 六人 No-limit Texas Hold'em。
- 合法下注、跟注、加注、All-in、主池／邊池與攤牌結算。
- 一般模式與 19 位永久淘汰賽。
- 新手教學、撲克教練、牌局覆盤與本輪結算。
- 牌桌版面編輯、官方預設版面與尺寸控制。
- 童趣手繪／午夜牌組收藏。
- AI 情緒、座位發光、BGM／音效分離與 Safari 音訊恢復。

### AI 難度主線

目前正式策略堆疊：

```text
角色獨立策略 V1
→ 多街策略 V1.1
→ 翻牌前位置化範圍 V1.2
→ 分街玩家模型 V1.3
→ 長期安全記憶 V1.4
→ 多人公開範圍與決策 V1.5
→ 固定種子校準工具 V1.6
```

AI 僅可使用自己的底牌、公共牌、公開位置、公開下注行動與聚合後的玩家統計。不得讀取對手隱藏底牌、實際牌堆順序、未來公共牌或預定勝負答案。

### 公平 Boss 與 Gemini

- Oracle、Chronos 使用公開資訊與公平策略，不具全知能力。
- 不得重新加入 `omniscient: true`、隱藏底牌讀取或未來牌面答案。
- Gemini 使用安全後端或玩家自行設定的相容 Provider。
- Gemini 後端／備援與本機中高階 AI 是不同系統。

### 淘汰賽與雲端

- 19 位永久淘汰賽，Gemini 最後登場。
- 分層候補、角色替換與對稱縮桌。
- Google 登入與 Supabase 淘汰賽雲端存檔。
- 雲端存檔 V2 保存挑戰進度、玩家籌碼與累積 session 統計。
- V1 舊存檔仍可讀取並遷移已知手數。
- 不保存底牌、牌堆、未來牌面或完整逐步牌局紀錄。

## 2026-08-04 已確認與修正

### 淘汰賽雲端存檔 V2 資料庫約束

問題：

- 前端已寫入 `save_version = 2`。
- 正式 Supabase 一度仍限制 `CHECK (save_version = 1)`。
- 正式 Postgres 日誌已出現多次 constraint violation，導致新版資料只保留在瀏覽器本機備份。

處理：

- 正式 Supabase 已套用 `allow_tournament_save_v2` migration。
- `save_version` 預設值已改為 `2`。
- constraint 現在允許 `1` 與 `2`，既有 V1 存檔不會被刪除。
- Repository 新增：

```text
supabase/migrations/20260804_allow_tournament_save_v2.sql
```

### 公共牌與底牌渲染

近期 PR 已完成：

- PR #49：Safari 公共牌先繪製。
- PR #53：淘汰賽結算版面溢出與重疊修正。
- PR #56：移除公共牌街道的第二次整桌重畫。
- PR #62：玩家底牌同一手內維持原 DOM 節點。
- PR #63：FLOP／TURN／RIVER 鎖定玩家與 AI 底牌動畫。
- PR #64：核心分離底牌與公共牌動畫旗標。

目前預期規則：

```text
新的一手 → 玩家與 AI 底牌發牌一次
FLOP     → 只發三張公共牌
TURN     → 只追加第四張公共牌
RIVER    → 只追加第五張公共牌
```

### Build Manifest 與診斷覆蓋

本次整理將近期正式資產補入 `build-manifest.json`，包括：

- `topbar-control-alignment-v2.css`
- `session-summary-layout-fix.css`
- `js/official-layout-preset.js`
- `js/hero-card-render-stability.js`
- `js/hole-card-motion-scope.js`
- `js/ui-text-write-guard.js`
- `js/ai-profile-position.js`
- 淘汰賽雲端存檔 V2 migration

新增 `scripts/validate-deployment-contracts.mjs`，CI 會檢查：

- 首頁直接載入的本機 JS／CSS 是否存在且已登記於 Manifest。
- `config.js` 與 `events-boot.js` 動態載入的正式資產是否受診斷頁覆蓋。
- 前端淘汰賽存檔 schemaVersion 是否有對應 Supabase migration。
- migration 是否保留舊版本並允許目前版本。

## 驗證方式

### 完整靜態與部署契約檢查

```bash
npm run validate
```

內容包括：

- HTML、CSS、JavaScript 引用與語法。
- Build Manifest 結構與資產存在性。
- 正式載入資產是否全部受診斷頁覆蓋。
- 淘汰賽雲端存檔前端／資料庫版本契約。

### Browser E2E

```bash
npm run test:e2e
```

GitHub Actions 會分別執行 Chromium 與 WebKit。涉及遊戲流程、下注、UI、淘汰賽、雲端、街道轉場或渲染的修改，兩個瀏覽器都必須通過。

### AI 固定種子校準

```bash
npm run test:ai-calibration
```

V1.6 用於比較角色頻率與版本差異，不等同 GTO／solver，也不應為了讓報表好看而硬寫答案。

## 尚未完成

### 第一優先：長時間牌局壓力測試

需要快速模擬數百至數千手並檢查：

- 籌碼總量守恆。
- 無負數籌碼與不合法加注。
- All-in、主池與邊池正確。
- 公共牌與牌組不重複。
- 每手都能完成，沒有無限等待或殘留計時器。
- AI 記憶不會無限制膨脹。
- 淘汰賽縮桌、替換與恢復不會卡死。

### 第二優先：真實後端 smoke test

目前 Browser E2E 使用 Supabase mock。仍需建立不寫入私人資料的正式環境 smoke test，確認：

- migration 與前端版本一致。
- 登入後 V2 寫入與讀回正常。
- GitHub Pages 發布後的正式載入檔版本正確。

### 第三優先：桌機鍵盤與焦點無障礙

PR #9 建立於舊主線，不可直接合併。若採用，需從最新 `main` 重新移植：

- dialog focus trap。
- Escape 關閉與焦點還原。
- AI 資訊卡鍵盤操作。
- 清楚一致的 `:focus-visible` 外框。

### 仍需驗證的規則細節

- 多人平分底池的奇數籌碼應明確依莊家左側順序分配。
- 多主池／邊池勝者動畫金額應與各自實領一致。
- 動態模組載入失敗應提供統一錯誤與診斷訊號，不應完全靜默忽略。

## 已知風險

- GitHub Pages 或瀏覽器快取可能短暫顯示舊檔。
- 舊 PR 或舊分支若直接合併，可能覆蓋目前 AI、Boss、淘汰賽或 UI。
- 多層相容載入器依賴正確載入順序，修改時必須跑完整 Chromium／WebKit E2E。
- CI 綠燈不能取代正式 Safari 手動操作與正式後端 smoke test。
- 本機舊資料夾不得拿來判斷正式網站狀態。

## Pull Request 整理

### 已被取代，不得直接合併

- PR #32：舊公平 Boss 修正。
- PR #46：舊 Range Continuation V1.3。

### 可重新評估，但必須從最新 main 移植

- PR #9：桌機鍵盤與焦點無障礙。

## 開發規則

1. 每次開始前重新讀取最新 GitHub `main`。
2. 從最新 `main` 建立獨立分支與 Pull Request。
3. 不直接修改或未驗證合併到 `main`。
4. 不 force push。
5. 不使用舊 Repository 或舊桌面資料夾。
6. 不得讓任何 AI 讀取對手底牌、實際牌堆或未來公共牌。
7. 提交前執行 `npm run validate`。
8. 涉及遊戲流程或 UI 時執行完整 Browser E2E。
9. AI 策略調整前先執行固定種子校準並保存可比較報表。
10. 合併前確認 PR head 未變、分支未落後、Static／Chromium／WebKit 全綠。
11. 合併後重新核對正式 `main`、GitHub Pages、診斷頁與正式後端狀態。
