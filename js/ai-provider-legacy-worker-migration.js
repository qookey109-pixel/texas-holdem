// Preserve existing custom Gemini Worker settings when the multi-provider engine first loads.
(() => {
  "use strict";

  const MODE_STORAGE_KEY = "texasHoldemAiProviderModeV1";
  const CUSTOM_WORKER_STORAGE_KEY = "texasHoldemAiCustomWorkerEndpointV1";
  const ENGINE_LABEL_STORAGE_KEY = "texasHoldemAiEngineLabelV1";
  const LEGACY_WORKER_STORAGE_KEY = "texasHoldemGeminiEndpointV1";

  try {
    if (localStorage.getItem(MODE_STORAGE_KEY)) return;

    const normalize = value => String(value || "").trim().replace(/\/+$/, "");
    const legacyEndpoint = normalize(localStorage.getItem(LEGACY_WORKER_STORAGE_KEY));
    const officialEndpoint = normalize(window.GEMINI_BACKEND_ENDPOINT);

    if (!legacyEndpoint || legacyEndpoint === officialEndpoint) return;

    localStorage.setItem(MODE_STORAGE_KEY, "custom-worker");
    localStorage.setItem(CUSTOM_WORKER_STORAGE_KEY, legacyEndpoint);
    if (!localStorage.getItem(ENGINE_LABEL_STORAGE_KEY)) {
      localStorage.setItem(ENGINE_LABEL_STORAGE_KEY, "自訂 Worker");
    }
  } catch (error) {
    // Storage can be unavailable in private or restricted browser contexts.
  }
})();
