# 正式後端 Smoke Test

## 目的

Browser E2E 會以 mock 驗證 Google Auth 與 Supabase 雲端存檔，但 mock 不能證明正式 GitHub Pages、Supabase、Gemini Worker 與目前 AI runtime 已實際部署。

Production Smoke 只做非破壞性讀取與契約驗證；不登入個人帳號、不保存 OAuth Token，也不建立測試存檔。

正式腳本：`scripts/production-backend-smoke.mjs`

正式 workflow：`.github/workflows/production-smoke.yml`

## 本機契約驗證

```bash
npm run validate:production-contract
```

完整 `npm run validate` 也會自動執行這項檢查。

主要驗證：

- Google Auth 與淘汰賽雲端存檔使用相同 Supabase URL / publishable key。
- Gemini Worker 使用 HTTPS。
- `js/config.js` 保留 AI V2.7 相容核心。
- `js/elite-character-presentation.js` 實際載入 V2.9.5 與目前 dispatcher。
- Build Manifest 同時包含 V2.7 core 與 V2.9.5 runtime，build ID 也必須識別兩者。
- README 與 PROJECT_STATUS 必須識別目前 V2.9.5 runtime。
- Poker State Stress workflow 為每週日台北時間 03:30。
- Supabase migration 已啟用 RLS、撤銷 anon 權限，CRUD policy 綁定 `auth.uid() = user_id`。
- 雲端存檔 migration 允許 V1／V2。

## 正式線上驗證

```bash
npm run test:production-smoke
```

需要部署傳播重試時：

```bash
node scripts/production-backend-smoke.mjs \
  --live \
  --retries=6 \
  --retry-delay-ms=15000
```

### GitHub Pages / AI runtime

- 首頁 HTTP 成功並載入 `js/config.js`。
- 線上 config 保留 AI V2.7 相容核心。
- 線上 `js/elite-character-presentation.js` 必須載入 V2.9.5 與目前 dispatcher。
- 線上 Build Manifest 的 build ID、asset map 與 feature map 必須同時包含 V2.7 core 與 V2.9.5 runtime。

這避免正式網站仍停在舊 manifest / 舊 loader 時，Production Smoke 因只看到 V2.7 marker 而錯誤通過。

### Supabase Auth / 存檔隔離

- `/auth/v1/settings` 可達且 Google Provider 已啟用。
- 未登入 anon 不得看到 `tournament_saves` 資料。
- 合格結果為 HTTP 401／403，或 RLS 回傳空陣列。
- Smoke Test 不執行 INSERT、UPDATE 或 DELETE。

### Gemini Worker

- `/health` HTTP 成功。
- 回傳 `ok: true`。
- 回傳 `configured: true`，代表 `GEMINI_API_KEY` Secret 已設定。
- 記錄目前模型名稱。

## GitHub Actions

Production Smoke 會在：

- 每次 push 到 `main` 後執行。
- 每週日台北時間約 03:10 執行。
- 手動 Run workflow 時執行。

Push 後會先保留 Pages 傳播時間，再以重試方式核對正式網站。每次執行會上傳 `production-smoke-<run-id>/production-smoke-report.json`，Artifact 保留 14 天。

## Google 真人登入手動 Smoke

自動化不能安全保存個人 Google OAuth 憑證，因此真人登入仍需人工測試：

1. 開啟正式 GitHub Pages。
2. 使用專用測試 Google 帳號登入。
3. 確認返回正式網站且沒有 OAuth error。
4. 開始淘汰賽並完成一手。
5. 確認 V2 存檔成功。
6. 重新整理並恢復下一手。
7. 暫停、恢復、刪除雲端存檔。
8. 登出並確認未登入狀態無法讀取存檔。

測試帳號不得使用正式私人玩家資料。

## 判定原則

- 本機契約失敗：不得建立 PR。
- PR CI 失敗：不得合併。
- 合併後 Production Smoke 失敗：正式版本不可宣告完全驗收；需分辨 Pages 傳播、AI runtime、Supabase、RLS 或 Worker 問題。
- Google 真人登入未人工驗證時，只能宣告公開環境契約通過，不能宣告 OAuth 真人流程已驗證。
