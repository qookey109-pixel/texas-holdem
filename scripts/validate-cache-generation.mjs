import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const root = process.cwd();
const authorityPath = resolve(root, "cache-generation.json");
const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
const failures = [];
const checked = new Set();

function fail(message) {
  failures.push(message);
}

if (authority.schemaVersion !== 1) fail(`cache-generation.json schemaVersion must be 1; found ${authority.schemaVersion}.`);
if (authority.channel !== "main") fail(`cache-generation.json channel must be main; found ${authority.channel}.`);
if (typeof authority.generation !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(authority.generation)) {
  fail("cache-generation.json requires a non-empty URL-safe generation.");
}
if (authority.scope !== "local-runtime-js-css-query-v1") {
  fail(`cache-generation.json scope must be local-runtime-js-css-query-v1; found ${authority.scope}.`);
}

const generation = authority.generation;

function walk(directory, extensions) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path, extensions));
    else if (extensions.has(extname(entry))) files.push(path);
  }
  return files;
}

function inspectReference(rawReference, sourceFile) {
  const reference = String(rawReference || "").trim().replace(/^['"]|['"]$/g, "");
  if (!reference || /^(?:https?:|data:|mailto:|tel:|javascript:|blob:|#)/i.test(reference)) return;
  if (reference.startsWith("//") || reference.startsWith("/")) return;

  const hashless = reference.split("#", 1)[0];
  const question = hashless.indexOf("?");
  const pathname = question >= 0 ? hashless.slice(0, question) : hashless;
  if (!/\.(?:js|css)$/i.test(pathname)) return;

  const key = `${relative(root, sourceFile)} -> ${reference}`;
  if (checked.has(key)) return;
  checked.add(key);

  if (question < 0) {
    fail(`${key} is missing ?v=${generation}`);
    return;
  }

  const params = new URLSearchParams(hashless.slice(question + 1));
  const value = params.get("v");
  if (!value) {
    fail(`${key} is missing the v cache query`);
    return;
  }
  if (value !== generation) {
    fail(`${key} uses stale cache generation ${value}; expected ${generation}`);
  }
}

function scanHtml(file) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) inspectReference(match[1], file);
}

function scanJavaScript(file) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/["'`]([^"'`\s]+\.(?:js|css)(?:\?[^"'`\s]*)?)["'`]/gi)) {
    inspectReference(match[1], file);
  }
}

function scanCss(file) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/gi)) {
    inspectReference(match[1], file);
  }
}

for (const name of ["index.html", "diagnostics.html"]) scanHtml(resolve(root, name));
scanJavaScript(resolve(root, "app.js"));
for (const file of walk(resolve(root, "js"), new Set([".js", ".css"]))) {
  if (extname(file) === ".js") scanJavaScript(file);
  else scanCss(file);
}
for (const file of readdirSync(root).filter(name => extname(name) === ".css").map(name => resolve(root, name))) scanCss(file);

if (failures.length) {
  console.error(`Cache generation validation failed with ${failures.length} issue(s):`);
  for (const issue of [...new Set(failures)].sort()) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Cache generation validation passed. ${checked.size} local runtime JS/CSS reference(s) use ${generation}.`);
