# Texas Hold'em — Current Project Status

> 更新：2026-08-23（Asia/Taipei）
> 正式 Repository：`qookey109-pixel/texas-holdem`
> 正式發布：`main` / repository root / GitHub Pages

## Authority 規則

- 本頁記錄「最後一次完整核對的穩定狀態」，不是永久固定 SHA，也不記錄短暫的 Draft / running CI 狀態。
- 每次開始工作仍須重新讀取最新 `main`、open PR、Issue、CI 與正式站狀態；若本頁與 Repository 最新狀態衝突，以 Repository 為準。
- 2026-08-23 本頁刷新時，最後已確認合併節點為 PR #241，merge commit：`21d231c8a88a96f26435b3af0995d9154208a737`。
- 不要從舊聊天、舊 Handoff、`versions/` 或 `archive/` 反向覆蓋最新 `main`。

## 目前正式主線

核心網站維持 vanilla HTML / CSS / JavaScript、無 build step 的 GitHub Pages 架構。

目前正式能力包含：

- 核心牌局、下注、攤牌、教學、設定、桌面 / 手機版面。
- Google 登入與 Supabase tournament cloud save。
- Gemini 後端整合；正式後端可採 Cloudflare Worker 或 OCI Function，前端共用 `/health` 與 `/v1/decision` contract，服務端 API key 不放前端。
- 公平 Boss 保護：Oracle / Chronos / Gemini 不應取得未公開底牌、未發公共牌或未來牌序。
- AI 正式策略主線：V2.9.5；V2.7 保留為 core / calibration lineage。
- Normal Economy replacement stack：median-v2。
- Challenge Tournament Economy：G1，與 Normal Economy 分離。
- Runtime cache generation 由根目錄 `cache-generation.json` 統一管理。
- Cloudflare Worker ↔ OCI Gemini shared contract fixture 已成為 backend parity authority。

## 2026-08-19～2026-08-23 Reliability / Health Audit 穩定 checkpoints

本輪 health audit 已完成並合併下列 checkpoints；後續 cleanup 不應把它們重新視為待辦：

- PR #220：Layout V4 cold-start rendered geometry authority 修正。
- PR #221：GitHub Pages deployment identity / parity gate 與 OCI Python syntax coverage。
- PR #223：第一輪 `PROJECT_STATUS.md` authority refresh。
- PR #224：`js/events-boot.js` critical vs optional loader contract。
- PR #225：diagnostics bounded HEAD-first / Range fallback network hygiene。
- PR #226：OCI ↔ Worker public observation parity。
- PR #227：退役 auth-entry MP4，舊 media workflow 改為 Vector/no-media contract。
- PR #228：`js/config.js` 最終 AI V2.9.5 / dispatcher / replacement economy readiness authority gate。
- PR #229：Supabase browser client 固定為 `2.112.2`，並驗證精確 CDN ESM module loading。
- PR #230：OCI dependencies 固定為 `fdk==0.1.117`、`oci==2.182.1`、`requests==2.34.2`，並以 Python 3.12 驗證安裝 / import / contract。
- PR #231：Cloudflare Worker Wrangler 固定為 `4.36.0`、加入 Worker-local lockfile，Repository health 使用 `npm ci` + non-deploy dry-run bundle 驗證 reproducibility。
- PR #234：Build Manifest 補齊 transitive CSS coverage，local CSS `@import` 依賴會被 CI 驗證。
- PR #239：根目錄 `cache-generation.json` 成為唯一 runtime cache generation authority，完成 117/117 runtime query migration。
- PR #240：建立 versioned Gemini backend shared contract fixtures，統一 Worker ↔ OCI request sanitization、legal-action、public-observation 與 decision validation contract。
- PR #242：穩定 `ui-polish-accessibility-v1` E2E 的 browser-turn timing assertion；test-only，未修改 runtime。
- PR #241：Gemini boss button stable-state sync 改為 idempotent；Chromium / WebKit observer diagnostics 均確認 `geminiBossButton idleWrites=0`，未修改 Gemini decision policy。

精確驗證證據以各 PR、Issue #222 與 GitHub Actions 為準。

## AI 現況

正式 AI 主線仍為 V2.9.5：

- V2.9 telemetry / long-run validation framework
- V2.9.2 runtime evidence calibration
- V2.9.3 middle / elite preflop recovery
- V2.9.4 opening balance telemetry integrity
- V2.9.5 opening balance + WTSD discipline / recovery

V1.x～V2.8 文件主要作歷史設計與 lineage 參考；正式 runtime 行為以最新 `main`、AI loader、dispatcher、tests 與最新 V2.9.x 證據為準。

`build-manifest.json` 保留 V2.7 core / calibration lineage；`js/config.js` 另有 final authority readiness gate，會確認 V2.9.5、`AiActionDispatcherV1` 與 `ReplacementStackBalance` 實際可用。

