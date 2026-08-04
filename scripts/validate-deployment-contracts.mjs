import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    fail(`Missing required contract file: ${relativePath}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function cleanReference(value) {
  return value.trim().split(/[?#]/, 1)[0];
}

function localHtmlAssets(html) {
  const result = new Set();
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = cleanReference(match[1]);
    if (!reference || /^(?:https?:|data:|mailto:|tel:|javascript:|blob:|#)/i.test(reference)) continue;
    result.add(reference);
  }
  return result;
}

function localJavaScriptAssets(source) {
  const result = new Set();
  for (const match of source.matchAll(/["'`]((?:js|assets|images|audio|fonts)\/[^"'`?#\s]+)(?:\?[^"'`\s]*)?["'`]/g)) {
    result.add(match[1]);
  }
  return result;
}

const manifestSource = read("build-manifest.json");
let manifest = null;
try {
  manifest = JSON.parse(manifestSource);
} catch (error) {
  fail(`Invalid build-manifest.json: ${error instanceof Error ? error.message : String(error)}`);
}

const manifestAssets = new Set(
  Array.isArray(manifest?.assets)
    ? manifest.assets.map(asset => asset?.path).filter(path => typeof path === "string" && path)
    : [],
);

const productionAssets = new Set([
  ...localHtmlAssets(read("index.html")),
  ...localJavaScriptAssets(read("js/config.js")),
  ...localJavaScriptAssets(read("js/events-boot.js")),
]);

for (const asset of productionAssets) {
  if (!existsSync(resolve(root, asset))) {
    fail(`Production loader references a missing asset: ${asset}`);
  }
  if (!manifestAssets.has(asset)) {
    fail(`Production asset is not covered by build-manifest.json diagnostics: ${asset}`);
  }
}

const cloudSaveSource = read("js/tournament-cloud-save.js");
const schemaVersionMatch = cloudSaveSource.match(/schemaVersion:\s*(\d+)/);
const schemaVersion = Number(schemaVersionMatch?.[1]);
if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
  fail("Unable to determine tournament cloud save schemaVersion.");
}

const migrationsDirectory = resolve(root, "supabase/migrations");
const migrationFileName = existsSync(migrationsDirectory)
  ? readdirSync(migrationsDirectory)
      .filter(name => name.endsWith(`_allow_tournament_save_v${schemaVersion}.sql`))
      .sort()
      .at(-1)
  : null;
const migrationPath = migrationFileName
  ? `supabase/migrations/${migrationFileName}`
  : `supabase/migrations/*_allow_tournament_save_v${schemaVersion}.sql`;
const migrationSource = migrationFileName ? read(migrationPath) : "";
const normalizedMigration = migrationSource.replace(/\s+/g, " ").toLowerCase();

if (!migrationFileName) {
  fail(`Missing Supabase migration for tournament cloud save schema V${schemaVersion}.`);
}

if (schemaVersion >= 2 && migrationFileName) {
  const allowedVersions = Array.from({ length: schemaVersion }, (_, index) => index + 1).join("\\s*,\\s*");
  const allowedPattern = new RegExp(`save_version\\s+in\\s*\\(\\s*${allowedVersions}\\s*\\)`, "i");
  if (!allowedPattern.test(migrationSource)) {
    fail(`${migrationPath} must allow all supported save versions 1 through ${schemaVersion}.`);
  }

  const defaultPattern = new RegExp(`alter\\s+column\\s+save_version\\s+set\\s+default\\s+${schemaVersion}`, "i");
  if (!defaultPattern.test(normalizedMigration)) {
    fail(`${migrationPath} must set save_version default to ${schemaVersion}.`);
  }
}

if (migrationFileName && !manifestAssets.has(migrationPath)) {
  fail(`Cloud save migration is not listed in build-manifest.json: ${migrationPath}`);
}

if (failures.length) {
  console.error(`Deployment contract validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(
  `Deployment contract validation passed. Checked ${productionAssets.size} production asset(s) ` +
    `and tournament cloud save schema V${schemaVersion}.`,
);
