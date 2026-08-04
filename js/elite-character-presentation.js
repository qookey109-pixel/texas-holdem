// Compatibility loader for stable presentation and optional feature modules.
(() => {
  "use strict";

  const FAIR_SPECIAL_NAMES = new Set(["Oracle", "Chronos"]);

  function loadOnce(selector, src, dataKey) {
    if (document.querySelector(selector)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset[dataKey] = "true";
    document.body.appendChild(script);
  }

  function sanitizeSpecialBossProfiles() {
    if (typeof AI_ROSTER === "undefined") return false;
    for (const profile of AI_ROSTER) {
      if (!FAIR_SPECIAL_NAMES.has(profile?.name)) continue;
      delete profile.omniscient;
      profile.fairPlay = true;
      profile.playerModeling = true;
      profile.publicInformationOnly = true;
      profile.publicShowdownMemory = true;
      profile.rangeInference = true;
    }
    return true;
  }

  function installFairSpecialBossGuard() {
    sanitizeSpecialBossProfiles();
    if (typeof botAction !== "function" || !window.FairSpecialBosses?.version) return false;

    const currentDecision = botAction;
    if (currentDecision?.__fairSpecialBossGuard === true) return true;
    const baseDecision = window.__aiTierBossOriginalBotAction;

    const guardedDecision = function guardedFairSpecialBossDecision(player) {
      if (FAIR_SPECIAL_NAMES.has(player?.name)) {
        if (window.__fairSpecialBossDecisionInstalled) return currentDecision(player);
        if (typeof baseDecision === "function") return baseDecision(player);
      }
      return currentDecision(player);
    };
    guardedDecision.__fairSpecialBossGuard = true;
    botAction = guardedDecision;
    window.__fairSpecialBossGuardInstalled = true;
    document.documentElement.dataset.fairSpecialBossGuard = "ready";
    return true;
  }

  loadOnce(
    'script[data-elite-character-presentation-v2]',
    "js/elite-character-presentation-v2.js?v=elite-roster-v2",
    "eliteCharacterPresentationV2",
  );
  loadOnce(
    'script[data-elite-character-progress-fix]',
    "js/elite-character-progress-fix.js?v=nineteen-roster-v1",
    "eliteCharacterProgressFix",
  );
  loadOnce(
    'script[data-ai-tier-boss-system]',
    "js/ai-tier-boss-system.js?v=tier-boss-v1",
    "aiTierBossSystem",
  );
  loadOnce(
    'script[data-ai-action-memory]',
    "js/ai-action-memory-v1.js?v=multi-street-ai-v1-1",
    "aiActionMemory",
  );
  loadOnce(
    'script[data-ai-range-tools]',
    "js/ai-range-tools-v1.js?v=multi-street-ai-v1-1",
    "aiRangeTools",
  );
  loadOnce(
    'script[data-ai-character-strategies]',
    "js/ai-character-strategies-v1.js?v=independent-ai-v1",
    "aiCharacterStrategies",
  );
  loadOnce(
    'script[data-ai-character-strategies-v1-1]',
    "js/ai-character-strategies-v1-1.js?v=multi-street-ai-v1-1",
    "aiCharacterStrategiesV11",
  );
  loadOnce(
    'script[data-ai-preflop-range-engine]',
    "js/ai-preflop-range-engine-v1.js?v=preflop-range-ai-v1-2",
    "aiPreflopRangeEngine",
  );
  loadOnce(
    'script[data-ai-character-strategies-v1-2]',
    "js/ai-character-strategies-v1-2.js?v=preflop-range-ai-v1-2",
    "aiCharacterStrategiesV12",
  );
  loadOnce(
    'script[data-ai-player-model]',
    "js/ai-player-model-v1.js?v=adaptive-player-model-v1-3",
    "aiPlayerModel",
  );
  loadOnce(
    'script[data-ai-player-model-memory]',
    "js/ai-player-model-memory-v1.js?v=long-term-ai-memory-v1-4",
    "aiPlayerModelMemory",
  );
  loadOnce(
    'script[data-ai-character-strategies-v1-3]',
    "js/ai-character-strategies-v1-3.js?v=adaptive-player-model-v1-3",
    "aiCharacterStrategiesV13",
  );
  loadOnce(
    'script[data-ai-multiway-range-model]',
    "js/ai-multiway-range-model-v1.js?v=multiway-range-ai-v1-5",
    "aiMultiwayRangeModel",
  );
  loadOnce(
    'script[data-ai-character-strategies-v1-5]',
    "js/ai-character-strategies-v1-5.js?v=multiway-range-ai-v1-5",
    "aiCharacterStrategiesV15",
  );
  loadOnce(
    'script[data-ai-repeated-allin-counter]',
    "js/ai-repeated-allin-counter-v1.js?v=repeated-allin-counter-v1-6-1",
    "aiRepeatedAllinCounter",
  );
  loadOnce(
    'script[data-fair-special-bosses]',
    "js/fair-special-bosses.js?v=public-showdown-range-v2",
    "fairSpecialBosses",
  );
  loadOnce(
    'script[data-ai-provider-legacy-worker-migration]',
    "js/ai-provider-legacy-worker-migration.js?v=custom-ai-provider-v1",
    "aiProviderLegacyWorkerMigration",
  );
  loadOnce(
    'script[data-ai-provider-client]',
    "js/ai-provider-client-v1.js?v=custom-ai-provider-v1",
    "aiProviderClient",
  );

  const guardObserver = new MutationObserver(() => {
    sanitizeSpecialBossProfiles();
    installFairSpecialBossGuard();
  });
  guardObserver.observe(document.documentElement, { childList: true, subtree: true });

  let guardAttempts = 0;
  const guardTimer = window.setInterval(() => {
    guardAttempts += 1;
    const ready = installFairSpecialBossGuard();
    if (ready || guardAttempts >= 200) window.clearInterval(guardTimer);
  }, 50);
})();
