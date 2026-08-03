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

V1.6 校準工作建立時，最新正式 `main` 為：

```text
ef31d6c916384a555e33d24515c8dfc3e1386d5b
```

該版本包含：

- AI 難度主線 V1.1～V1.5
- V1.5.1 專案狀態與 Build Manifest 整理
- Oracle／Chronos 公平七星 Boss
- Gemini 安全後端與本地備援
- 19 位永久淘汰賽、候補與縮桌
- Google 登入、Supabase 淘汰賽雲端存檔
- Safari 公共牌街道轉場效能層

後續工作不得把上述 SHA 當成永久最新值；每次開始前仍須重新讀取 GitHub `main`。

## AI 難度主線

### V1.1 多街角色策略

- 10 位中階與高階角色具有獨立策略差異。
- 支援多街計畫、Check-Raise、河牌分類、阻擋牌詐唬與延遲施壓。
- 使用公開資訊，不讀取對手底牌、牌堆或未來公共牌。

### V1.2 翻牌前位置化範圍

- UTG、MP、HJ、CO、BTN、SB、BB 使用不同開池門檻。
- 支援盲位防守、3-bet、4-bet、Squeeze 與短碼價值 All-in。
- 角色寬度、尺寸與侵略性維持差異。

### V1.3 分街玩家模型

- 分街統計玩家 Fold、Call、Raise、Check-Fold、Check-Raise 與尺寸習慣。
- 樣本不足時維持原策略，不因少量牌局過度針對。
- AI 可對過度棄牌、跟注站、過度侵略與下注尺寸漏洞調整。

### V1.4 長期安全記憶

- 聚合後的公開玩家統計可保留於瀏覽器。
- 登入淘汰賽時可隨既有雲端存檔恢復。
- 不保存底牌、公共牌、牌堆、未來牌面或完整逐步牌局紀錄。
- 載入資料會經白名單、數值限制與異常清洗。

### V1.5 多人底池與公開範圍分布

- 依公開位置、下注順序、加注次數與尺寸估計各對手範圍。
- 三人以上底池收斂純詐唬與弱聽牌半詐唬。
- 調整多人厚價值尺寸、薄價值控制與 Bluff Catch 門檻。
- 收緊翻牌前多人 Cold Call，保留頂端價值與合理 Squeeze。
- 單挑底池維持 V1.3 原決策。

### V1.6 固定種子難度校準

- 新增測試專用 `AiCalibrationLab 1.0.0`，正式首頁不載入。
- 完整測量 169 種起手牌類別與 1,326 種實際組合權重。
- 統計 UTG／CO／BTN／SB 開池、VPIP、面對開池、3-bet、4-bet 與 Squeeze。
- 使用固定翻牌後情境統計空氣牌、強聽牌、薄價值、Bluff Catch 與多人底池決策。
- 相同種子與輸入必須產生完全相同的 JSON 報表。
- Playwright 報表附加 JSON 與 Markdown 校準結果。
- V1.6 只量化現有策略，不修改正式 AI 參數，也不宣稱為 GTO／solver 解答。

## 公平 Boss 與 Gemini 邊界

- Oracle、Chronos 使用公平公開資訊策略，不具全知能力。
- 不得重新加入 `omniscient: true`、隱藏底牌讀取、實際牌堆讀取或未來牌面答案。
- Gemini 經安全後端或玩家自行設定的相容 Provider 執行。
- Gemini 後端／備援與中高階本機 AI 是不同系統，不得混為同一版本。
- V1.6 校準器不接管 Oracle、Chronos 或 Gemini。

## 淘汰賽與雲端功能

目前已完成：

- 19 位永久淘汰賽流程，Gemini 最後登場。
- 分層候補、新角色替換與對稱縮桌。
- 淘汰賽模式入口與一般模式切換。
- Google 登入玩家身分。
- Supabase 淘汰賽自動存檔、暫停、恢復與刪除。
- AI V1.4 公開統計隨既有淘汰賽存檔安全同步。

## 顯示與效能

- AI 每次反應最多顯示一個情緒表情。
- AI 思考改用座位發光，不顯示舊進度條。
- 牌桌版面編輯、尺寸控制、牌組收藏、新手教學與本輪結算保留。
- Safari 音訊恢復與 BGM／音效分離控制保留。
- `StreetTransitionPerformance 1.0.0` 會先繪製公共牌，再於後續畫面幀更新完整牌桌，降低 Safari 街道切換頓感。

