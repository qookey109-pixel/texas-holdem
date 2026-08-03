// Compatibility loader for the fair tiered AI and special-boss strategy system.
(() => {
  "use strict";

  if (document.querySelector('script[data-ai-tier-boss-system-v2]')) return;
  const script = document.createElement("script");
  script.src = "js/ai-tier-boss-system-v2.js?v=fair-range-inference-v2";
  script.async = false;
  script.dataset.aiTierBossSystemV2 = "true";
  document.body.appendChild(script);
})();
