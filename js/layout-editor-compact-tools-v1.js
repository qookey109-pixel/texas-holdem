// Reduce permanent layout-editor clutter without removing existing capabilities.
(() => {
  "use strict";

  if (window.LayoutEditorCompactToolsV1?.version) return;

  const VERSION = "1.0.0";

  function installStyles() {
    if (document.getElementById("layoutEditorCompactToolsStyles")) return;
    const style = document.createElement("style");
    style.id = "layoutEditorCompactToolsStyles";
    style.textContent = `
      html body .side-rail .layout-editor-actions.layout-editor-actions-compact {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        align-items: start !important;
        gap: 7px !important;
      }
      html body .side-rail .layout-editor-actions.layout-editor-actions-compact > #saveLayoutButton {
        width: 100% !important;
        min-width: 0 !important;
      }
      html body .side-rail .layout-editor-tools-details {
        min-width: 0;
      }
      html body .side-rail .layout-editor-tools-details[open] {
        grid-column: 1 / -1;
        width: 100%;
      }
      html body .side-rail .layout-editor-tools-details > summary {
        min-height: 36px;
        padding: 7px 10px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 9px;
        background: rgba(255,255,255,.055);
        color: var(--ink);
        font-size: .68rem;
        font-weight: 850;
        line-height: 1.15;
        cursor: pointer;
        list-style: none;
        white-space: nowrap;
        user-select: none;
      }
      html body .side-rail .layout-editor-tools-details > summary::-webkit-details-marker {
        display: none;
      }
      html body .side-rail .layout-editor-tools-details > summary::before {
        content: "▸";
        display: inline-block;
        margin-right: 5px;
        transition: transform .14s ease;
      }
      html body .side-rail .layout-editor-tools-details[open] > summary::before {
        transform: rotate(90deg);
      }
      html body .side-rail .layout-editor-tools-body {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 7px;
        margin-top: 7px;
        padding-top: 7px;
        border-top: 1px solid rgba(255,255,255,.09);
      }
      html body .side-rail .layout-editor-tools-body > button {
        min-width: 0 !important;
        width: 100% !important;
      }
      html body .side-rail .layout-editor-tools-body > .layout-nudge {
        grid-column: 1 / -1;
        margin: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    const panel = document.querySelector("#layoutEditorPanel");
    const actions = panel?.querySelector(".layout-editor-actions");
    if (!panel || !actions) return false;
    if (panel.querySelector("#layoutEditorMoreTools")) return true;

    const saveButton = panel.querySelector("#saveLayoutButton");
    const autoButton = panel.querySelector("#autoLayoutButton");
    const resetButton = panel.querySelector("#resetLayoutButton");
    const lockButton = panel.querySelector("#lockLayoutButton");
    const nudge = panel.querySelector(".layout-nudge");
    if (!saveButton || !autoButton || !resetButton || !lockButton || !nudge) return false;

    const details = document.createElement("details");
    details.id = "layoutEditorMoreTools";
    details.className = "layout-editor-tools-details";

    const summary = document.createElement("summary");
    summary.id = "layoutEditorMoreToolsToggle";
    summary.textContent = "更多工具";
    summary.setAttribute("aria-label", "展開更多版面工具");

    const body = document.createElement("div");
    body.className = "layout-editor-tools-body";
    body.append(autoButton, resetButton, lockButton, nudge);
    details.append(summary, body);

    actions.classList.add("layout-editor-actions-compact");
    actions.appendChild(details);
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
    install,
    isInstalled: () => Boolean(document.querySelector("#layoutEditorMoreTools")),
  });

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", boot, { once: true })
    : boot();
})();
