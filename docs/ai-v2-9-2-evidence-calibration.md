# AI V2.9.2 Evidence Calibration

## Evidence source

- GitHub Actions run: `31072973185`
- Deterministic shards: `50`
- Completed hands: `25,000 / 25,000`
- Hero profiles: `tight`, `balanced`, `loose-aggressive`, `calling`, `pressure`
- Validation: passed
- Fair public-information boundary: passed

## Main findings

| Role | Target | Hands | BB/100 | 95% CI | Finding |
|---|---:|---:|---:|---:|---|
| Oracle | 9.6 | 9,488 | +251.33 | +163.98 to +338.69 | Strong and statistically positive |
| Chronos | 9.8 | 9,707 | +244.86 | +145.11 to +344.61 | Strong and statistically positive |
| Pao | 6.7 | 6,211 | -192.98 | -312.48 to -73.48 | Too loose; VPIP 82.5% |
| Shark | 7.5 | 6,954 | -139.24 | -249.73 to -28.74 | Defense range too wide |

Oracle and Chronos met the hand-count, profile-coverage, statistical-profit and fairness requirements for a 10-point review, but their negative-EV call rates were `3.3685%` and `3.3784%`. The review threshold is `3.0%`.

## V2.9.2 changes

### Oracle and Chronos

- Keep V2.8 public-range equity, fold-equity and sizing candidates.
- Reject any final call whose recorded `callEv` is below the telemetry negative-EV boundary of `-0.04 BB`.
- Keep ratings at `9.6` and `9.8`; no automatic promotion to `10.0`.

### Pao and Shark

- Keep their calling-station and precision-guard identities.
- Add absolute preflop equity floors.
- Raise the defense floor against raises and reraises.
- Add multiway and position adjustments.
- Stop clearly negative-EV turn calls.
- Require a positive river safety margin when the hand is not value-ready.

## Scope and fairness

V2.9.2 changes only `Pao`, `Shark`, `Oracle`, and `Chronos`. The other fourteen local AI characters continue using V2.8 unchanged.

Allowed information remains limited to the AI's own cards and public game information. Hidden opponent cards, actual deck order, future board cards and predetermined winners remain forbidden.

## Verification

- Dedicated browser test: `tests/e2e/ai-tier-strategy-v2-9-2.spec.js`
- Pull-request long-run smoke: two deterministic shards, 25 hands each
- Full browser and static regression workflows

A new 25,000-hand run is required before changing any difficulty rating or declaring either Boss eligible for `10.0`.
