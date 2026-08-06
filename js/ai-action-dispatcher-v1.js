// Stable AI action dispatcher: always execute the current outer strategy wrapper.
(() => {
  "use strict";
  if (window.AiActionDispatcherV1?.version) return;

  const VERSION = "1.0.0";

  function currentAction() {
    if (!window.botAction?.__aiTierStrategyV292Wrapper) {
      window.AiTierStrategyV292?.refresh?.();
    }
    return window.botAction;
  }

  function dispatch(player) {
    const action = currentAction();
    if (typeof action !== "function") {
      throw new TypeError("AI action dispatcher could not resolve window.botAction");
    }
    return action(player);
  }

  function continueBettingWithCurrentAiStrategy() {
    let guard = 0;
    state.waitingForHuman = false;

    while (!state.handOver && guard < 140) {
      if (finishByFoldIfNeeded()) break;
      if (shouldRunOutAllIn()) {
        runOutAllInBoard();
        break;
      }
      if (isBettingRoundComplete()) {
        advanceStreet();
        guard += 1;
        continue;
      }

      if (state.currentActorIndex < 0 || !needsAction(state.players[state.currentActorIndex])) {
        state.currentActorIndex = nextPendingActor(state.currentActorIndex);
      }

      const actor = state.players[state.currentActorIndex];
      if (!actor) break;
      if (actor.isHuman) {
        promptHumanAction(actor);
        break;
      }

      dispatch(actor);
      state.currentActorIndex = nextPendingActor(actor.position);
      guard += 1;
    }

    if (!state.handOver && guard >= 140) {
      log("系統：下注輪推進中止，請開新牌局。");
      state.waitingForHuman = !human().folded && !human().allIn;
    }

    render();
  }

  continueBettingWithCurrentAiStrategy.__aiActionDispatcherV1 = true;
  window.continueBetting = continueBettingWithCurrentAiStrategy;
  try {
    continueBetting = continueBettingWithCurrentAiStrategy;
  } catch (error) {
    console.warn("AI action dispatcher could not replace the global binding", error);
  }

  window.AiActionDispatcherV1 = Object.freeze({
    version: VERSION,
    dispatch,
    refresh() {
      window.continueBetting = continueBettingWithCurrentAiStrategy;
      try {
        continueBetting = continueBettingWithCurrentAiStrategy;
      } catch (error) {
        console.warn("AI action dispatcher refresh could not replace the global binding", error);
      }
      document.documentElement.dataset.aiActionDispatcherV1 = "ready";
      return true;
    },
  });

  document.documentElement.dataset.aiActionDispatcherV1 = "ready";
})();
