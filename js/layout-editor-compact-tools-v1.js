// Keep layout-editor actions immediately accessible while preserving existing behavior.
(() => {
  "use strict";

  if (window.LayoutEditorCompactToolsV1?.version) return;

  const VERSION = "2.1.0";

  function installStyles() {
    if (document.getElementById("layoutEditorCompactToolsStyles")) return;
    const style = document.createElement("style");
    style.id = "layoutEditorCompactToolsStyles";
    style.textContent = `
      html body .side-rail .layout-editor-actions.layout-editor-actions-direct {
        display: grid !important;
        grid-template-columns: 1fr !important;
        align-items: stretch !important;
        gap: 7px !important;
      }
      html body .side-rail .layout-editor-actions.layout-editor-actions-direct > button {
        min-width: 0 !important;
        width: 100% !important;
        min-height: 38px;
        white-space: normal;
        line-height: 1.15;
      }
      html body .side-rail .layout-editor-actions.layout-editor-actions-direct > .layout-nudge {
        margin: 0 !important;
      }
      html body .side-rail .layout-editor-actions.layout-editor-actions-direct > #resetLayoutButton {
        padding-left: 8px;
        padding-right: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  function unwrapLegacyDisclosure(actions, panel) {
    const details = panel.querySelector("#layoutEditorMoreTools");
    if (!details) return;
    const body = details.querySelector(".layout-editor-tools-body");
    if (body) {
      [...body.children].forEach(child => actions.insertBefore(child, details));
    }
    details.remove();
  }

  function install() {
    const panel = document.querySelector("#layoutEditorPanel");
    const actions = panel?.querySelector(".layout-editor-actions");
    if (!panel || !actions) return false;

    unwrapLegacyDisclosure(actions, panel);

    const saveButton = panel.querySelector("#saveLayoutButton");
    const autoButton = panel.querySelector("#autoLayoutButton");
    const resetButton = panel.querySelector("#resetLayoutButton");
    const lockButton = panel.querySelector("#lockLayoutButton");
    const nudge = panel.querySelector(".layout-nudge");
    if (!saveButton || !resetButton || !lockButton || !nudge) return false;

    // The old auto-arrange action and the official preset now represent the same
    // user intent. Keep one authoritative official action to avoid duplicate UX.
    autoButton?.remove();

    // Preserve the remaining original event listeners and action semantics. Only
    // normalize the existing nodes into a direct, predictable visual order.
    [saveButton, resetButton, lockButton, nudge].forEach(node => actions.appendChild(node));
    actions.classList.remove("layout-editor-actions-compact");
    actions.classList.add("layout-editor-actions-direct");
    installStyles();
    return true;
  }

  function boot() {
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (!install()) return;
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.LayoutEditorCompactToolsV1 = Object.freeze({
    version: VERSION,
    mode: "direct-actions-single-official",
    install,
    isInstalled: () => Boolean(
      document.querySelector("#layoutEditorPanel .layout-editor-actions-direct")
      && !document.querySelector("#layoutEditorMoreTools")
      && !document.querySelector("#autoLayoutButton"),
    ),
  });

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", boot, { once: true })
    : boot();
})();
