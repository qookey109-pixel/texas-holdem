# Long Session Gate 8 Manual Preview

> **Preview only. Do not merge or publish this branch.**
>
> Branch: `test/long-session-gate8-manual-preview-v1-20260814`
>
> Candidate source: PR #210 (`highest-affordable-fallback`).

## What this preview contains

- Long Session entry is visible locally for manual evaluation only.
- Initial table: T1 `10/20`, Hero + 6 ordinary AI each enter with `2,000` = 100BB.
- Initial bankroll reserve: `2,000`.
- Promotion remains the accepted `1.00x total-wealth` rule.
- On bust:
  - re-enter the current table when bankroll can still fund its 100BB entry;
  - otherwise offer the **highest affordable lower table**;
  - end only when no table, including T1, is affordable.
- Normal, Challenge G1, Gemini and AI V2.9.5 are not part of this preview change.

## Start locally on the canonical Mac checkout

First confirm there is no local work you would overwrite:

```bash
cd /Users/qoo/Documents/GitHub/texas-holdem
git status --short
```

If that command prints uncommitted files, stop and preserve them before switching.

Then:

```bash
git fetch origin
git switch --detach origin/test/long-session-gate8-manual-preview-v1-20260814
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

- **PASS candidate:** demotion is understandable, feels fair, preserves the sense of progression, and the longer session feels better to play.
- **REVISE:** the core structure feels right but wording, button order, bankroll explanation, table-change feedback or pacing presentation is confusing.
- **REJECT:** demotion feels like an artificial bailout/punishment, destroys progression tension, or makes sessions feel grindy despite the Gate 7 metrics.

Do not authorize production from this preview alone. A Gate 8 PASS should be written back to Issue #183 first, then productization should happen in a separate reviewed PR with the default Normal mode unchanged.
