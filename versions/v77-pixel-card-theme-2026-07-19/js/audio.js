// Audio engine
// ── Audio Engine ──────────────────────────────────────────────────────────────
const Audio = (() => {
  let ctx = null;
  const activeNodes = new Set();

  function cleanupNode(node) {
    if (node) {
      node.disconnect();
      activeNodes.delete(node);
    }
  }

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const resume = () => {
        if (ctx.state === "suspended") ctx.resume();
        document.removeEventListener("touchstart", resume);
        document.removeEventListener("click", resume);
      };
      document.addEventListener("touchstart", resume, { once: true });
      document.addEventListener("click", resume, { once: true });
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function playTone({ freq = 440, type = "sine", vol = 0.18, attack = 0.01, duration = 0.18 } = {}) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);

      activeNodes.add(osc);
      activeNodes.add(gain);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(vol, c.currentTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration + 0.05);

      setTimeout(() => {
        cleanupNode(osc);
        cleanupNode(gain);
      }, (duration + 0.05 + attack) * 1000 + 50);
    } catch (e) {
      console.warn("Audio error:", e);
    }
  }

  function playChord(freqs, opts = {}) {
    freqs.forEach((freq, i) => setTimeout(() => playTone({ ...opts, freq }), i * 60));
  }

  return {
    deal() { playTone({ freq: 900, type: "triangle", vol: 0.09, attack: 0.002, duration: 0.1 }); },
    chip() { playTone({ freq: 1200, type: "triangle", vol: 0.08, duration: 0.06 }); setTimeout(() => playTone({ freq: 800, type: "triangle", vol: 0.05, duration: 0.05 }), 30); },
    fold() { playTone({ freq: 320, type: "sawtooth", vol: 0.07, attack: 0.01, duration: 0.22 }); },
    win() { playChord([523, 659, 784, 1047], { type: "triangle", vol: 0.12, attack: 0.01, duration: 0.45 }); },
    check() { playTone({ freq: 660, type: "triangle", vol: 0.07, duration: 0.1 }); },
    raise() { playTone({ freq: 520, type: "triangle", vol: 0.1, duration: 0.12 }); setTimeout(() => playTone({ freq: 700, type: "triangle", vol: 0.1, duration: 0.12 }), 90); },
    streetDeal() { [0, 80, 160].forEach(d => setTimeout(() => Audio.deal(), d)); },
    cleanup() {
      activeNodes.forEach(node => cleanupNode(node));
      activeNodes.clear();
    }
  };
})();
