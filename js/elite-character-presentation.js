// Compatibility loader for the stable elite-character presentation.
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
})();
