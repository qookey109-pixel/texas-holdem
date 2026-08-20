# Texas Hold'em — Current Project Status

> 更新：2026-08-20（Asia/Taipei）
> 正式 Repository：`qookey109-pixel/texas-holdem`
> 正式發布：`main` / repository root / GitHub Pages

## Authority 規則

- 本頁記錄的是「最後一次完整核對的穩定狀態」，不是永久固定 SHA，也不記錄短暫的 Draft / running CI 狀態。
- 每次開始工作仍須重新讀取最新 `main`、open PR、Issue、CI 與正式站狀態；若本頁與 Repository 最新狀態衝突，以 Repository 為準。
- 2026-08-20 本頁刷新時，最後已確認合併節點為 PR #231，merge commit：`02d2abc72664a972637ae794033b1213a3909f9b`。
- 不要從舊聊天、舊 Handoff、`versions/` 或 `archive/` 反向覆蓋最新 `main`。

## 目前正式主線

核心網站維持 vanilla HTML / CSS / JavaScript、無 build step 的 GitHub Pages 架構。

目前正式能力包含：

- 核心牌局、下注、攤牌、教學、設定、桌面 / 手機版面。
- Google 登入與 Supabase tournament cloud save。
- Gemini 後端整合；服務端 API key 不放前端。
- 公平 Boss 保護：Oracle / Chronos / Gemini 不應取得未公開底牌、未發公共牌或未來牌序。
- AI 正式策略主線：V2.9.5；V2.7 仍保留為 core / calibration lineage。
- Normal Economy replacement stack：median-v2。
- Challenge Tournament Economy：G1，與 Normal Economy 分離。

## 2026-08-19～2026-08-20 Reliability / Health Audit 已完成節點

本輪 health audit 已完成並合併下列穩定 checkpoints：

- PR #220：Layout V4 cold-start rendered geometry authority 修正。
- PR #221：GitHub Pages deployment identity / parity gate 與 OCI syntax coverage。
- PR #223：第一次 `PROJECT_STATUS.md` authority refresh。
- PR #224：`js/events-boot.js` critical vs optional loader contract。
- PR #225：diagnostics bounded HEAD-first / Range fallback network hygiene。
- PR #226：OCI ↔ Worker public observation parity。
- PR #227：退役 3.09 MB auth-entry MP4，舊 ffmpeg workflow 改為 Vector/no-media contract。
- PR #228：`js/config.js` 最終 AI V2.9.5 / `AiActionDispatcherV1` / `ReplacementStackBalance` readiness authority gate。
- PR #229：Supabase browser client 固定為 `2.112.2` 並驗證實際 CDN ESM module loading。
- PR #230：OCI Python dependencies 固定為 `fdk==0.1.117`、`oci==2.182.1`、`requests==2.34.2`，並在 Python 3.12 下安裝/import/contract 驗證。
- PR #231：Cloudflare Worker Wrangler 固定為 `4.36.0`、加入 Worker-local `package-lock.json`，Repository health 以 `npm ci` + `wrangler deploy --dry-run` 驗證 toolchain reproducibility。

這些 checkpoint 均不得被後續文件整理或一般 cleanup 視為「待重做」。其精確驗證證據以對應 PR、Issue #222 與 GitHub Actions 為準。

## AI 現況

正式 AI 主線仍為 V2.9.5：

- V2.9 telemetry / long-run validation framework
- V2.9.2 runtime evidence calibration
- V2.9.3 middle / elite preflop recovery
- V2.9.4 opening balance telemetry integrity
- V2.9.5 opening balance + WTSD discipline/recovery

V1.x～V2.8 文件主要作歷史設計與 lineage 參考；正式 runtime 行為以最新 `main`、AI loader、dispatcher、tests 與最新 V2.9.x 證據為準。

`build-manifest.json` 保留 V2.7 core / calibration lineage，同時要求正式 loader 能追到 V2.9.5；`js/config.js` 現在另有 final authority readiness gate，會確認 V2.9.5、`AiActionDispatcherV1` 與 ReplacementStackBalance 實際可用。

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

- Issue #183 仍是 Long Session 設計 / evidence 主 authority。
- Long Session 不得因 repository health / UI cleanup 被順手改成正式 default。
- PR #210 是獨立 Gate evidence 線；在重新確認最新 base、diff、CI 與 evidence 前，不應因 health audit 狀態而合併。
- Normal Economy 仍是正式預設；Long Session production promotion 必須走獨立證據與授權。

## Repository Health Audit — 穩定狀態

Issue #222 是 project-health 主 tracker。

### 已完成 P1

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

### 尚未完成 P2

- 收斂分散 / stale 的 cache query labels，建立單一 release/cache generation authority 或 generated manifest value。
- 補齊 Build Manifest 對間接載入 runtime assets（例如 responsive CSS）的 asset graph。
- 建立 Cloudflare Worker ↔ OCI Gemini shared contract fixtures，防止 sanitizer / legal-action / public-observation / response validation 再次漂移。
- 若 public Gemini 使用量成長，再設計 budget / circuit breaker / WAF / session proof 等更強 abuse controls；不得只靠 CORS。
- layout stabilization 期後再評估把 responsive layout entry 從 `session-summary-layout-fix.css` import layering 解耦。
- 明確決定 Firefox 是否列入正式 support matrix，再決定是否新增 E2E。
- stale optional DOM selectors 僅能在 reference search + E2E 證明未使用後移除。

## 測試基準

必要驗證維持：

- Repository health
- Static site check
- Browser E2E / Chromium
- Browser E2E / WebKit critical
- Poker state stress（影響 state / betting / economy 時）
- Production Smoke
- GitHub Pages deployment
- AI / economy / backend / state-specific regressions when affected

Poker state stress 正式排程仍為**每週日 03:30（台灣時間）**，不是每日長跑。

任何產品 runtime 變更在 PR 階段至少要通過對應 Static + Browser / domain-specific checks；合併後仍須確認 Production Smoke 與 Pages deployment，才算正式驗收完成。

## 架構決策

目前不建議為了「整理」改寫成 React / Vite 或其他全新 framework。

維持 no-build static architecture，依低風險方式持續改善：deployment identity、boot-load contracts、backend parity、dependency pinning、diagnostics hygiene、cache-generation authority、必要時的局部模組化。

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
