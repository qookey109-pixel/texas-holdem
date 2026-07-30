import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const checkedAssets = new Set();
const ignoredDirectories = new Set([".git", ".github", "docs", "versions", "node_modules"]);

function fail(message) {
  failures.push(message);
}

function walk(directory, extensions) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;

    const fullPath = resolve(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) files.push(...walk(fullPath, extensions));
    else if (extensions.has(extname(entry))) files.push(fullPath);
  }

  return files;
}

function cleanReference(value) {
  return value.trim().replace(/^['"]|['"]$/g, "").split(/[?#]/, 1)[0];
}

function checkReference(value, sourceFile, baseDirectory) {
  const reference = cleanReference(value);

  if (!reference || reference.startsWith("#")) return;
  if (/^(?:https?:|data:|mailto:|tel:|javascript:|blob:)/i.test(reference)) return;
  if (reference.startsWith("//")) return;

  if (reference.startsWith("/")) {
    fail(
      `${relative(root, sourceFile)} uses root-absolute path ${reference}; ` +
        "GitHub project Pages should use relative paths.",
    );
    return;
  }

  const target = resolve(baseDirectory, reference);

  if (!target.startsWith(`${root}/`) && target !== root) {
    fail(`${relative(root, sourceFile)} references outside repository root: ${reference}`);
    return;
  }

  const key = `${relative(root, sourceFile)} -> ${relative(root, target)}`;
  if (checkedAssets.has(key)) return;

  checkedAssets.add(key);
  if (!existsSync(target)) fail(`Missing asset: ${key}`);
}

const htmlPath = resolve(root, "index.html");
const cssPath = resolve(root, "styles.css");
const requiredRootFiles = [
  htmlPath,
  cssPath,
  resolve(root, "app.js"),
  resolve(root, "PROJECT_STATUS.md"),
  resolve(root, "README.md"),
  resolve(root, "AGENTS.md"),
];

for (const required of requiredRootFiles) {
  if (!existsSync(required)) fail(`Missing required root file: ${relative(root, required)}`);
}

if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, "utf8");

  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    checkReference(match[1], htmlPath, root);
  }
}

for (const file of walk(root, new Set([".css"]))) {
  const css = readFileSync(file, "utf8");

  for (const match of css.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi)) {
    checkReference(match[2], file, resolve(file, ".."));
  }
}

for (const file of walk(root, new Set([".js", ".mjs"]))) {
  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(
    /["'`]((?:js|assets|images|audio|fonts)\/[^"'`?#\s]+(?:\?[^"'`\s]*)?)["'`]/g,
  )) {
    checkReference(match[1], file, root);
  }

  const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (syntax.status !== 0) {
    fail(`JavaScript syntax error in ${relative(root, file)}:\n${syntax.stderr.trim()}`);
  }
}

if (failures.length) {
  console.error(`Static site validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Static site validation passed. Checked ${checkedAssets.size} local asset reference(s).`);