## 籌碼經濟

### Normal Economy

現行 replacement stack 為 median-v2：

```text
min(
  正籌碼牌桌中位數 × 80%,
  當前完整買入 × 75%,
  60BB
)
```

保留 12BB soft floor，但不把補位硬抬到高於桌面中位數。玩家與 AI 共用同一原則。

### Challenge Tournament G1

| Tier | Min | Target | Max |
| --- | ---: | ---: | ---: |
| Middle | 80BB | 90BB | 100BB |
| Elite | 90BB | 105BB | 120BB |
| Special | 100BB | 115BB | 135BB |
| Gemini | 110BB | 130BB | 150BB |

- full-table target：170BB
- blend response：0.15
- theoretical replacement ceiling：1500BB

G1 與 Normal Economy 分開，不應互相覆蓋。

## Long Session

- Issue #183 是 Long Session 設計 / evidence 主 authority。
- Long Session 不得因 repository health / UI cleanup 被順手改成正式 default。
- PR #210 是獨立 Gate evidence 線；在重新確認最新 base、diff、CI 與 evidence 前，不應因 health audit 狀態而合併。
- Normal Economy 仍是正式預設；Long Session production promotion 必須走獨立證據與授權。

## Repository Health Audit — 穩定狀態

Issue #222 是 project-health 主 tracker。

### P1

P1 reliability / authority tranche 已完成：

- critical vs optional boot loader authority
- diagnostics network hygiene
- OCI ↔ Worker public observation parity
- `config.js` AI / replacement authority readiness
- Supabase browser dependency reproducibility
- OCI Python dependency reproducibility
- Cloudflare Worker / Wrangler toolchain reproducibility

### 已完成 P2

- retired auth-entry MP4 從 Repository / deploy graph 移除
- auth-entry media workflow 改為 Vector/no-media contract
- Build Manifest transitive CSS coverage
- runtime cache generation authority 收斂
- Cloudflare Worker ↔ OCI Gemini shared contract fixtures

### 尚未完成 P2

- 若 public Gemini 使用量成長，再評估 budget / circuit breaker / WAF / session proof 等更強 cost-abuse controls；CORS 不是 abuse-control boundary。Cloudflare 20/min/IP 與 OCI example 2/sec/IP 的現行差異若要對齊，必須明確決策，不可靜默改一側。
- layout stabilization 期後，再評估把 responsive layout entry 從 `session-summary-layout-fix.css` import layering 解耦。
- 明確決定 Firefox 是否列入正式 support matrix；只有列入才新增對應 E2E。
- stale optional DOM selectors 僅能在 reference search + E2E 證明未使用後移除。

## 測試基準

必要驗證依變更範圍維持：

- Repository health
- Static site check
- Browser E2E / Chromium full
- Browser E2E / WebKit critical
- Poker state stress（影響 state / betting / economy 時）
- Production Smoke
- GitHub Pages deployment
- AI / economy / backend / state-specific regressions when affected

Poker state stress 正式排程仍為**每週日 03:30（台灣時間）**，不是每日長跑。

任何產品 runtime 變更在 PR 階段至少要通過對應 Static + Browser / domain-specific checks；合併後仍須確認適用的 Production Smoke 與 Pages deployment，才算正式驗收完成。

## 架構決策

目前不建議為了「整理」改寫成 React / Vite 或其他全新 framework。

維持 no-build static architecture，依低風險方式持續改善：deployment identity、boot-load contracts、backend parity、dependency pinning、diagnostics hygiene、cache-generation authority，以及有明確證據時的局部模組化。

優點是可延續現有大量 E2E 與已驗證成果；缺點是 globals / layered CSS 的歷史負擔會逐步而不是一次消失。現階段這個取捨比全面重寫安全。

## 文件規則

正式閱讀順序：

1. `README.md` — 專案介紹、玩法與操作
2. `PROJECT_STATUS.md` — 穩定狀態頁，但仍須即時核對 Repository
3. `docs/README.md` — 技術文件索引
4. `AGENTS.md` — 維護與驗證規則
5. `versions/README.md` — 歷史快照政策

不要再建立第二份「目前狀態」文件。可由 CI / tests / PR 證明的結果，優先保留在對應 evidence，而不是複製大量 acceptance 文件。

## 保留 / 禁止誤刪

- `archive/chat-imports/`：歷史復原 evidence，未完成 provenance review 前保留。
- `versions/`：歷史 snapshot policy 範圍，不能因為「看起來重複」直接刪除。
- `.github/ai-long-run-*-triggers/`：Actions 觸發檔，不是一般文件。
- 任何 Long Session evidence / deterministic seed / artifact lineage，不得在一般 cleanup 中破壞。

## Health audit 禁止順手修改

- AI V2.9.5 strategy / behavior
- Normal Economy replacement-stack formula
- Tournament G1 tuning
- Long Session default / promotion
- archive / versions provenance
