(() => {
  'use strict';

  const contexts = new Set();
  let switchWindowUntil = 0;

  function markSwitchWindow() {
    switchWindowUntil = performance.now() + 360;
  }

  // Make tone changes less abrupt while an instrument is being switched.
  // Voice envelopes use setValueAtTime/exponentialRamp, so this only smooths
  // the global tone/master parameters used by the current app.
  if (window.AudioParam?.prototype?.setTargetAtTime) {
    const nativeSetTargetAtTime = window.AudioParam.prototype.setTargetAtTime;
    window.AudioParam.prototype.setTargetAtTime = function(target, startTime, timeConstant) {
      const tc = performance.now() < switchWindowUntil
        ? Math.max(Number(timeConstant) || 0, 0.085)
        : timeConstant;
      return nativeSetTargetAtTime.call(this, target, startTime, tc);
    };
  }

  function armContext(ctx) {
    if (!ctx || ctx.__vgAudioGuardArmed) return ctx;
    ctx.__vgAudioGuardArmed = true;
    contexts.add(ctx);

    let keepAliveOsc = null;
    let keepAliveGain = null;

    ctx.__vgStartKeepAlive = async () => {
      if (ctx.state === 'closed') return false;
      try {
        if (ctx.state !== 'running') await ctx.resume();
      } catch (error) {
        console.warn('[AudioGuard] resume failed', error);
      }

      if (ctx.state === 'running' && !keepAliveOsc) {
        try {
          keepAliveOsc = ctx.createOscillator();
          keepAliveGain = ctx.createGain();
          keepAliveOsc.type = 'sine';
          keepAliveOsc.frequency.value = 18;
          // Effectively inaudible, but keeps the Web Audio graph active.
          keepAliveGain.gain.value = 0.000001;
          keepAliveOsc.connect(keepAliveGain);
          keepAliveGain.connect(ctx.destination);
          keepAliveOsc.start();
        } catch (error) {
          console.warn('[AudioGuard] keep-alive failed', error);
        }
      }
      return ctx.state === 'running';
    };

    const stateChanged = () => {
      window.dispatchEvent(new CustomEvent('vg-audio-state', {
        detail: { state: ctx.state }
      }));
    };
    if (typeof ctx.addEventListener === 'function') ctx.addEventListener('statechange', stateChanged);
    else ctx.onstatechange = stateChanged;

    return ctx;
  }

  function wrapConstructor(name) {
    const NativeCtor = window[name];
    if (!NativeCtor || NativeCtor.__vgWrapped) return;

    function GuardedAudioContext(...args) {
      return armContext(new NativeCtor(...args));
    }
    GuardedAudioContext.prototype = NativeCtor.prototype;
    Object.setPrototypeOf(GuardedAudioContext, NativeCtor);
    Object.defineProperty(GuardedAudioContext, '__vgWrapped', { value: true });
    window[name] = GuardedAudioContext;
  }

  wrapConstructor('AudioContext');
  if (window.webkitAudioContext && window.webkitAudioContext !== window.AudioContext) {
    wrapConstructor('webkitAudioContext');
  }

  async function wakeAudio() {
    const jobs = [];
    contexts.forEach(ctx => {
      if (ctx.state === 'closed') return;
      jobs.push((async () => {
        try {
          if (ctx.state !== 'running') await ctx.resume();
          await ctx.__vgStartKeepAlive?.();
        } catch (error) {
          console.warn('[AudioGuard] wake failed', error);
        }
      })());
    });
    await Promise.allSettled(jobs);
  }

  const switchSelector = '.instrument-btn';
  const audioSelector = [
    '.instrument-btn', '.mode-btn', '.orientation-btn',
    '#startCameraBtn', '#testSoundBtn', '#overlayTestSoundBtn',
    '#volumeSlider', '#driveSlider'
  ].join(',');

  document.addEventListener('pointerdown', event => {
    const target = event.target.closest?.(audioSelector);
    if (!target) return;
    if (target.matches(switchSelector)) markSwitchWindow();
    void wakeAudio();
  }, true);

  // Run once before the app's click handler and several times immediately
  // after it, so Safari cannot leave the context suspended during a switch.
  document.addEventListener('click', event => {
    const target = event.target.closest?.(audioSelector);
    if (!target) return;
    if (target.matches(switchSelector)) markSwitchWindow();
    void wakeAudio();
    setTimeout(() => void wakeAudio(), 0);
    setTimeout(() => void wakeAudio(), 70);
    setTimeout(() => void wakeAudio(), 220);
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void wakeAudio();
  });
  window.addEventListener('pageshow', () => void wakeAudio());
  window.addEventListener('focus', () => void wakeAudio());

  window.__vgWakeAudio = wakeAudio;
})();
