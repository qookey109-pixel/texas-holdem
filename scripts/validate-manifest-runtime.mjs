import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

function fail(message) {
  console.error(`[manifest-runtime] ${message}`);
  process.exitCode = 1;
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

const runtimePaths = new Set(["js/elite-character-presentation.js"]);
for (const match of loaderSource.matchAll(/["'](js\/[^"'?]+\.js)(?:\?[^"']*)?["']/g)) {
  runtimePaths.add(match[1]);
}

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
    `Manifest runtime validation passed. ${runtimePaths.size} loader/runtime scripts covered; latest runtime ${latestVersion}.`,
  );
}
