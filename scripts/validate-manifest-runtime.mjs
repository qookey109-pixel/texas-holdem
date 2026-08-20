import { readFile } from "node:fs/promises";
import { posix } from "node:path";

const ROOT = new URL("../", import.meta.url);

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

const [loaderSource, manifestSource] = await Promise.all([
  read("js/elite-character-presentation.js"),
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

const runtimePaths = new Set([...loaderRuntimePaths, ...cssRuntimePaths]);
const missingAssets = [...runtimePaths].filter(path => !assetPaths.has(path));
const missingFeatureAssets = [...runtimePaths].filter(path => !featureAssets.has(path));

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
    `Manifest runtime validation passed. ${loaderRuntimePaths.size} loader/runtime scripts and ` +
      `${cssRuntimePaths.size} transitive CSS import(s) covered; latest runtime ${latestVersion}.`,
  );
}
