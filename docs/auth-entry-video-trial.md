# Auth entry original-video trial

This trial keeps the existing CSS V2 returning-login table as an immediate fallback and prefers the original poker-table video when the browser can play it.

- Trial asset: `assets/auth-entry-poker-trial.mp4`
- Trial resolution: 426×240
- Trial size: 64,071 bytes
- Playback: muted, inline, autoplay, 1.55× speed
- Returning-login minimum presentation: 6.5 seconds
- Fresh signed-out visits: no forced entry delay
- Reduced-motion: video is skipped and the short static V2 path remains
- Media failure: CSS V2 remains visible instead of presenting a blank screen

The low-resolution asset is deliberately a first visual-direction test. If the video direction is approved, the same integration can be upgraded to a higher-resolution optimized MP4 without changing the login lifecycle.
