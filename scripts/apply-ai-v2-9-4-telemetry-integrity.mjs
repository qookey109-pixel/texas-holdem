import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const VERSION = "2.9.4";
const DEFINITION = "postflop-showdown-hands/showdown-eligible-hands-excluding-preflop-all-in";
const inputDirectory = resolve(process.argv[2] || "telemetry-shards");
const outputDirectory = resolve(process.argv[3] || "telemetry-summary");
const summaryJsonPath = join(outputDirectory, "ai-long-run-telemetry-v2-9.json");
const summaryMarkdownPath = join(outputDirectory, "ai-long-run-telemetry-v2-9.md");
const NUMERIC_FIELDS = [
  "hands",
  "sawFlopHands",
  "showdownHands",
  "showdownEligibleHands",
  "postflopShowdownHands",
  "preflopAllInHands",
  "preflopAllInShowdownHands",
  "postflopFoldHands",
];

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function rate(numerator, denominator) {
  return denominator > 0 ? round(numerator / denominator) : 0;
}

function emptyRole(name) {
  return Object.fromEntries([
    ["name", name],
    ...NUMERIC_FIELDS.map(field => [field, 0]),
  ]);
}

function mergeRole(target, source = {}) {
  for (const field of NUMERIC_FIELDS) {
    target[field] += Number(source[field]) || 0;
  }
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function roleIntegrity(counts) {
  const errors = [];
  if (counts.postflopShowdownHands > counts.showdownEligibleHands) {
    errors.push("postflop-showdown-exceeds-eligible");
  }
  if (counts.preflopAllInShowdownHands > counts.showdownHands) {
    errors.push("preflop-allin-showdown-exceeds-showdown");
  }
  if (counts.showdownEligibleHands > counts.sawFlopHands) {
    errors.push("eligible-exceeds-saw-flop");
  }
  return {
    ...counts,
    legacyWtsd: rate(counts.showdownHands, counts.sawFlopHands),
    wtsd: rate(counts.postflopShowdownHands, counts.showdownEligibleHands),
    preflopAllInShowdownShare: rate(counts.preflopAllInShowdownHands, counts.showdownHands),
    postflopFoldRate: rate(counts.postflopFoldHands, counts.showdownEligibleHands),
    integrityPassed: errors.length === 0,
    integrityErrors: errors,
  };
}

function tierIntegrity(tier, roles) {
  const members = roles.filter(role => role.tier === tier && role.hands > 0);
  const total = field => members.reduce((sum, role) => (
    sum + (Number(role.telemetryIntegrity?.[field]) || 0)
  ), 0);
  const showdownEligibleHands = total("showdownEligibleHands");
  const postflopShowdownHands = total("postflopShowdownHands");
  const sawFlopHands = total("sawFlopHands");
  const showdownHands = total("showdownHands");
  const preflopAllInShowdownHands = total("preflopAllInShowdownHands");
  return {
    definition: DEFINITION,
    sawFlopHands,
    showdownHands,
    showdownEligibleHands,
    postflopShowdownHands,
    preflopAllInShowdownHands,
    legacyWtsd: rate(showdownHands, sawFlopHands),
    wtsd: rate(postflopShowdownHands, showdownEligibleHands),
  };
}

if (!statSync(inputDirectory).isDirectory()) {
  throw new Error(`Telemetry input is not a directory: ${inputDirectory}`);
}

const files = walk(inputDirectory)
  .filter(path => /^ai-long-run-shard-\d+\.json$/.test(basename(path)))
  .sort();
if (!files.length) throw new Error(`No telemetry shard JSON files found under ${inputDirectory}`);

const merged = {};
const validationErrors = [];
let completedHands = 0;
for (const path of files) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const integrity = report.telemetryIntegrity;
  const label = basename(path);
  if (!integrity || integrity.version !== VERSION) {
    validationErrors.push(`${label}: missing V2.9.4 telemetry integrity evidence`);
    continue;
  }
  if (integrity.definition !== DEFINITION) {
    validationErrors.push(`${label}: unexpected WTSD definition ${integrity.definition || "missing"}`);
  }
  if (integrity.integrityPassed !== true || integrity.errors?.length) {
    validationErrors.push(`${label}: telemetry integrity failed`);
  }
  if ((Number(integrity.completedHands) || 0) !== (Number(report.completedHands) || 0)) {
    validationErrors.push(
      `${label}: integrity hands ${integrity.completedHands}/${report.completedHands}`,
    );
  }
  completedHands += Number(integrity.completedHands) || 0;
  for (const [name, counts] of Object.entries(integrity.roles || {})) {
    if (!merged[name]) merged[name] = emptyRole(name);
    mergeRole(merged[name], counts);
  }
}

