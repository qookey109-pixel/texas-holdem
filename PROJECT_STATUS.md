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
a3742e758e7d1bb27d59068a0f073da1ea5e3c38
```

該版本已包含 AI V2 公開範圍模型、Raise EV 修正、固定種子校準基礎，以及桌機鍵盤與焦點無障礙 V2.1.0。每次開始工作仍須重新讀取 GitHub `main`，不得把此 SHA 視為永久最新版本。

最新 GitHub Pages 建置已成功發布同一 commit，來源為 `main / root`。

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
→ 公開行動條件化對手範圍與 Raise-call 範圍分離 V2
```

AI 僅可使用自己的底牌、公共牌、公開位置、公開下注行動與聚合後的玩家統計。不得讀取對手隱藏底牌、實際牌堆順序、未來公共牌或預定勝負答案。

### AI V1.9／V2 已完成內容

- Call／Raise 使用淨 EV 會計。
- Raise EV 會計包含至少一名對手跟注加注後投入的額外籌碼。
- 有效籌碼、SPR 與連續 All-in 使用單一調整鏈。
- 河牌單挑精確枚舉 `990` 組未知底牌。
- 多人底池使用同一樣本內的聯合抽牌，不重複使用牌張。
- Oracle 多人樣本 `360`，Chronos 多人樣本 `480`。
- Call 範圍與「面對再加注仍會跟注」的更強範圍分離。
- 對手範圍依公開位置、街道、行動與下注尺寸加權，仍保留非零詐唬尾端。
- 引擎異常時保留公平 legacy fallback，不得回退到全知模式。

固定種子最終基準包含：

```text
河牌堅果：Oracle／Chronos 100% Raise
河牌頂對抓詐唬：Oracle／Chronos 100% Call
隱藏底牌讀取：0
Legacy fallback：0
```

校準結果是固定情境回歸基準，不代表完整 GTO 或所有實戰頻率。

### 公平 Boss 與 Gemini

- Oracle、Chronos 使用公開資訊、公平 Equity 與條件化對手範圍，不具全知能力。
- 不得重新加入 `omniscient: true`、隱藏底牌讀取或未來牌面答案。
- Gemini 使用安全後端或玩家自行設定的相容 Provider。
- Gemini 後端／備援與本機中高階 AI 是不同系統。

### 淘汰賽與雲端

- 19 位永久淘汰賽，Gemini 最後登場。
- 分層候補、角色替換與對稱縮桌。
- Google 登入與 Supabase 淘汰賽雲端存檔。
- 雲端存檔 V2 保存挑戰進度、玩家籌碼與累積 session 統計。
- V1 舊存檔仍可讀取並遷移已知手數。
- 正式 Supabase migration 已允許 `save_version` 1 與 2，預設為 2。
- 不保存底牌、牌堆、未來牌面或完整逐步牌局紀錄。

### 桌機鍵盤與焦點無障礙

PR #82 已從最新主線重新實作並正式合併，舊 PR #9 已註明被取代並關閉。

正式功能：

- AI 座位可使用 Enter／Space 開啟角色資訊。
- AI 資訊卡關閉後回到原 AI 座位。
- 教學與本輪結算開啟後自動接管焦點。
- Tab／Shift+Tab 限制在目前對話框內。
- Escape 關閉並還原焦點。
- AI 座位與資訊卡經 `render()` 重建後仍保留正確焦點。
- `aria-controls`、`aria-expanded` 與 dialog 語意同步。
- 全站主要鍵盤操作元素具有清楚的 `:focus-visible` 外框。

正式模組版本：

```text
DesktopAccessibilityFocus 2.1.0
```

### Build Manifest 與部署診斷

目前 Build ID：

```text
desktop-main-ai-v2-accessibility-focus-2026-08-05
```

`build-manifest.json` 已覆蓋：

- AI V1.7～V2 決策與 Boss Equity 模組。
- `js/accessibility-focus.js`。
- 淘汰賽雲端存檔 V1／V2 migrations。
- 首頁直接載入及動態載入的正式 JS／CSS。

部署契約檢查會確認：

- 正式引用資產存在且已登記於 Manifest。
- 動態載入模組受診斷頁覆蓋。
- 前端淘汰賽存檔 schemaVersion 有對應 migration。
- migration 保留舊版本並允許目前版本。

## 驗證方式

### 完整靜態與部署契約檢查

```bash
npm run validate
```

### Browser E2E

```bash
npm run test:e2e
```

GitHub Actions 會分別執行 Chromium 與 WebKit。涉及遊戲流程、下注、UI、淘汰賽、雲端、街道轉場、渲染或焦點管理的修改，兩個瀏覽器都必須通過。

### AI 固定種子校準

```bash
npm run test:ai-calibration
```

校準包含 V1.6 角色矩陣與 V1.9／V2 Boss 公平性、行動分布、Equity 樣本、fallback 與耗時報表。不得為了讓報表好看而硬寫答案或直接調高角色侵略率。

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
- 登入後 V2 寫入、讀回、暫停、恢復與刪除正常。
- GitHub Pages 發布後的正式載入檔版本正確。

### 第三優先：規則與結算細節

- 多人平分底池的奇數籌碼應明確依莊家左側順序分配。
- 多主池／邊池勝者動畫金額應與各自實領一致。
- 動態模組載入失敗應提供統一錯誤與診斷訊號，不應完全靜默忽略。

### AI V2 後續提升

以下屬於增強功能，不是目前阻塞 Bug：

- Board Texture Engine：乾燥、濕潤、同花、順子與 Pair Board 分類。
- 下注尺寸與 Range 聯動。
- Blocker／Unblocker 決策。
- 跨街行動歷史的完整範圍收窄鏈。

## 已知風險

- GitHub Pages 或瀏覽器快取可能短暫顯示舊檔。
- 舊 PR 或舊分支若直接合併，可能覆蓋目前 AI、Boss、淘汰賽或 UI。
- 多層相容載入器依賴正確載入順序，修改時必須跑完整 Chromium／WebKit E2E。
- CI 綠燈不能取代正式 Safari 手動操作與正式後端 smoke test。
- 本機舊資料夾不得拿來判斷正式網站狀態。

## Pull Request 整理

### 已被取代，不得直接合併

- PR #9：舊桌機無障礙分支，已由 PR #82 取代並關閉。
- PR #32：舊公平 Boss 修正。
- PR #46：舊 Range Continuation V1.3。

### 近期正式合併

- PR #78：AI V1.9 校準、CI 與發布基準。
- PR #79：Raise EV called-pot 會計修正。
- PR #80：AI V2 公開資訊條件化對手範圍。
- PR #82：桌機鍵盤與焦點無障礙 V2.1.0。

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
