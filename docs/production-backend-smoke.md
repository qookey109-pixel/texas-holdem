# 正式後端 Smoke Test

## 目的

正式 Browser E2E 會以 mock 驗證 Google Auth 與 Supabase 雲端存檔流程，但 mock 不能證明正式 GitHub Pages、Supabase 與 Gemini Worker 目前仍可連線。

本 Smoke Test 只做非破壞性讀取與契約驗證，不登入個人帳號、不保存 OAuth Token，也不建立測試存檔。

正式腳本：

```text
scripts/production-backend-smoke.mjs
```

正式 workflow：

```text
.github/workflows/production-smoke.yml
```

## 本機契約驗證

```bash
npm run validate:production-contract
```

完整 `npm run validate` 也會自動執行這項檢查。

驗證內容：

- Google Auth 與淘汰賽雲端存檔使用相同 Supabase URL。
- Google Auth 與雲端存檔使用相同 publishable key。
- Gemini Worker 使用 HTTPS。
- `js/config.js` 正式快取鏈為 AI V2.7。
- Build Manifest 包含 AI V2.7、V2.7 校準與正式 Smoke 資產。
- README 與 PROJECT_STATUS 已記錄 V2.7。
- Poker State Stress 文件與 workflow 都是每週日台北時間 03:30。
- Supabase migration 已啟用 RLS、撤銷 anon 權限，且 CRUD policy 都綁定 `auth.uid() = user_id`。
- 雲端存檔 migration 允許 V1／V2。

## 正式線上驗證

```bash
npm run test:production-smoke
```

可指定重試：

```bash
node scripts/production-backend-smoke.mjs \
  --live \
  --retries=6 \
  --retry-delay-ms=15000
```

正式驗證項目：

### GitHub Pages

- 首頁 HTTP 成功。
- 首頁載入 AI V2.7 的 config cache key。
- 線上 `js/config.js` 載入 AI V2.7。
- 線上 Build Manifest 的 build ID 與資產清單包含 AI V2.7。

### Supabase Auth

- `/auth/v1/settings` 可達。
- Google Provider 已啟用。

### 淘汰賽雲端存檔隔離

- 未登入的 anon 請求不得看到 `tournament_saves` 資料。
- 合格結果為 HTTP 401／403，或 RLS 回傳空陣列。
- Smoke Test 不執行 INSERT、UPDATE 或 DELETE，不會留下測試資料。

### Gemini Worker

- `/health` HTTP 成功。
- 回傳 `ok: true`。
- 回傳 `configured: true`，代表 `GEMINI_API_KEY` Secret 已設定。
- 記錄目前模型名稱。

## GitHub Actions 排程

Production Smoke 會在：

- 每次 push 到 `main` 後執行。
- 每週日台北時間約 03:10 執行。
- 手動 Run workflow 時執行。

Push 後會先保留 Pages 傳播時間，再以重試方式核對正式網站。

每次執行都會上傳：

```text
production-smoke-<run-id>/production-smoke-report.json
```

Artifact 保留 14 天。

## Google 真人登入手動 Smoke

自動化不能安全保存個人 Google OAuth 憑證，因此以下流程仍需人工執行：

1. 開啟正式 GitHub Pages。
2. 點擊玩家登入。
3. 使用專用測試 Google 帳號登入。
4. 確認返回正式網站，網址沒有殘留 OAuth error。
5. 開始淘汰賽並完成一手。
6. 確認 V2 存檔成功。
7. 重新整理頁面並恢復下一手。
8. 暫停後再次恢復。
9. 刪除雲端存檔。
10. 登出並確認未登入狀態無法讀取存檔。

測試帳號不得使用正式私人玩家資料。

## 判定原則

- 本機契約失敗：不得建立 PR。
- PR CI 失敗：不得合併。
- 合併後 Production Smoke 失敗：正式版本不可宣告完全驗收；需分辨 Pages 傳播、Supabase 設定、RLS 或 Worker Secret 問題。
- Google 真人登入未人工驗證時，只能宣告公開環境契約通過，不能宣告 OAuth 真人流程已驗證。
