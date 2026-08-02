// Compatibility loader for the stable elite-character presentation.
(() => {
  "use strict";
  if (window.EliteCharacterPresentation?.version) return;
  if (document.querySelector('script[data-elite-character-presentation-v2]')) return;

  const script = document.createElement("script");
  script.src = "js/elite-character-presentation-v2.js?v=elite-roster-v2";
  script.async = false;
  script.dataset.eliteCharacterPresentationV2 = "true";
  document.body.appendChild(script);
})();
