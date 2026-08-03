// V1.4 long-term memory for the public-information AI player model.
(() => {
  "use strict";

  if (window.AiPlayerModelMemory?.version) return;

  const VERSION = "1.0.0";
  const SNAPSHOT_VERSION = 1;
  const MODEL_VERSION = "1.0.0";
  const STORAGE_PREFIX = "texasHoldemAiPlayerModelMemoryV1:";
  const STREET_KEYS = ["preflop", "flop", "turn", "river"];
  const BUCKET_KEYS = [
    "actions", "folds", "calls", "checks", "raises", "allIns",
    "facedAggression", "foldsToAggression", "callsVsAggression", "raisesVsAggression",
    "checkedThenFacedAggression", "checkFolds", "checkCalls", "checkRaises",
    "smallBets", "mediumBets", "largeBets", "overbets",
    "opens", "threeBets", "fourBets", "limps",
  ];
  const MAX_COUNT = 100_000;
  const MAX_HANDS = 20_000;
  const CLOUD_CONFIG = Object.freeze({
    projectUrl: "https://iphhyjutbrahvfnsvdfn.supabase.co",
    publishableKey: "sb_publishable_MbNQVDLJkB-_1Z05aQ1FRA_V3XCNfMx",
    clientModuleUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
    table: "tournament_saves",
  });

  let identity = "guest";
  let cloudClientPromise = null;
  let installTimer = 0;
  let installAttempts = 0;
  let saveTimer = 0;
  let cloudTimer = 0;
  let cloudBusy = false;
  let lastCloudFingerprint = "";
  let lastIdentityCheckAt = 0;
  let lastCloudSyncAt = 0;

  function clampInteger(value, maximum = MAX_COUNT) {
    const number = Math.trunc(Number(value));
    if (!Number.isFinite(number)) return 0;
    return Math.min(maximum, Math.max(0, number));
  }

  function cleanPosition(value) {
    const key = String(value || "--").trim().toUpperCase();
    return /^[A-Z0-9-]{1,8}$/.test(key) ? key : "--";
  }

  function emptyBucket() {
    return Object.fromEntries(BUCKET_KEYS.map(key => [key, 0]));
  }

  function sanitizeBucket(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const bucket = emptyBucket();
    for (const key of BUCKET_KEYS) bucket[key] = clampInteger(source[key]);

    bucket.folds = Math.min(bucket.folds, bucket.actions);
    bucket.calls = Math.min(bucket.calls, bucket.actions);
    bucket.checks = Math.min(bucket.checks, bucket.actions);
    bucket.raises = Math.min(bucket.raises, bucket.actions);
    bucket.allIns = Math.min(bucket.allIns, bucket.actions);
    bucket.facedAggression = Math.min(bucket.facedAggression, bucket.actions);
    bucket.foldsToAggression = Math.min(bucket.foldsToAggression, bucket.facedAggression);
    bucket.callsVsAggression = Math.min(bucket.callsVsAggression, bucket.facedAggression);
    bucket.raisesVsAggression = Math.min(bucket.raisesVsAggression, bucket.facedAggression);
    bucket.checkedThenFacedAggression = Math.min(bucket.checkedThenFacedAggression, bucket.facedAggression);
    bucket.checkFolds = Math.min(bucket.checkFolds, bucket.checkedThenFacedAggression);
    bucket.checkCalls = Math.min(bucket.checkCalls, bucket.checkedThenFacedAggression);
    bucket.checkRaises = Math.min(bucket.checkRaises, bucket.checkedThenFacedAggression);
    for (const key of ["smallBets", "mediumBets", "largeBets", "overbets", "opens", "threeBets", "fourBets", "limps"]) {
      bucket[key] = Math.min(bucket[key], bucket.actions);
    }
    return bucket;
  }

  function emptySnapshot() {
    return {
      schemaVersion: SNAPSHOT_VERSION,
      modelVersion: MODEL_VERSION,
      updatedAt: 0,
      handsObserved: 0,
      actionsObserved: 0,
      byStreet: Object.fromEntries(STREET_KEYS.map(street => [street, emptyBucket()])),
      byPosition: {},
    };
  }

  function sanitizeSnapshot(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const snapshot = emptySnapshot();
    snapshot.updatedAt = clampInteger(source.updatedAt, Number.MAX_SAFE_INTEGER);
    snapshot.handsObserved = clampInteger(source.handsObserved, MAX_HANDS);
    snapshot.actionsObserved = clampInteger(source.actionsObserved);

    const streets = source.byStreet && typeof source.byStreet === "object" ? source.byStreet : {};
    for (const street of STREET_KEYS) snapshot.byStreet[street] = sanitizeBucket(streets[street]);

    const positions = source.byPosition && typeof source.byPosition === "object" && !Array.isArray(source.byPosition)
      ? source.byPosition
      : {};
    for (const [rawPosition, rawBucket] of Object.entries(positions).slice(0, 16)) {
      snapshot.byPosition[cleanPosition(rawPosition)] = sanitizeBucket(rawBucket);
    }

    const streetActions = STREET_KEYS.reduce((total, street) => total + snapshot.byStreet[street].actions, 0);
    snapshot.actionsObserved = Math.max(snapshot.actionsObserved, streetActions);
    return snapshot;
  }

  function exportSnapshot(model = window.AiPlayerModel?.ensureModel?.()) {
    const source = model && typeof model === "object" ? model : {};
    return sanitizeSnapshot({
      schemaVersion: SNAPSHOT_VERSION,
      modelVersion: MODEL_VERSION,
      updatedAt: Date.now(),
      handsObserved: source.handsObserved,
      actionsObserved: source.actionsObserved,
      byStreet: source.byStreet,
      byPosition: source.byPosition,
    });
  }

  function mergeBuckets(left, right) {
    const first = sanitizeBucket(left);
    const second = sanitizeBucket(right);
    const merged = emptyBucket();
    for (const key of BUCKET_KEYS) merged[key] = Math.max(first[key], second[key]);
    return sanitizeBucket(merged);
  }

  function mergeSnapshots(left, right) {
    const first = sanitizeSnapshot(left);
    const second = sanitizeSnapshot(right);
    const merged = emptySnapshot();
    merged.updatedAt = Math.max(first.updatedAt, second.updatedAt, Date.now());
    merged.handsObserved = Math.max(first.handsObserved, second.handsObserved);
    merged.actionsObserved = Math.max(first.actionsObserved, second.actionsObserved);
    for (const street of STREET_KEYS) merged.byStreet[street] = mergeBuckets(first.byStreet[street], second.byStreet[street]);
    const positions = new Set([...Object.keys(first.byPosition), ...Object.keys(second.byPosition)]);
    for (const position of [...positions].slice(0, 16)) {
      merged.byPosition[position] = mergeBuckets(first.byPosition[position], second.byPosition[position]);
    }
    return sanitizeSnapshot(merged);
  }

  function applySnapshot(raw, { merge = false } = {}) {
    if (typeof state !== "object" || !window.AiPlayerModel?.ensureModel) return null;
    const incoming = sanitizeSnapshot(raw);
    const resolved = merge ? mergeSnapshots(exportSnapshot(), incoming) : incoming;
    state.aiPlayerModel = {
      version: MODEL_VERSION,
      handsObserved: resolved.handsObserved,
      actionsObserved: resolved.actionsObserved,
      currentHandNumber: 0,
      byStreet: Object.fromEntries(STREET_KEYS.map(street => [street, sanitizeBucket(resolved.byStreet[street])])),
      byPosition: Object.fromEntries(
        Object.entries(resolved.byPosition).map(([position, bucket]) => [cleanPosition(position), sanitizeBucket(bucket)]),
      ),
      recent: [],
    };
    return exportSnapshot(state.aiPlayerModel);
  }

  function storageKey(key = identity) {
    return `${STORAGE_PREFIX}${String(key || "guest").slice(0, 120)}`;
  }

  function readLocal(key = identity) {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey(key)) || "null");
      return raw ? sanitizeSnapshot(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocal(snapshot = exportSnapshot(), key = identity) {
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(sanitizeSnapshot(snapshot)));
      return true;
    } catch (_) {
      return false;
    }
  }

  function persistNow() {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    const snapshot = exportSnapshot();
    writeLocal(snapshot);
    scheduleCloudSync();
    return snapshot;
  }

  function schedulePersist(delay = 120) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistNow, Math.max(0, Number(delay) || 0));
  }

  async function createCloudClient() {
    if (window.__SUPABASE_CLOUD_SAVE_TEST_CLIENT__) return window.__SUPABASE_CLOUD_SAVE_TEST_CLIENT__;
    if (window.__SUPABASE_AUTH_TEST_CLIENT__?.from) return window.__SUPABASE_AUTH_TEST_CLIENT__;
    const module = await import(CLOUD_CONFIG.clientModuleUrl);
    if (typeof module.createClient !== "function") throw new Error("ai-memory-cloud-client-unavailable");
    return module.createClient(CLOUD_CONFIG.projectUrl, CLOUD_CONFIG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  async function cloudClient() {
    if (!cloudClientPromise) {
      cloudClientPromise = createCloudClient().catch(error => {
        cloudClientPromise = null;
        throw error;
      });
    }
    return cloudClientPromise;
  }

  async function authenticatedContext() {
    if (!window.TexasHoldemAuth?.status?.().signedIn) return null;
    const client = await cloudClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const user = data?.session?.user;
    return user?.id ? { client, user } : null;
  }

  async function switchIdentity() {
    if (Date.now() - lastIdentityCheckAt < 500) return identity;
    lastIdentityCheckAt = Date.now();
    let context = null;
    try {
      context = await authenticatedContext();
    } catch (_) {
      return identity;
    }
    const nextIdentity = context?.user?.id ? `user:${context.user.id}` : "guest";
    if (nextIdentity === identity) return identity;

    writeLocal(exportSnapshot(), identity);
    const previousIdentity = identity;
    identity = nextIdentity;
    const stored = readLocal(identity);
    if (identity === "guest") {
      applySnapshot(stored || emptySnapshot());
    } else {
      const current = previousIdentity === "guest" ? exportSnapshot() : emptySnapshot();
      applySnapshot(mergeSnapshots(current, stored || emptySnapshot()));
      writeLocal(exportSnapshot(), identity);
    }
    return identity;
  }

  async function syncCloud() {
    window.clearTimeout(cloudTimer);
    cloudTimer = 0;
    if (cloudBusy) return false;
    if (!window.TournamentCloudSave?.status?.().hasSave) return false;

    cloudBusy = true;
    try {
      const context = await authenticatedContext();
      if (!context) return false;
      await switchIdentity();
      const { data, error } = await context.client
        .from(CLOUD_CONFIG.table)
        .select("save_version,payload,updated_at")
        .eq("user_id", context.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data?.payload || typeof data.payload !== "object") return false;

      const localSnapshot = exportSnapshot();
      const cloudSnapshot = sanitizeSnapshot(data.payload.aiPlayerModel);
      const merged = mergeSnapshots(localSnapshot, cloudSnapshot);
      applySnapshot(merged);
      writeLocal(merged);

      const fingerprint = JSON.stringify(merged);
      if (fingerprint === JSON.stringify(cloudSnapshot) || fingerprint === lastCloudFingerprint) {
        lastCloudSyncAt = Date.now();
        return true;
      }

      const payload = { ...data.payload, aiPlayerModel: merged };
      const { error: upsertError } = await context.client.from(CLOUD_CONFIG.table).upsert({
        user_id: context.user.id,
        save_version: Math.max(1, clampInteger(data.save_version, 100)),
        payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (upsertError) throw upsertError;
      lastCloudFingerprint = fingerprint;
      lastCloudSyncAt = Date.now();
      return true;
    } catch (error) {
      return false;
    } finally {
      cloudBusy = false;
    }
  }

  function scheduleCloudSync(delay = 900) {
    if (!window.TournamentCloudSave?.status?.().hasSave) return;
    window.clearTimeout(cloudTimer);
    cloudTimer = window.setTimeout(syncCloud, Math.max(100, Number(delay) || 0));
  }

  async function clear({ cloud = false } = {}) {
    try {
      localStorage.removeItem(storageKey(identity));
    } catch (_) {
      // The in-memory reset still works when browser storage is unavailable.
    }
    applySnapshot(emptySnapshot());
    if (cloud) {
      try {
        const context = await authenticatedContext();
        if (context) {
          const { data } = await context.client
            .from(CLOUD_CONFIG.table)
            .select("save_version,payload,updated_at")
            .eq("user_id", context.user.id)
            .maybeSingle();
          if (data?.payload) {
            const payload = { ...data.payload };
            delete payload.aiPlayerModel;
            await context.client.from(CLOUD_CONFIG.table).upsert({
              user_id: context.user.id,
              save_version: Math.max(1, clampInteger(data.save_version, 100)),
              payload,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
          }
        }
      } catch (_) {
        // Local reset remains valid if cloud storage is unavailable.
      }
    }
    return exportSnapshot();
  }

  function installHooks() {
    let ready = true;

    if (!window.__aiPlayerModelMemoryLogInstalled) {
      if (typeof logAction !== "function") {
        ready = false;
      } else {
        const previousLogAction = logAction;
        logAction = function logActionWithLongTermAiMemory(player, action, amount = 0) {
          const result = previousLogAction.apply(this, arguments);
          if (player?.isHuman) schedulePersist();
          return result;
        };
        window.__aiPlayerModelMemoryLogInstalled = true;
      }
    }

    if (!window.__aiPlayerModelMemoryStartHandInstalled) {
      if (typeof startHand !== "function") {
        ready = false;
      } else {
        const previousStartHand = startHand;
        startHand = function startHandWithLongTermAiMemory(...args) {
          const result = previousStartHand.apply(this, args);
          schedulePersist(250);
          return result;
        };
        window.__aiPlayerModelMemoryStartHandInstalled = true;
      }
    }

    return ready;
  }

  function refresh() {
    if (!window.AiPlayerModel?.version || typeof state !== "object") return false;
    const stored = readLocal(identity);
    if (!window.__aiPlayerModelMemoryRestored) {
      applySnapshot(stored || emptySnapshot());
      window.__aiPlayerModelMemoryRestored = true;
    }
    const ready = installHooks();
    if (ready || installAttempts >= 240) {
      window.clearInterval(installTimer);
      installTimer = 0;
    }
    installAttempts += 1;
    return ready;
  }

  window.AiPlayerModelMemory = {
    version: VERSION,
    snapshotVersion: SNAPSHOT_VERSION,
    fairInformationPolicy: Object.freeze({
      aggregatePublicActionsOnly: true,
      rawActionHistoryPersisted: false,
      holeCardsPersisted: false,
      boardCardsPersisted: false,
      opponentDataPersisted: false,
      actualDeckOrderPersisted: false,
      futureBoardPersisted: false,
    }),
    sanitizeSnapshot,
    exportSnapshot,
    mergeSnapshots,
    restoreSnapshot: (snapshot, options = {}) => {
      const restored = applySnapshot(snapshot, options);
      if (restored) writeLocal(restored);
      return restored;
    },
    persist: persistNow,
    syncCloud,
    clear,
    refresh,
    status: () => ({
      identity,
      localKey: storageKey(identity),
      actionsObserved: exportSnapshot().actionsObserved,
      handsObserved: exportSnapshot().handsObserved,
      cloudBusy,
      lastCloudSyncAt,
    }),
  };

  refresh();
  if (!installTimer) installTimer = window.setInterval(refresh, 25);
  window.addEventListener("pagehide", persistNow);
  window.setInterval(() => {
    switchIdentity().then(() => {
      if (window.TournamentCloudSave?.status?.().hasSave && !window.TournamentCloudSave?.status?.().busy) {
        scheduleCloudSync(250);
      }
    });
  }, 1000);
})();
