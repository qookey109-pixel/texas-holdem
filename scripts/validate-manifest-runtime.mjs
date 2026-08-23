import { readFile } from "node:fs/promises";
import { posix } from "node:path";

const ROOT = new URL("../", import.meta.url);
const RESPONSIVE_ENTRY = "desktop-responsive-layout-v1.css";

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

function fail(message) {
  console.error(`[manifest-runtime] ${message}`);
  process.exitCode = 1;
}

function cleanReference(value) {
  return String(value || "").trim().split(/[?#]/, 1)[0];
}

function resolveLocalReference(value, sourcePath) {
  const reference = cleanReference(value);
  if (!reference || reference.startsWith("#")) return null;
  if (/^(?:https?:|data:|blob:|mailto:|tel:|javascript:)/i.test(reference)) return null;
  if (reference.startsWith("//") || reference.startsWith("/")) return null;

  const resolved = posix.normalize(posix.join(posix.dirname(sourcePath), reference));
  if (!resolved || resolved === "." || resolved.startsWith("../")) return null;
  return resolved;
}

function cssImports(source, sourcePath) {
  const imports = new Set();
  const pattern = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/gi;

  for (const match of source.matchAll(pattern)) {
    const resolved = resolveLocalReference(match[1], sourcePath);
    if (resolved?.endsWith(".css")) imports.add(resolved);
  }

  return imports;
}

function htmlStylesheets(source, sourcePath) {
  const stylesheets = new Set();
  for (const match of source.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1] || "";
    if (!rel.split(/\s+/).some(value => value.toLowerCase() === "stylesheet")) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
    const resolved = resolveLocalReference(href, sourcePath);
    if (resolved?.endsWith(".css")) stylesheets.add(resolved);
  }
  return stylesheets;
}

const [loaderSource, indexSource, manifestSource] = await Promise.all([
  read("js/elite-character-presentation.js"),
  read("index.html"),
  read("build-manifest.json"),
]);

const manifest = JSON.parse(manifestSource);
const assetPaths = new Set((manifest.assets || []).map(asset => asset?.path).filter(Boolean));
const featureAssets = new Set(
  (manifest.features || []).flatMap(feature =>
    Array.isArray(feature?.assets) ? feature.assets : []
  ),
);

const loaderRuntimePaths = new Set(["js/elite-character-presentation.js"]);
for (const match of loaderSource.matchAll(/["'](js\/[^"'?]+\.js)(?:\?[^"']*)?["']/g)) {
  loaderRuntimePaths.add(match[1]);
}

const entryStylesheetPaths = htmlStylesheets(indexSource, "index.html");
const cssRuntimePaths = new Set();
for (const cssPath of [...assetPaths].filter(path => path.endsWith(".css"))) {
  let source = "";
  try {
    source = await read(cssPath);
  } catch (error) {
    fail(`unable to inspect manifest CSS ${cssPath}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  for (const importedPath of cssImports(source, cssPath)) {
    cssRuntimePaths.add(importedPath);
  }
}

if (!entryStylesheetPaths.has(RESPONSIVE_ENTRY)) {
  fail(`index.html must directly load ${RESPONSIVE_ENTRY}; do not hide the responsive entry behind another stylesheet import.`);
}
if (cssRuntimePaths.has(RESPONSIVE_ENTRY)) {
  fail(`${RESPONSIVE_ENTRY} must be a direct index.html stylesheet entry, not a transitive CSS import.`);
}
if (!featureAssets.has(RESPONSIVE_ENTRY)) {
  fail(`build-manifest.json feature map must retain ${RESPONSIVE_ENTRY}.`);
}

const runtimePaths = new Set([...loaderRuntimePaths, ...entryStylesheetPaths, ...cssRuntimePaths]);
const missingAssets = [...runtimePaths].filter(path => !assetPaths.has(path));
const missingFeatureAssets = [...new Set([...loaderRuntimePaths, ...cssRuntimePaths])]
  .filter(path => !featureAssets.has(path));

const runtimeVersions = [...runtimePaths]
  .flatMap(path => [...path.matchAll(/v(\d+)-(\d+)(?:-(\d+))?/g)])
  .map(match => ({
    slug: `v${match[1]}-${match[2]}${match[3] ? `-${match[3]}` : ""}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3] || 0)],
  }))
  .sort((left, right) => {
    for (let index = 0; index < 3; index += 1) {
      if (left.parts[index] !== right.parts[index]) {
        return right.parts[index] - left.parts[index];
      }
    }
    return 0;
  });

const latestVersion = runtimeVersions[0]?.slug || "";

if (missingAssets.length) {
  fail(`build-manifest.json is missing runtime assets: ${missingAssets.join(", ")}`);
}

if (missingFeatureAssets.length) {
  fail(`build-manifest.json feature map is missing runtime assets: ${missingFeatureAssets.join(", ")}`);
}

if (latestVersion && !String(manifest.buildId || "").includes(latestVersion)) {
  fail(`buildId must identify the latest runtime ${latestVersion}; found ${manifest.buildId || "<empty>"}`);
}

if (!process.exitCode) {
  console.log(
    `Manifest runtime validation passed. ${loaderRuntimePaths.size} loader/runtime scripts, ` +
      `${entryStylesheetPaths.size} direct stylesheet entry/entries, and ${cssRuntimePaths.size} transitive CSS import(s) covered; ` +
      `latest runtime ${latestVersion}.`,
  );
}
