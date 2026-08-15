# Long Session Gate 8 Manual Preview V3

> **Preview only. Do not merge or publish this branch.**
>
> Branch: `test/long-session-gate8-manual-preview-v3-20260815`
>
> Base: current validated `main` `1961025195170de9259c5ccf5985906fdefc50d6` (through PR #216).
>
> Candidate source: PR #210 (`highest-affordable-fallback`).

## Why V3 exists

Gate 8 Preview V2 was rebuilt from `main@bd909d97524bba239067a82484b966a6460ec0e4`, but production continued moving afterward. By 2026-08-15 it had diverged from current `main` by 43 commits. V3 is rebuilt directly from the current formal `main` and carries only the two manual-preview Long Session changes.

V1 and V2 are superseded for manual evaluation. Do not merge or publish any Gate 8 preview branch.

## What this preview contains

- Long Session entry is visible locally for manual evaluation only.
- Initial table: T1 `10/20`, Hero + 6 ordinary AI each enter with `2,000` = 100BB.
- Initial bankroll reserve: `2,000`.
- Promotion remains the accepted `1.00x total-wealth` rule.
- On bust:
  - re-enter the current table when bankroll can still fund its 100BB entry;
  - otherwise offer the **highest affordable lower table**;
  - end only when no table, including T1, is affordable.
- All product/UI changes already merged through PR #216 remain inherited from current `main`.
- Default Normal, Challenge G1, Gemini and AI V2.9.5 are not changed by this preview.

## Start locally on the canonical Mac checkout

First confirm there is no local work you would overwrite:

```bash
cd /Users/qoo/Documents/GitHub/texas-holdem
git status --short
```

If that command prints uncommitted files, preserve them before switching.

Then:

```bash
git fetch origin
git switch --detach origin/test/long-session-gate8-manual-preview-v3-20260815
npm ci
node scripts/serve-static.mjs
```

Open:

```text
http://127.0.0.1:4173/
```

Open Settings and choose **🪜 Long Session · Gate 8**.

After testing, stop the server with `Ctrl+C`, then return to formal main:

```bash
git switch main
git pull --ff-only origin main
```

## Gate 8 play-feel checklist

Do not judge only by whether you win. Focus on whether the mode communicates risk and progression clearly.

1. **Start / identity** — Is it obvious that Long Session is a separate 100BB ladder and that Bank `2,000` is separate from the active stack?
2. **Move-up** — When a higher table becomes affordable, does moving up feel earned and understandable rather than arbitrary?
3. **Bankroll clarity** — Before and after moving tables, can you understand where the remaining chips went and what `Bank` means?
4. **Bust / re-entry** — If the current table can still be funded, does the 100BB re-entry decision feel fair?
5. **Bust / demotion** — When the current table cannot be funded but a lower one can, does the `Long Session 降桌` decision feel fair rather than like hidden rubber-banding or punishment?
6. **Demotion choice** — Are `降到 X/Y` and `暫停 Long Session` clear enough that you know exactly what each choice will do?
7. **Recovery motivation** — After falling back, does trying to climb back feel motivating rather than grindy?
8. **Session pacing** — Does the session feel meaningfully longer without becoming repetitive or exhausting?
9. **Failure boundary** — When even T1 cannot be funded, does ending the Long Session feel predictable and justified?
10. **No collateral behavior** — Normal mode, Tournament/Challenge and Gemini should still feel unchanged when Long Session is off.

## Pass / revise decision

Gate 8 is **manual product judgment**, not another statistical tuning pass.

- **PASS candidate:** demotion is understandable, feels fair, preserves progression tension, and the longer session feels better to play.
- **REVISE:** the structure feels right but wording, button order, bankroll explanation, table-change feedback or pacing presentation is confusing.
- **REJECT:** demotion feels like an artificial bailout/punishment, destroys progression tension, or makes sessions feel grindy despite Gate 7 metrics.

Do not authorize production from this preview alone. A Gate 8 PASS must be written back to Issue #183 first. Productization, if approved after that, must happen in a separate reviewed PR created from then-current `main`, with default Normal unchanged.
