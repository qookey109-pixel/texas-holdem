import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

const ROOT = new URL("../", import.meta.url);
const FORMAL_SITE = "https://qookey109-pixel.github.io/texas-holdem/";
const REQUEST_TIMEOUT_MS = 12_000;
const MANIFEST_PATH = "build-manifest.json";
const DEFAULT_FEATURE_ID = "core-game";
const CONTROL_TARGETS = Object.freeze([
  MANIFEST_PATH,
  "js/official-layout-preset.js",
  "js/layout-readability-trial.js",
]);

function parseArguments(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [name, inline] = value.split("=", 2);
    if (inline !== undefined) {
      values.set(name, inline);
      continue;
    }
    if (name === "--local-only") {
      flags.add(name);
      continue;
    }
    if (argv[index + 1] && !argv[index + 1].startsWith("--")) values.set(name, argv[++index]);
    else flags.add(name);
  }

  return {
    baseUrl: values.get("--base-url") || process.env.PRODUCTION_SITE_URL || FORMAL_SITE,
    featureId: values.get("--feature") || DEFAULT_FEATURE_ID,
    localOnly: flags.has("--local-only"),
    retries: Math.max(1, Number.parseInt(values.get("--retries") || "1", 10) || 1),
    retryDelayMs: Math.max(0, Number.parseInt(values.get("--retry-delay-ms") || "5000", 10) || 0),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  assert(url.protocol === "https:", "Static parity verification requires HTTPS");
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readManifest() {
  const source = await readFile(new URL(MANIFEST_PATH, ROOT), "utf8");
  return JSON.parse(source);
}

function parityTargets(manifest, featureId) {
  const assets = new Set((manifest.assets || []).map(asset => asset?.path).filter(Boolean));
  const feature = (manifest.features || []).find(candidate => candidate?.id === featureId);
  assert(feature, `build-manifest.json is missing feature ${featureId}`);
  assert(Array.isArray(feature.assets) && feature.assets.length > 0, `feature ${featureId} has no assets`);

  for (const path of feature.assets) {
    assert(assets.has(path), `feature ${featureId} references untracked asset ${path}`);
  }

  return [...new Set([...CONTROL_TARGETS, ...feature.assets])];
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "*/*",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent": "texas-holdem-static-parity/2.0",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function expectedHashes(targets) {
  const entries = await Promise.all(targets.map(async path => {
    const bytes = await readFile(new URL(path, ROOT));
    return [path, sha256(bytes)];
  }));
  return new Map(entries);
}

function localResults(targets, expected) {
  return targets.map(path => ({ path, sha256: expected.get(path) }));
}

async function verifyOnce(baseUrl, targets, expected, attempt) {
  const results = [];

  for (const path of targets) {
    const url = new URL(path, baseUrl);
    url.searchParams.set("__parity", `${attempt}-${Date.now()}`);

    const response = await fetchWithTimeout(url);
    assert(response.ok, `${path} returned HTTP ${response.status}`);

    const actual = sha256(Buffer.from(await response.arrayBuffer()));
    const wanted = expected.get(path);
    assert(
      actual === wanted,
      `${path} differs from checked-out main (expected ${wanted.slice(0, 12)}, got ${actual.slice(0, 12)})`,
    );

    results.push({ path, sha256: actual });
  }

  return results;
}

async function withRetries(fn, attempts, delayMs) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && delayMs > 0) {
        console.warn(`[static-parity] attempt ${attempt}/${attempts} failed: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

const options = parseArguments(process.argv.slice(2));

try {
  const manifest = await readManifest();
  const targets = parityTargets(manifest, options.featureId);
  const expected = await expectedHashes(targets);

  if (options.localOnly) {
    console.log(JSON.stringify({
      ok: true,
      mode: "local-contract",
      feature: options.featureId,
      files: localResults(targets, expected),
    }, null, 2));
  } else {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const files = await withRetries(
      attempt => verifyOnce(baseUrl, targets, expected, attempt),
      options.retries,
      options.retryDelayMs,
    );

    console.log(JSON.stringify({
      ok: true,
      mode: "deployed-parity",
      feature: options.featureId,
      site: baseUrl.href,
      files,
    }, null, 2));
  }
} catch (error) {
  console.error(`[static-parity] ${error?.stack || error}`);
  process.exitCode = 1;
}
