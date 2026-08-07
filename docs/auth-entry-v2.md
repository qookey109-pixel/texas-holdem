# Returning login entry V2

The returning-login entry is a presentation layer in front of the existing Google/Supabase auth core.

- Fresh signed-out visits do not show the entry sequence.
- Cached returning players and OAuth callback returns show the layered poker-table scene.
- Normal motion keeps the scene visible for at least 6 seconds, and longer only when auth itself is still pending.
- `prefers-reduced-motion: reduce` switches to a short static presentation instead of forcing the full motion sequence.
- The scene uses only HTML/CSS; no video or image asset is required.
- Core authentication remains in `js/google-auth.js` and is loaded by `js/auth-entry-v2.js`.
