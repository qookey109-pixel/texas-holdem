import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

const ROOT = new URL("../", import.meta.url);
const FORMAL_SITE = "https://qookey109-pixel.github.io/texas-holdem/";
const REQUEST_TIMEOUT_MS = 12_000;
const TARGETS = Object.freeze([
  "index.html",
  "js/config.js",
  "js/official-layout-preset.js",
  "js/layout-readability-trial.js",
  "build-manifest.json",
]);

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [name, inline] = value.split("=", 2);
    if (inline !== undefined) values.set(name, inline);
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) values.set(name, argv[++index]);
  }

  return {
    baseUrl: values.get("--base-url") || process.env.PRODUCTION_SITE_URL || FORMAL_SITE,
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
        "user-agent": "texas-holdem-static-parity/1.0",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function expectedHashes() {
  const entries = await Promise.all(TARGETS.map(async path => {
    const bytes = await readFile(new URL(path, ROOT));
    return [path, sha256(bytes)];
  }));
  return new Map(entries);
}

async function verifyOnce(baseUrl, expected, attempt) {
  const results = [];

  for (const path of TARGETS) {
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
const baseUrl = normalizeBaseUrl(options.baseUrl);

try {
  const expected = await expectedHashes();
  const files = await withRetries(
    attempt => verifyOnce(baseUrl, expected, attempt),
    options.retries,
    options.retryDelayMs,
  );

  console.log(JSON.stringify({
    ok: true,
    site: baseUrl.href,
    files,
  }, null, 2));
} catch (error) {
  console.error(`[static-parity] ${error?.stack || error}`);
  process.exitCode = 1;
}
