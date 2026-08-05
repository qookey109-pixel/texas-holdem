(() => {
  "use strict";

  const base = window.AiGameplayCalibrationV27;
  if (!base?.version || base.fingerprintVersion) return;

  const FINGERPRINT_VERSION = "1.0.1";

  function hashString(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function withoutTiming(value = {}) {
    const { timingMs, ...stable } = value;
    return stable;
  }

  function stableMap(values = {}) {
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, withoutTiming(value)]),
    );
  }

  function fingerprintPayload(result) {
    return {
      schemaVersion: result.schemaVersion,
      labVersion: result.labVersion,
      fingerprintVersion: FINGERPRINT_VERSION,
      seeds: result.seeds,
      versions: result.versions,
      tiers: stableMap(result.tiers),
      roles: stableMap(result.roles),
      scenarioSummary: stableMap(result.scenarioSummary),
      records: (result.records || []).map(({ latencyMs, ...record }) => record),
    };
  }

  function run(options = {}) {
    const result = base.run(options);
    result.fingerprintVersion = FINGERPRINT_VERSION;
    result.deterministicFingerprint = hashString(JSON.stringify(fingerprintPayload(result)));
    return result;
  }

  window.AiGameplayCalibrationV27 = Object.freeze({
    ...base,
    fingerprintVersion: FINGERPRINT_VERSION,
    run,
  });
})();
