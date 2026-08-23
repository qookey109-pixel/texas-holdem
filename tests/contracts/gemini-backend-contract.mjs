import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";


const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = resolve(root, "tests/fixtures/gemini-backend-contract-v1.json");
const workerPath = resolve(root, "backend/gemini-worker/src/index.js");
const probePath = resolve(root, "tests/contracts/oci-gemini-contract-probe.py");

const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
assert.equal(fixture.schemaVersion, 1, "Unexpected Gemini shared contract fixture version.");

const workerSource = await readFile(workerPath, "utf8");
const instrumentedWorker = `${workerSource}\nexport { validateRequest, validateDecision };\n`;
const workerModuleUrl = `data:text/javascript;base64,${Buffer.from(instrumentedWorker).toString("base64")}`;
const { validateRequest, validateDecision } = await import(workerModuleUrl);

function clone(value) {
  return structuredClone(value);
}

function withOverrides(base, overrides) {
  return { ...clone(base), ...clone(overrides) };
}

function captureRequest(payload) {
  try {
    return { ok: true, value: validateRequest(clone(payload)) };
  } catch (error) {
    return {
      ok: false,
      status: Number(error?.status) || 500,
      error: String(error?.message || error),
    };
  }
}

function captureDecision(raw, game) {
  try {
    return { ok: true, value: validateDecision(clone(raw), game) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

const python = process.env.PYTHON || "python3";
const probe = spawnSync(python, [probePath], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});
if (probe.status !== 0) {
  throw new Error(`OCI contract probe failed.\n${probe.stderr || probe.stdout}`);
}
const oci = JSON.parse(probe.stdout.trim());

const canonicalWorker = captureRequest(fixture.canonicalRequest);
assert.deepStrictEqual(
  canonicalWorker,
  oci.canonicalRequest,
  "Worker and OCI normalized request contracts diverged.",
);

const observation = canonicalWorker.value.tournamentObservation;
const required = fixture.requiredObservationAssertions;
assert.equal(observation.scope, required.scope);
assert.equal(observation.schemaVersion, required.schemaVersion);
assert.equal(observation.actor, required.actor);
assert.equal(observation.tournament.appearedCount, required.appearedCount);
assert.equal(observation.tournament.eliminatedCount, required.eliminatedCount);
assert.equal(observation.tournament.queueRemaining, required.queueRemaining);
assert.deepStrictEqual(canonicalWorker.value.legalActions, ["fold", "call", "raise"]);

const serializedObservation = JSON.stringify(observation);
for (const forbidden of fixture.forbiddenObservationKeys) {
  assert.equal(
    serializedObservation.includes(`\"${forbidden}\"`),
    false,
    `Sanitized tournament observation leaked forbidden key: ${forbidden}`,
  );
}

fixture.invalidRequestCases.forEach((testCase, index) => {
  const workerResult = captureRequest(withOverrides(fixture.canonicalRequest, testCase.overrides));
  const ociResult = oci.invalidRequestCases[index];
  assert.deepStrictEqual(workerResult, ociResult, `${testCase.name}: backend request contract diverged.`);
  assert.deepStrictEqual(
    workerResult,
    { ok: false, status: testCase.status, error: testCase.error },
    `${testCase.name}: contract outcome changed.`,
  );
});

const game = canonicalWorker.value;
fixture.decisionCases.forEach((testCase, index) => {
  const workerResult = captureDecision(testCase.input, game);
  const ociResult = oci.decisionCases[index];
  assert.deepStrictEqual(workerResult, ociResult, `${testCase.name}: backend decision contract diverged.`);
  assert.deepStrictEqual(
    workerResult,
    { ok: true, value: testCase.expected },
    `${testCase.name}: normalized decision changed.`,
  );
});

fixture.invalidDecisionCases.forEach((testCase, index) => {
  const workerResult = captureDecision(testCase.input, game);
  const ociResult = oci.invalidDecisionCases[index];
  assert.deepStrictEqual(workerResult, ociResult, `${testCase.name}: backend response validation diverged.`);
  assert.deepStrictEqual(
    workerResult,
    { ok: false, error: testCase.error },
    `${testCase.name}: response-validation error changed.`,
  );
});

console.log("Gemini backend shared contract: PASS");
