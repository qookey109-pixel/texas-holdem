// Async-safe betting loop so remote AI decisions cannot skip actors or race a new hand.
(() => {
  "use strict";

  if (window.GeminiAsyncBettingLoop?.version) return;

  let loopGeneration = 0;

  async function continueBettingAsync() {
    const generation = ++loopGeneration;
    let guard = 0;
    state.waitingForHuman = false;

    while (!state.handOver && guard < 140) {
      if (generation !== loopGeneration) return false;
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

      const handNumber = state.handNumber;
      const actionResult = botAction(actor);
      const isAsync = Boolean(actionResult && typeof actionResult.then === "function");
      if (isAsync) {
        render();
        await actionResult;
      }

      if (generation !== loopGeneration) return false;
      if (state.handNumber !== handNumber || !state.players.includes(actor)) return false;
      if (state.handOver) break;

      state.currentActorIndex = nextPendingActor(actor.position);
      guard += 1;
    }

    if (generation !== loopGeneration) return false;
    if (!state.handOver && guard >= 140) {
      log("系統：下注輪推進中止，請開新牌局。");
      state.waitingForHuman = !human().folded && !human().allIn;
    }

    render();
    return true;
  }

  continueBetting = continueBettingAsync;

  window.GeminiAsyncBettingLoop = {
    version: "1.0.0",
    continue: continueBettingAsync,
    cancelPending: () => {
      loopGeneration += 1;
    },
    generation: () => loopGeneration,
  };
})();
