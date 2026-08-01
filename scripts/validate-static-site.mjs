import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const checkedAssets = new Set();
const ignoredDirectories = new Set([".git", ".github", "docs", "versions", "node_modules"]);
let checkedInlineScripts = 0;

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

function checkJavaScriptSyntax(source, label, extension = ".js") {
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "texas-holdem-static-check-"));
  const temporaryFile = resolve(temporaryDirectory, `script${extension}`);

  try {
    writeFileSync(temporaryFile, source, "utf8");
    const syntax = spawnSync(process.execPath, ["--check", temporaryFile], { encoding: "utf8" });

    if (syntax.status !== 0) {
      fail(`JavaScript syntax error in ${label}:\n${syntax.stderr.trim()}`);
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function checkInlineScripts(html, htmlFile) {
  let scriptIndex = 0;

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1];
    const source = match[2];

    if (/\bsrc\s*=/i.test(attributes)) continue;

    const typeMatch = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = (typeMatch?.[1] || "text/javascript").trim().toLowerCase();
    const supportedTypes = new Set(["text/javascript", "application/javascript", "module"]);

    if (!supportedTypes.has(type)) continue;

    scriptIndex += 1;
    checkedInlineScripts += 1;
    checkJavaScriptSyntax(
      source,
      `${relative(root, htmlFile)} inline script #${scriptIndex}`,
      type === "module" ? ".mjs" : ".js",
    );
  }
}

function normalizeDependencies(dependencies = {}) {
  return Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function checkPackageLock(packagePath, packageLockPath) {
  if (!existsSync(packagePath) || !existsSync(packageLockPath)) return;

  try {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
    const lockedRoot = packageLock.packages?.[""];

    if (packageLock.lockfileVersion !== 3) {
      fail(`package-lock.json must use lockfileVersion 3; found ${packageLock.lockfileVersion}.`);
    }

    if (!lockedRoot) {
      fail("package-lock.json is missing the root package entry.");
      return;
    }

    for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const expected = normalizeDependencies(packageJson[section]);
      const actual = normalizeDependencies(lockedRoot[section]);

      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        fail(`package-lock.json ${section} do not match package.json.`);
      }
    }
  } catch (error) {
    fail(`Invalid package metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const htmlPath = resolve(root, "index.html");
const diagnosticsPath = resolve(root, "diagnostics.html");
const cssPath = resolve(root, "styles.css");
const packagePath = resolve(root, "package.json");
const packageLockPath = resolve(root, "package-lock.json");
const requiredRootFiles = [
  htmlPath,
  diagnosticsPath,
  cssPath,
  resolve(root, "app.js"),
  packagePath,
  packageLockPath,
  resolve(root, "PROJECT_STATUS.md"),
  resolve(root, "README.md"),
  resolve(root, "AGENTS.md"),
];

for (const required of requiredRootFiles) {
  if (!existsSync(required)) fail(`Missing required root file: ${relative(root, required)}`);
}

checkPackageLock(packagePath, packageLockPath);

const htmlFiles = walk(root, new Set([".html"]));

for (const htmlFile of htmlFiles) {
  const html = readFileSync(htmlFile, "utf8");

  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    checkReference(match[1], htmlFile, dirname(htmlFile));
  }

  checkInlineScripts(html, htmlFile);
}

for (const file of walk(root, new Set([".css"]))) {
  const css = readFileSync(file, "utf8");

  for (const match of css.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi)) {
    checkReference(match[2], file, dirname(file));
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

console.log(
  `Static site validation passed. Checked ${htmlFiles.length} HTML file(s), ` +
    `${checkedInlineScripts} inline script(s), and ${checkedAssets.size} local asset reference(s).`,
);
