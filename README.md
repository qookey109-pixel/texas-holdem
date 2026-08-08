# 德州撲克網頁遊戲

純 HTML、CSS、JavaScript 製作的德州撲克網頁遊戲，支援一般牌局、19 位永久淘汰賽、公平 Boss、Gemini 後端、牌局覆盤、雲端存檔、可調整牌桌介面與桌機鍵盤無障礙。

## 線上網站

- 正式網站：`https://qookey109-pixel.github.io/texas-holdem/`
- 診斷頁：`https://qookey109-pixel.github.io/texas-holdem/diagnostics.html`

## 唯一正式來源

GitHub Pages 使用：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/ (root)`

正式程式來源：`index.html`、`styles.css`、`app.js`、`js/`。過去的 `docs/` 重複網站副本已移除，不得重新建立第二套正式網站。

## Repository 與本機路徑

```text
Repository: qookey109-pixel/texas-holdem
Local: /Users/qoo/Documents/GitHub/texas-holdem
```

不要使用：

```text
qoo109/texas-holdem
/Users/qoo/Desktop/德州
```

## 目前主要功能

### 牌局與介面

- 六人 No-limit Texas Hold'em。
- 合法下注、加注、All-in、主池／邊池、攤牌與籌碼結算。
- 新手教學、撲克教練、牌局覆盤與本輪結算。
- 牌桌版面編輯、官方預設版面與尺寸控制。
- 童趣手繪／午夜牌組收藏。
- AI 情緒表情、座位發光、BGM 與音效分離控制。
- Safari 音訊恢復與公共牌街道轉場效能優化。
- 模式與 Gemini 控制 observer 只監聽相關 UI，避免閒置重複同步。

### AI 難度主線

```text
獨立角色策略 V1
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
→ 籌碼經濟與長期棄牌反制 V1
→ Normal Economy V2
→ Gemini
```

V2.7 正式模組：

```text
js/ai-tiered-multiway-equity-v2-7.js
AiTieredMultiwayEquityV27 2.7.0
```

籌碼經濟與棄牌反制模組：

```text
js/economy-fold-defense-v1.js
EconomyFoldDefenseV1 1.1.0
```

AI 只可使用自己的底牌、公共牌、公開位置、公開下注行動、可見籌碼與聚合後的玩家統計；不得讀取對手隱藏底牌、實際牌堆順序、未來公共牌或預定勝負答案。

### V2.7 實戰校準

固定校準涵蓋：

- 6 位中階與 4 位高階角色。
- 6 種翻牌前／翻牌後公開局面。
- 5 組固定種子。
- 共 300 次決策。
- VPIP／Open raise／3-bet 情境代理值。
- Raise／Call／Fold、Equity 修正、樣本數與 P95 決策時間。
- 隱藏對手底牌與 `state.deck` 防讀取安全閘。

```bash
npm run test:ai-calibration:v2.7
```

詳細文件：`docs/ai-gameplay-calibration-v2-7.md`。

### 一般模式公平重新買入 — Normal Economy V2

初始籌碼與盲注不變：

```text
初始籌碼 2,000
小盲 / 大盲 10 / 20
```

玩家與 AI 籌碼歸零後共用 `ReplacementStackBalance` 的 `median-v2` 計算來源。補位基準改用正籌碼玩家的中位數，避免單一籌碼王把下一位新玩家的帶入額拉高：

```text
min(
  正籌碼牌桌中位數 × 80%,
  當前完整買入 × 75%,
  60BB
)
```

另有 `12BB` 軟保底，但不會高於牌桌中位籌碼；若全桌已低於 `12BB`，新玩家不會被硬補到 `12BB` 或舊版的 `20BB`。結果向下取整至大盲單位。

因此：

- 正常 `100BB` 桌的新玩家帶入約 `60BB`，不再只有舊版約 `50BB`。
- 一位超大籌碼王不會扭曲補位值，主要依大多數存活玩家的典型深度計算。
- 極短碼桌的新玩家不會因最低 `20BB` 規則反而比存活玩家更富。
- 玩家爆掉後與 AI 補位使用同一計算來源。
- 一般模式每手開始時使用同一實際補位值作為當手重新買入顯示，避免牌局紀錄顯示名義 Buy-in、實際籌碼卻不同。

G1 淘汰賽經濟不使用這套一般模式公式。

### 長期低 VPIP／高棄牌反制

至少觀察 `8` 手後，符合任一條件才標記為偏緊被動：

```text
VPIP <= 18%
翻牌前棄牌率 >= 70%
```

反制方式：

- 初中高階角色依各自性格調整頻率。
- 未開池且位於後位時，合格牌力可用約 `2.2～2.4BB` 小尺寸偷盲。
- 乾燥翻牌／轉牌可用約 `33～40% pot` 小尺寸施壓。
- Toto、Pao、Dodo、Bruno 維持較保守性格。
- Oracle、Chronos 與 Gemini 保留各自 Boss 決策引擎，不由通用壓力層接管。

系統只使用公開行動、位置、下注尺寸、可見籌碼與聚合統計。

詳細文件：`docs/economy-fold-defense-v1.md`。

### G1 挑戰賽經濟

- 19 位永久淘汰賽，Gemini 最後登場。
- 6 位開局、13 位依序補位。
- 淘汰賽盲注只依手數推進，不因玩家籌碼領先而加速。
- 一般中高階新角色籌碼依當前大盲、桌面總 BB 與角色階級動態計算。
- 全桌目標 `170BB`、反應幅度 `15%`。
- 中階 `25／35／45BB`、高階 `30／40／50BB`、基礎特殊 Boss `35／45／60BB`、Gemini `40／50／70BB`。
- 13 位補位角色的 G1 基礎理論最大累積注入為 `660 entry-BB`。

有限 Boss 追趕：

- 玩家至少是最大 AI 籌碼的 `1.8 倍`才啟動。
- Oracle／Chronos：`40／55／75BB`。
- Gemini：`50／65／90BB`。
- 只使用牌桌可見籌碼。
- 不扣除玩家籌碼，不改變盲注、底牌、牌堆、公共牌或勝負結果。
- 一般中高階補位不使用玩家個人籌碼或勝率。

正式模組：

```text
ReplacementStackBalance 2.1.0
EconomyFoldDefenseV1 1.1.0
Normal Economy policy 2.0.0 / median-v2
```

### 公平 Boss 與 Gemini 公開觀察

- Oracle、Chronos 使用公開資訊、公平 Equity 與條件化對手範圍。
- Gemini 使用 Cloudflare Worker 安全後端或本地備援。
- Worker 現在會白名單清理並保留 `tournamentObservation`。
- 可使用 VPIP、棄牌／跟注／加注率、分街與位置公開行動率、近期公開事件、重複 All-in 聚合資訊與公開攤牌分類計數。
- 不傳遞未列入白名單的欄位、對手隱藏牌、牌堆順序、未來公共牌或原始攤牌牌張清單。

### 挑戰賽與雲端

- 分層候補、替換與對稱縮桌。
- Google 登入。
- Supabase 淘汰賽自動存檔、暫停、恢復與刪除。
- 雲端存檔 V2 保存累積 session 統計，並相容 V1 舊存檔。
- 存檔不包含底牌、牌堆、未來公共牌或完整逐步牌局紀錄。

Supabase migrations：

```text
supabase/migrations/20260803_create_tournament_saves_v1.sql
supabase/migrations/20260804_allow_tournament_save_v2.sql
```

### 桌機鍵盤與焦點無障礙

正式模組：

```text
DesktopAccessibilityFocus 2.1.0
```

支援 AI 座位 Enter／Space、Dialog focus trap、Escape 關閉與焦點還原、`aria-controls`、`aria-expanded` 與一致的 `:focus-visible`。

## 開始工作前

```bash
git remote -v
git status
git pull --ff-only
```

並先閱讀：

- `PROJECT_STATUS.md`
- `AGENTS.md`
- `versions/README.md`
- `build-manifest.json`

任何聊天紀錄、Handoff 或舊 PR 若與最新 GitHub `main` 衝突，以最新 Repository 為準。

## 驗證

### 靜態、部署與正式後端契約

```bash
npm run validate
npm run validate:deployment
npm run validate:production-contract
```

`npm run validate` 會確認正式資產、部署契約、V2.7 文件／Build Manifest、Supabase RLS migration 與公開端點設定一致。

### Browser E2E

```bash
npm install
npx playwright install chromium webkit
npm run test:e2e
```

GitHub Actions 會分別執行 Chromium 與 WebKit。

### 籌碼經濟與棄牌反制

```text
tests/e2e/economy-fold-defense-v1.spec.js
tests/e2e/replacement-stack-balance.spec.js
```

覆蓋一般模式 median-v2 對稱重買入、籌碼王離群值、極短碼桌、Boss 追趕上下限、低 VPIP／高棄牌分類、小尺寸壓力、公平資訊邊界與 Gemini Worker 公開觀察白名單。

### AI 固定種子校準

```bash
npm run test:ai-calibration
npm run test:ai-calibration:v1.6
npm run test:ai-calibration:v1.9
npm run test:ai-calibration:v2.7
```

### 長時間狀態壓力測試

```bash
npm run test:state-stress
npm run test:state-stress:100
```

正式壓力測試包含：

- PR 使用 25 手自然下注。
- 每週日台北時間約 03:30 執行 100 手自然下注。
- 牌張唯一、籌碼守恆、合法 Actor、Pot／Contribution／Current Bet、無負數籌碼、無卡死與殘留計時器。
- G1 19 位角色與 13 次補位循環。
- Gemini 最後登場、盲注不倒退、角色不重複、G1 基礎補位不超過 `660 entry-BB`。
- AI wrapper 載入順序不得形成遞迴或卡死。

### 正式環境 Smoke

```bash
npm run test:production-smoke
```

Production Smoke 會以零寫入方式驗證：

- GitHub Pages 正式版本與 V2.7 Build Manifest。
- Supabase Auth 設定與 Google Provider。
- 未登入玩家不可讀取淘汰賽存檔。
- Gemini Worker `/health` 與 Secret 設定。

它會在每次 `main` 部署後及每週日台北時間約 03:10 自動執行。Google 真人 OAuth 仍依 `docs/production-backend-smoke.md` 使用專用測試帳號人工驗證。

相關文件：

```text
docs/poker-state-stress-v1.md
docs/ai-calibration-v1-6.md
docs/ai-calibration-v1-9.md
docs/ai-v2-public-range-equity.md
docs/ai-tiered-multiway-equity-v2-7.md
docs/ai-gameplay-calibration-v2-7.md
docs/economy-fold-defense-v1.md
docs/production-backend-smoke.md
```

## 分支與發布流程

1. 重新核對最新 `main`。
2. 從最新 `main` 建立新分支。
3. 只修改本次需求需要的檔案。
4. 執行 `npm run validate` 與必要 E2E／AI Calibration／State Stress。
5. 建立 Pull Request。
6. 確認 PR head 未變且分支沒有落後。
7. 確認必要 CI 全綠。
8. 合併後重新核對正式 `main`、GitHub Pages、Production Smoke 與診斷頁。

## 過時 PR 注意事項

不得直接合併：

- PR #9：已由 PR #82 取代。
- PR #32：舊公平 Boss 修正。
- PR #46：舊 Range Continuation V1.3。
- PR #86：玩家領先加速盲注，已由 G1 與有限 Boss 追趕取代。
- PR #89：舊 16 位 F1 模擬，已由正式 19 位 G1 取代。

詳細狀態、已知風險與下一步請看 `PROJECT_STATUS.md`。
