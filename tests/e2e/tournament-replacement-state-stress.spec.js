import { expect, test } from "@playwright/test";

test.describe("淘汰賽 G1 補位循環壓力測試", () => {
  test.setTimeout(90_000);

  test("19 位角色可依序補位、盲注不倒退且 Gemini 最後登場", async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await expect.poll(
      () => page.evaluate(() => Boolean(
        window.TournamentMode?.setMode
        && window.ReplacementStackBalance?.version === "2.1.0"
        && window.ReplacementStackBalance?.isInstalled?.()
      )),
      { timeout: 10_000 },
    ).toBe(true);

    const report = await page.evaluate(() => {
      TournamentMode.setMode("tournament");
      state.autoNewHand = false;
      state.isMuted = true;
      ReplacementStackBalance.clearDiagnostics();

      const openingNames = state.players
        .filter(player => !player.isHuman)
        .map(player => player.name);
      const records = [];
      const failures = [];
      let previousBigBlind = 0;
      let previousAppearedCount = state.tournament?.appeared?.length || openingNames.length;

      for (let cycle = 0; cycle < 13; cycle += 1) {
        const aiPlayers = state.players.filter(player => !player.isHuman && player.stack > 0);
        const victim = aiPlayers.at(-1);
        if (!victim) {
          failures.push(`cycle-${cycle}:no-victim`);
          break;
        }

        state.handNumber = 1 + cycle * 8;
        state.blindLevel = blindLevelForHand(state.handNumber);
        state.players.forEach(player => {
          player.bet = 0;
          player.allIn = false;
        });
        victim.stack = 0;
        victim.allIn = true;
        state.handOver = true;
        state.waitingForHuman = false;

        startHand();

        const diagnostics = ReplacementStackBalance.diagnostics();
        const latest = diagnostics.at(-1);
        const appeared = [...(state.tournament?.appeared || [])];
        const replacement = latest
          ? state.players.find(player => player.name === latest.name)
          : null;

        if (!latest) failures.push(`cycle-${cycle}:missing-diagnostic`);
        if (appeared.length !== previousAppearedCount + 1) {
          failures.push(`cycle-${cycle}:appeared:${appeared.length}/${previousAppearedCount + 1}`);
        }
        if (latest && latest.bigBlind < previousBigBlind) {
          failures.push(`cycle-${cycle}:blind-regressed:${latest.bigBlind}/${previousBigBlind}`);
        }
        if (latest && (!replacement || replacement.stack + replacement.bet !== latest.stack)) {
          failures.push(`cycle-${cycle}:replacement-stack-mismatch`);
        }
        if (latest && (
          !Number.isFinite(latest.actualEntryBb)
          || latest.actualEntryBb <= 0
          || latest.stack <= 0
        )) {
          failures.push(`cycle-${cycle}:invalid-entry`);
        }

        records.push({
          cycle,
          removed: victim.name,
          appearedCount: appeared.length,
          replacement: latest?.name || "",
          tier: latest?.tier || "",
          bigBlind: latest?.bigBlind || 0,
          actualEntryBb: latest?.actualEntryBb || 0,
          stack: latest?.stack || 0,
        });

        previousAppearedCount = appeared.length;
        previousBigBlind = latest?.bigBlind || previousBigBlind;
      }

      const appeared = [...(state.tournament?.appeared || [])];
      const diagnostics = ReplacementStackBalance.diagnostics();
      const duplicateNames = appeared.filter((name, index) => appeared.indexOf(name) !== index);
      const cumulativeEntryBb = diagnostics.reduce(
        (sum, entry) => sum + Number(entry.actualEntryBb || 0),
        0,
      );

      return {
        openingNames,
        appeared,
        records,
        diagnosticsCount: diagnostics.length,
        cumulativeEntryBb,
        theoreticalCeilingBb: ReplacementStackBalance.tournamentConfig.theoreticalReplacementCeilingBb,
        duplicateNames,
        failures,
        pageErrors,
      };
    });

    await testInfo.attach("tournament-replacement-state-stress.json", {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: "application/json",
    });

    expect(report.openingNames).toHaveLength(6);
    expect(report.records).toHaveLength(13);
    expect(report.diagnosticsCount).toBe(13);
    expect(report.appeared).toHaveLength(19);
    expect(report.appeared.at(-1)).toBe("Gemini");
    expect(report.records.at(-1)?.replacement).toBe("Gemini");
    expect(report.duplicateNames).toEqual([]);
    expect(report.cumulativeEntryBb).toBeLessThanOrEqual(report.theoreticalCeilingBb);
    expect(report.failures).toEqual([]);
    expect(report.pageErrors).toEqual([]);
  });
});
