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
    "js/ai-tier-boss-system.js?v=tier-boss-v1",
    "aiTierBossSystem",
  );
  loadOnce(
    'script[data-ai-provider-client]',
    "js/ai-provider-client-v1.js?v=custom-ai-provider-v1",
    "aiProviderClient",
  );
})();