const summary = JSON.parse(readFileSync(summaryJsonPath, "utf8"));
const roleIntegrityMap = Object.fromEntries(
  Object.entries(merged).map(([name, counts]) => [name, roleIntegrity(counts)]),
);
for (const [name, role] of Object.entries(summary.roles || {})) {
  const integrity = roleIntegrityMap[name];
  if (!integrity || integrity.hands <= 0) continue;
  role.telemetryIntegrity = integrity;
  role.legacyWtsd = Number(role.wtsd) || 0;
  role.wtsd = integrity.wtsd;
}

const roleList = Object.values(summary.roles || {});
for (const [tier, tierSummary] of Object.entries(summary.tiers || {})) {
  const integrity = tierIntegrity(tier, roleList);
  tierSummary.telemetryIntegrity = integrity;
  tierSummary.legacyWtsd = Number(tierSummary.wtsd) || 0;
  tierSummary.wtsd = integrity.wtsd;
}

summary.telemetryRevision = VERSION;
summary.telemetryIntegrity = {
  version: VERSION,
  schemaVersion: 1,
  definition: DEFINITION,
  completedHands,
  validationPassed: validationErrors.length === 0,
  validationErrors,
};
if (validationErrors.length) {
  summary.validationPassed = false;
  summary.validationErrors = [
    ...(summary.validationErrors || []),
    ...validationErrors.map(error => `V2.9.4 integrity: ${error}`),
  ];
}

const roles = Object.values(summary.roles || {})
  .sort((left, right) => Number(right.bb100) - Number(left.bb100));
const rows = roles.map(role => (
  `| ${role.name} | ${role.tier} | ${Number(role.targetScore10).toFixed(1)} | ${role.hands} | ${percent(role.vpip)} | ${percent(role.pfr)} | ${percent(role.threeBetRate)} | ${percent(role.cbet)} | ${percent(role.wtsd)} | ${percent(role.legacyWtsd)} | ${percent(role.wsd)} | ${percent(role.wwsf)} | ${Number(role.bb100).toFixed(2)} | ${Number(role.bb100Ci95Low).toFixed(2)}～${Number(role.bb100Ci95High).toFixed(2)} |`
));
const integrityRows = roles
  .filter(role => role.telemetryIntegrity?.hands > 0)
  .map(role => {
    const item = role.telemetryIntegrity;
    return `| ${role.name} | ${item.sawFlopHands} | ${item.showdownEligibleHands} | ${item.postflopShowdownHands} | ${item.preflopAllInShowdownHands} | ${percent(item.wtsd)} | ${percent(item.legacyWtsd)} | ${item.integrityPassed ? "yes" : "no"} |`;
  });

const markdown = [
  "# AI V2.9.4 Long-run Telemetry",
  "",
  `- Shards: ${summary.shards}`,
  `- Completed hands: ${summary.completedHands}/${summary.configuredHands}`,
  `- Hero profiles: ${(summary.heroProfiles || []).join(", ")}`,
  `- Full 25,000-hand evidence: ${summary.fullEvidence ? "yes" : "no"}`,
  `- Aggregate validation: ${summary.validationPassed ? "passed" : "failed"}`,
  `- Fair public-information boundary: ${summary.fairness?.publicInformationOnly ? "passed" : "failed"}`,
  `- WTSD definition: ${DEFINITION}`,
  `- WTSD integrity: ${validationErrors.length ? "failed" : "passed"}`,
  "",
  "| Role | Tier | Target | Hands | VPIP | PFR | 3-bet | C-bet | WTSD | Legacy WTSD | W$SD | WWSF | BB/100 | 95% CI |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...rows,
  "",
  "## WTSD integrity",
  "",
  "| Role | Saw flop | Eligible | Postflop showdown | Preflop all-in showdown | WTSD | Legacy WTSD | Integrity |",
  "|---|---:|---:|---:|---:|---:|---:|---|",
  ...integrityRows,
  "",
  "WTSD now excludes hands that were already all-in before the flop and merely received an automatic runout.",
  "W$SD remains based on all actual showdowns.",
  "",
  `Validation errors: ${JSON.stringify(summary.validationErrors || [])}`,
  "",
];

writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
writeFileSync(summaryMarkdownPath, markdown.join("\n"), "utf8");
console.log(`# AI V2.9.4 telemetry integrity: ${validationErrors.length ? "failed" : "passed"}`);
console.log(`- WTSD definition: ${DEFINITION}`);
console.log(`- Integrity hands: ${completedHands}`);
if (validationErrors.length) {
  for (const error of validationErrors) console.error(`- ${error}`);
  process.exitCode = 1;
}