## 驗證狀態

近期 AI、效能與文件 PR 使用以下驗證：

- `Static site check`
- Chromium 完整 Browser E2E
- WebKit 完整 Browser E2E

已確認的近期里程碑：

- PR #47：AI V1.3，自適應玩家模型
- PR #48：AI V1.4，長期玩家記憶
- PR #49：Safari 公共牌街道轉場效能
- PR #50：AI V1.5，多人底池與公開範圍分布
- PR #51：V1.5.1 專案狀態與 Manifest 整理

V1.6 另加入：

```bash
npm run test:ai-calibration
```

CI 綠燈不能取代正式網站手動驗證。發布後仍應檢查：

- 首頁與診斷頁
- Safari Console 與 Network
- 一般模式與挑戰賽
- 翻牌、轉牌、河牌公共牌轉場
- Google 登入及淘汰賽雲端恢復
- Gemini 後端與本地備援

## Pull Request 整理規則

### 已被取代，不得直接合併

- PR #32：舊公平 Boss 修正分支；正式 `main` 已有後續公平 Boss V2。
- PR #46：舊版 Range Continuation V1.3；與目前自適應 V1.3 使用同名決策層，且已被 V1.3～V1.5 架構取代。

上述 PR 已關閉。不得重新開啟後直接合併。

### 仍可評估，但必須重新移植

- PR #9：桌機鍵盤與焦點無障礙功能。

PR #9 建立於舊主線，不應直接合併。若要採用，需從最新 `main` 建新分支，重新核對目前 DOM、設定選單、淘汰賽入口與完整 E2E。

## 尚未完成

### 第一優先：檢視 V1.6 校準結果

V1.6 報表用於辨識：

- 角色是否過度緊或過度鬆
- 位置差異是否合理
- 3-bet／4-bet／Squeeze 是否失衡
- 多人純詐唬是否確實低於單挑
- 強價值與 Bluff Catch 是否出現異常
- 各角色頻率是否過度接近

若需要調整，必須以獨立小型 PR 修改參數，不得為了讓測試好看而降低公平性或硬寫預定答案。

### 第二優先：長時間牌局壓力測試

快速模擬數百至數千手並檢查：

- 籌碼總量守恆
- 無負數籌碼
- 無不合法加注
- All-in、主池與邊池正確
- 公共牌與牌組不重複
- 每手牌都能完成
- 沒有無限等待或計時器殘留
- AI 記憶資料不會無限制膨脹
- 淘汰賽縮桌、替換與恢復不會卡死

### 待本機確認

在正式 Mac 工作副本執行：

```bash
git remote -v
git status
git pull --ff-only
```

確認 `origin` 指向 `qookey109-pixel/texas-holdem`，並確認沒有未提交修改。

## 已知風險

- GitHub Pages 或瀏覽器快取可能短暫顯示舊檔。
- 舊 PR 或舊分支若直接合併，可能覆蓋目前 AI、Boss、淘汰賽或 UI。
- 多層相容載入器依賴正確載入順序；修改時必須跑完整 Chromium／WebKit E2E。
- 固定情境校準可比較版本差異，但不能取代真實玩家、完整牌局 EV 或 solver 分析。
- E2E 無法完全取代長時間隨機牌局與真實 Safari 手動測試。
- 本機舊資料夾可能顯示未同步畫面，不得拿來判斷正式網站狀態。

## 開發規則

1. 每次開始前重新讀取最新 GitHub `main`。
2. 從最新 `main` 建立獨立分支與 Pull Request。
3. 不要直接修改或未驗證合併到 `main`。
4. 不要 force push。
5. 不要使用舊 Repository 或舊桌面資料夾。
6. 不得讓任何 AI 讀取對手底牌、實際牌堆或未來公共牌。
7. 提交前執行 `node scripts/validate-static-site.mjs`。
8. 涉及遊戲流程或 UI 時執行完整 Browser E2E。
9. AI 策略調整前先執行固定種子校準，並保存可比較報表。
10. 合併前確認 PR head 未變、分支未落後、Static／Chromium／WebKit 全綠。
11. 合併後重新核對正式 `main` 與網站載入檔。
