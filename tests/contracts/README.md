# Backend contract tests

`gemini-backend-contract.mjs` is a parity guard for the two interchangeable Gemini backends:

- `backend/gemini-worker/src/index.js`
- `backend/oci-gemini-function/func.py`

The test reads one versioned fixture, `tests/fixtures/gemini-backend-contract-v1.json`, and requires both implementations to produce the same normalized request and decision semantics for the covered contract cases.

The fixture intentionally includes hidden/future client fields inside `tournamentObservation`; both providers must strip those fields and preserve only the shared historical-public observation contract.

This test is contract/evidence infrastructure only. It does not authorize or change Gemini strategy, AI V2.9.5 behavior, poker rules, Normal Economy, Tournament G1, or Long Session behavior.
