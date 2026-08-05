import { readFile } from "node:fs/promises";
import process from "node:process";

const ROOT = new URL("../", import.meta.url);
const FORMAL_SITE = "https://qookey109-pixel.github.io/texas-holdem/";
const REQUEST_TIMEOUT_MS = 12_000;

function parseArguments(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [name, inline] = value.split("=", 2);
    if (inline !== undefined) values.set(name, inline);
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) values.set(name, argv[++index]);
    else flags.add(name);
  }
  return {
    contractOnly: flags.has("--contract-only"),
    live: flags.has("--live"),
    baseUrl: values.get("--base-url") || process.env.PRODUCTION_SITE_URL || FORMAL_SITE,
    retries: Math.max(1, Number.parseInt(values.get("--retries") || "1", 10) || 1),
    retryDelayMs: Math.max(0, Number.parseInt(values.get("--retry-delay-ms") || "5000", 10) || 0),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function match(source, expression, label) {
  const result = source.match(expression)?.[1] || "";
  assert(result, `Unable to resolve ${label}`);
  return result;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  assert(url.protocol === "https:", "Production smoke requires HTTPS");
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      headers: {
        "user-agent": "texas-holdem-production-smoke/1.0",
        accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function jsonOrText(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function contractCheck() {
  const [
    config,
    auth,
    cloudSave,
    manifestText,
    migrationV1,
    migrationV2,
    readme,
    projectStatus,
    stressWorkflow,
  ] = await Promise.all([
    read("js/config.js"),
    read("js/google-auth.js"),
    read("js/tournament-cloud-save.js"),
    read("build-manifest.json"),
    read("supabase/migrations/20260803_create_tournament_saves_v1.sql"),
    read("supabase/migrations/20260804_allow_tournament_save_v2.sql"),
    read("README.md"),
    read("PROJECT_STATUS.md"),
    read(".github/workflows/poker-state-stress.yml"),
  ]);

  const workerEndpoint = match(
    config,
    /window\.GEMINI_BACKEND_ENDPOINT\s*\|\|=\s*["']([^"']+)["']/,
    "Gemini Worker endpoint",
  );
  const authProjectUrl = match(auth, /projectUrl:\s*["']([^"']+)["']/, "auth project URL");
  const authPublishableKey = match(auth, /publishableKey:\s*["']([^"']+)["']/, "auth publishable key");
  const saveProjectUrl = match(cloudSave, /projectUrl:\s*["']([^"']+)["']/, "cloud-save project URL");
  const savePublishableKey = match(cloudSave, /publishableKey:\s*["']([^"']+)["']/, "cloud-save publishable key");
  const manifest = JSON.parse(manifestText);
  const assetPaths = new Set((manifest.assets || []).map(asset => asset.path));
  const featureAssets = new Set(
    (manifest.features || []).flatMap(feature => Array.isArray(feature.assets) ? feature.assets : []),
  );

  assert(authProjectUrl === saveProjectUrl, "Auth and cloud-save Supabase URLs differ");
  assert(authPublishableKey === savePublishableKey, "Auth and cloud-save publishable keys differ");
  assert(workerEndpoint.startsWith("https://"), "Gemini Worker endpoint must use HTTPS");
  assert(authProjectUrl.startsWith("https://"), "Supabase project URL must use HTTPS");
  assert(authPublishableKey.startsWith("sb_publishable_"), "Expected a Supabase publishable key");
  assert(config.includes("tiered-multiway-equity-v2-7"), "Config cache chain is not on AI V2.7");
  assert(assetPaths.has("js/ai-tiered-multiway-equity-v2-7.js"), "Build Manifest is missing AI V2.7 module");
  assert(featureAssets.has("js/ai-tiered-multiway-equity-v2-7.js"), "Build Manifest feature map is missing AI V2.7 module");
  assert(assetPaths.has("tests/support/ai-gameplay-calibration-v2-7.js"), "Build Manifest is missing V2.7 calibration lab");
  assert(assetPaths.has("scripts/production-backend-smoke.mjs"), "Build Manifest is missing production smoke script");
  assert(String(manifest.buildId || "").includes("ai-v2-7"), "Build ID does not identify AI V2.7");
  assert(readme.includes("V2.7"), "README does not document AI V2.7");
  assert(projectStatus.includes("V2.7"), "PROJECT_STATUS does not document AI V2.7");
  assert(projectStatus.includes("5d2179b917b86b8b187a1936918ab6dbd32fee3a") || projectStatus.includes("每次開始工作仍須重新讀取"), "PROJECT_STATUS lacks a current-baseline warning");
  assert(stressWorkflow.includes('cron: "30 19 * * 6"'), "Poker state stress is not scheduled for Sunday 03:30 Taiwan time");
  assert(readme.includes("每週日") && projectStatus.includes("每週日"), "Documentation still describes the stress run as daily");

  const normalizedV1 = migrationV1.toLowerCase();
  assert(normalizedV1.includes("enable row level security"), "Tournament saves RLS is not enabled");
  assert(normalizedV1.includes("revoke all on table public.tournament_saves from anon"), "Anonymous tournament-save privileges are not revoked");
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert(normalizedV1.includes(`for ${operation}`), `Missing ${operation} RLS policy`);
    assert(normalizedV1.includes("auth.uid() = user_id"), "Tournament-save policies are not user-bound");
  }
  assert(/check\s*\(save_version\s+in\s*\(1,\s*2\)\)/i.test(migrationV2), "V2 migration does not allow save versions 1 and 2");

  return {
    ok: true,
    mode: "contract",
    buildId: manifest.buildId,
    workerEndpoint,
    supabaseProjectUrl: authProjectUrl,
    supabaseProjectRef: new URL(authProjectUrl).hostname.split(".")[0],
    publishableKeyPrefix: authPublishableKey.slice(0, 20),
    checks: {
      v27CacheChain: true,
      manifestAssets: true,
      documentation: true,
      weeklyStressSchedule: true,
      rls: true,
      saveVersionMigration: true,
    },
  };
}

async function liveCheck(contract, baseUrl) {
  const site = normalizeBaseUrl(baseUrl);
  const pagesRoot = await fetchWithTimeout(site, { headers: { accept: "text/html" } });
  const root = await jsonOrText(pagesRoot);
  assert(pagesRoot.ok, `GitHub Pages root failed: HTTP ${pagesRoot.status}`);
  assert(root.text.includes("js/config.js?v=tiered-multiway-equity-v2-7"), "GitHub Pages root is not loading the V2.7 config cache key");

  const liveConfigResponse = await fetchWithTimeout(new URL("js/config.js", site));
  const liveConfig = await liveConfigResponse.text();
  assert(liveConfigResponse.ok, `Live config failed: HTTP ${liveConfigResponse.status}`);
  assert(liveConfig.includes("tiered-multiway-equity-v2-7"), "Live config is not loading AI V2.7");

  const manifestResponse = await fetchWithTimeout(new URL("build-manifest.json", site));
  const manifestPayload = await jsonOrText(manifestResponse);
  assert(manifestResponse.ok && manifestPayload.json, `Live Build Manifest failed: HTTP ${manifestResponse.status}`);
  assert(String(manifestPayload.json.buildId || "").includes("ai-v2-7"), "Live Build Manifest is not on AI V2.7");
  assert(
    (manifestPayload.json.assets || []).some(asset => asset.path === "js/ai-tiered-multiway-equity-v2-7.js"),
    "Live Build Manifest omits AI V2.7",
  );

  const workerResponse = await fetchWithTimeout(`${contract.workerEndpoint.replace(/\/$/, "")}/health`);
  const workerPayload = await jsonOrText(workerResponse);
  assert(workerResponse.ok, `Gemini Worker health failed: HTTP ${workerResponse.status}`);
  assert(workerPayload.json?.ok === true, "Gemini Worker health did not return ok=true");
  assert(workerPayload.json?.configured === true, "Gemini Worker is online but GEMINI_API_KEY is not configured");

  const supabaseHeaders = {
    apikey: contract.publishableKey,
    authorization: `Bearer ${contract.publishableKey}`,
  };
  const authSettingsResponse = await fetchWithTimeout(
    `${contract.supabaseProjectUrl}/auth/v1/settings`,
    { headers: supabaseHeaders },
  );
  const authSettings = await jsonOrText(authSettingsResponse);
  assert(authSettingsResponse.ok && authSettings.json, `Supabase auth settings failed: HTTP ${authSettingsResponse.status}`);
  const googleEnabled = authSettings.json?.external?.google === true
    || authSettings.json?.external?.providers?.includes?.("google")
    || authSettings.json?.providers?.google === true;
  assert(googleEnabled, "Supabase Google provider is not enabled");

  const anonymousReadResponse = await fetchWithTimeout(
    `${contract.supabaseProjectUrl}/rest/v1/tournament_saves?select=user_id&limit=1`,
    { headers: supabaseHeaders },
  );
  const anonymousRead = await jsonOrText(anonymousReadResponse);
  const denied = [401, 403].includes(anonymousReadResponse.status);
  const emptyByRls = anonymousReadResponse.ok
    && Array.isArray(anonymousRead.json)
    && anonymousRead.json.length === 0;
  assert(denied || emptyByRls, "Anonymous users can observe tournament-save rows");

  return {
    ok: true,
    mode: "live",
    site,
    buildId: manifestPayload.json.buildId,
    pages: { status: pagesRoot.status },
    worker: {
      status: workerResponse.status,
      configured: workerPayload.json.configured,
      model: workerPayload.json.model || "",
    },
    supabase: {
      projectRef: contract.supabaseProjectRef,
      authSettingsStatus: authSettingsResponse.status,
      googleProvider: true,
      anonymousTournamentSaveAccess: denied ? "denied" : "empty-by-rls",
    },
  };
}

async function withRetries(fn, attempts, delayMs) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

const options = parseArguments(process.argv.slice(2));

try {
  const contract = await contractCheck();
  contract.publishableKey = match(
    await read("js/google-auth.js"),
    /publishableKey:\s*["']([^"']+)["']/,
    "auth publishable key",
  );

  const output = { contract: { ...contract } };
  delete output.contract.publishableKey;

  if (options.live || !options.contractOnly) {
    output.live = await withRetries(
      () => liveCheck(contract, options.baseUrl),
      options.retries,
      options.retryDelayMs,
    );
  }

  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(`[production-smoke] ${error?.stack || error}`);
  process.exitCode = 1;
}
