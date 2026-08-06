// Compatibility loader for stable presentation and optional feature modules.
(() => {
  "use strict";

  function loadOnce(selector, src, dataKey) {
    if (document.querySelector(selector)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset[dataKey] = "true";
    document.body.appendChild(script);
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
    "js/ai-tier-boss-system.js?v=tier-boss-fair-guard-v2",
    "aiTierBossSystem",
  );
  loadOnce(
    'script[data-fair-boss-core-guard]',
    "js/fair-boss-core-guard.js?v=fair-boss-core-guard-v1",
    "fairBossCoreGuard",
  );
  loadOnce(
    'script[data-ai-action-memory]',
    "js/ai-action-memory-v1.js?v=public-action-history-v2-2",
    "aiActionMemory",
  );
  loadOnce(
    'script[data-ai-range-tools]',
    "js/ai-range-tools-v1.js?v=range-history-filter-v2-2",
    "aiRangeTools",
  );
  loadOnce(
    'script[data-ai-range-weight]',
    "js/ai-range-weight-v1.js?v=range-weight-v2-2",
    "aiRangeWeight",
  );
  loadOnce(
    'script[data-ai-character-strategies]',
    "js/ai-character-strategies-v1.js?v=independent-ai-v1",
    "aiCharacterStrategies",
  );
  loadOnce(
    'script[data-ai-opening-strategies-v2-3]',
    "js/ai-opening-strategies-v2-3.js?v=opening-risk-control-v2-3",
    "aiOpeningStrategiesV23",
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
    'script[data-ai-range-decision-v2-4]',
    "js/ai-range-decision-integration-v2-4.js?v=range-decision-v2-4",
    "aiRangeDecisionV24",
  );
  loadOnce(
    'script[data-ai-middle-range-decision-v2-6]',
    "js/ai-middle-range-decision-v2-6.js?v=bounded-middle-range-v2-6",
    "aiMiddleRangeDecisionV26",
  );
  loadOnce(
    'script[data-ai-board-intelligence-v2-5]',
    "js/ai-board-intelligence-v2-5.js?v=mid-elite-board-intelligence-v2-5",
    "aiBoardIntelligenceV25",
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
    'script[data-ai-ev-accounting]',
    "js/ai-ev-accounting-v1.js?v=net-ev-accounting-v1-0-1",
    "aiEvAccounting",
  );
  loadOnce(
    'script[data-ai-effective-stack-spr]',
    "js/ai-effective-stack-spr-v1.js?v=effective-stack-spr-v1",
    "aiEffectiveStackSpr",
  );
  loadOnce(
    'script[data-boss-public-range-model]',
    "js/boss-public-range-model-v1.js?v=boss-public-range-v1",
    "bossPublicRangeModel",
  );
  loadOnce(
    'script[data-boss-equity-engine]',
    "js/boss-equity-engine-v1.js?v=public-range-equity-v1-1",
    "bossEquityEngine",
  );
  loadOnce(
    'script[data-boss-equity-integration]',
    "js/boss-equity-integration-v1.js?v=public-range-equity-integration-v1-1",
    "bossEquityIntegration",
  );
  loadOnce(
    'script[data-ai-role-strength-balance]',
    "js/ai-role-strength-balance-v1.js?v=role-strength-rebalance-v1",
    "aiRoleStrengthBalance",
  );
  loadOnce(
    'script[data-ai-mid-elite-decision-chain-v2-6]',
    "js/ai-mid-elite-decision-chain-v2-5.js?v=complete-mid-elite-chain-v2-6",
    "aiMidEliteDecisionChainV26",
  );
  loadOnce(
    'script[data-tournament-observation-memory]',
    "js/tournament-observation-memory-v1.js?v=shared-public-observation-v1",
    "tournamentObservationMemory",
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
  // The pressure layer must install before V2.7 so V2.7 remains the outer
  // diagnostics wrapper and later refreshes cannot create a wrapper cycle.
  loadOnce(
    'script[data-economy-fold-defense-v1]',
    "js/economy-fold-defense-v1.js?v=economy-fold-defense-v1-1-0",
    "economyFoldDefenseV1",
  );
  loadOnce(
    'script[data-ai-tiered-multiway-equity-v2-7]',
    "js/ai-tiered-multiway-equity-v2-7.js?v=tiered-multiway-equity-v2-7",
    "aiTieredMultiwayEquityV27",
  );
  // V2.8 consumes the complete V2.7 chain and remains the source strategy.
  loadOnce(
    'script[data-ai-tier-strategy-v2-8]',
    "js/ai-tier-strategy-v2-8.js?v=tier-quality-v2-8",
    "aiTierStrategyV28",
  );
  // V2.9.2 applies evidence-backed guards to Pao, Shark, Oracle and Chronos.
  loadOnce(
    'script[data-ai-tier-strategy-v2-9-2]',
    "js/ai-tier-strategy-v2-9-2.js?v=evidence-calibration-v2-9-2",
    "aiTierStrategyV292",
  );
  // V2.9.3 keeps the postflop V2.7 chain while routing middle/elite preflop
  // decisions back to the existing position and public-range strategy stack.
  loadOnce(
    'script[data-ai-mid-elite-preflop-recovery-v2-9-3]',
    "js/ai-mid-elite-preflop-recovery-v2-9-3.js?v=middle-elite-preflop-recovery-v2-9-3",
    "aiMidElitePreflopRecoveryV293",
  );
  // V2.9.4 narrows the four over-loose opening roles and adds public-only
  // late-street call discipline without changing Pao, Shark or the Bosses.
  loadOnce(
    'script[data-ai-opening-balance-v2-9-4]',
    "js/ai-opening-balance-v2-9-4.js?v=opening-balance-v2-9-4",
    "aiOpeningBalanceV294",
  );
  // V2.9.5 restores Toto’s reasonably priced entries and requires genuine
  // turn/river value before the four opening roles continue to showdown.
  loadOnce(
    'script[data-ai-opening-balance-v2-9-5]',
    "js/ai-opening-balance-v2-9-5.js?v=opening-wtsd-recovery-v2-9-5",
    "aiOpeningBalanceV295",
  );
  // The dispatcher is loaded last so the betting loop always resolves the
  // current outer AI strategy rather than a stale global function binding.
  loadOnce(
    'script[data-ai-action-dispatcher-v1]',
    "js/ai-action-dispatcher-v1.js?v=ai-action-dispatcher-v1",
    "aiActionDispatcherV1",
  );
})();
