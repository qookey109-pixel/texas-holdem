import { expect, test } from "@playwright/test";

function overlaps(a, b, padding = 0) {
  return !(
    a.right <= b.left - padding
    || a.left >= b.right + padding
    || a.bottom <= b.top - padding
    || a.top >= b.bottom + padding
  );
}

test("回合與動作提示固定在玩家資訊區且不遮公共牌", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect.poll(
    () => page.evaluate(() => window.TableStatusDock?.version || ""),
    { timeout: 10_000 },
  ).toBe("1.0.0");

  await expect.poll(
    () => page.evaluate(() => window.TableStatusDock?.isInstalled?.()),
  ).toBe(true);

  const parents = await page.evaluate(() => ({
    dockParent: document.querySelector("#tableStatusDock")?.parentElement?.className || "",
    toastParent: document.querySelector("#actionToast")?.parentElement?.id || "",
    markerParent: document.querySelector("#playerTurnMarker")?.parentElement?.id || "",
  }));

  expect(parents.dockParent).toContain("player-panel");
  expect(parents.toastParent).toBe("tableStatusDock");
  expect(parents.markerParent).toBe("tableStatusDock");

  await page.evaluate(() => {
    // Reproduce the user's customized hand-card position that previously pulled
    // the turn marker into the community-card row.
    document.documentElement.style.setProperty("--layout-heroCards-top", "66%");
    state.handOver = false;
    state.waitingForHuman = true;
    state.currentActorIndex = 0;
    render();

    const toast = document.querySelector("#actionToast");
    toast.textContent = "輪到你";
    toast.classList.add("is-visible");
    window.TableStatusDock.refresh();
  });

  await expect(page.locator("#playerTurnMarker")).toHaveClass(/is-visible/);
  await expect(page.locator("#actionToast")).toHaveClass(/is-duplicate-turn/);

  const turnPlacement = await page.evaluate(() => {
    const board = document.querySelector("#boardCards").getBoundingClientRect();
    const marker = document.querySelector("#playerTurnMarker").getBoundingClientRect();
    return {
      board: { left: board.left, top: board.top, right: board.right, bottom: board.bottom },
      marker: { left: marker.left, top: marker.top, right: marker.right, bottom: marker.bottom },
    };
  });

  expect(overlaps(turnPlacement.marker, turnPlacement.board, 12)).toBe(false);

  await page.evaluate(() => {
    const toast = document.querySelector("#actionToast");
    toast.classList.remove("is-visible");
    toast.textContent = "CHECK";
    void toast.offsetWidth;
    toast.classList.add("is-visible");
    window.TableStatusDock.refresh();
  });

  await expect(page.locator("#actionToast")).not.toHaveClass(/is-duplicate-turn/);

  const actionPlacement = await page.evaluate(() => {
    const board = document.querySelector("#boardCards").getBoundingClientRect();
    const toast = document.querySelector("#actionToast").getBoundingClientRect();
    return {
      board: { left: board.left, top: board.top, right: board.right, bottom: board.bottom },
      toast: { left: toast.left, top: toast.top, right: toast.right, bottom: toast.bottom },
    };
  });

  expect(overlaps(actionPlacement.toast, actionPlacement.board, 12)).toBe(false);
  await expect(page.locator("html")).toHaveAttribute("data-table-status-dock", "ready");
});
