/* ==========================================================================
   audio.js — every sound is synthesised at runtime with the Web Audio API,
   so the template ships with zero binary assets and zero load time.
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var ctx = null, master = null, muted = false;

  function on () {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  /** Percussive AD envelope (exponential so it never clicks). */
  function env (gain, t, attack, decay, peak) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function tone (freq, dur, type, peak, delay, slideTo) {
    if (!ctx || muted) return;
    var t = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || "triangle";
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, 0.008, dur, peak == null ? 0.3 : peak);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /** Band-passed white noise with a swept centre frequency. */
  function noise (dur, f0, f1, peak, q) {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    var len = Math.ceil(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    var src = ctx.createBufferSource(); src.buffer = buf;
    var bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = q || 1;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);

    var g = ctx.createGain();
    env(g, t, 0.01, dur, peak == null ? 0.25 : peak);

    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  MR.Sound = {
    unlock : function () { on(); },
    toggle : function () { muted = !muted; return muted; },
    isMuted: function () { return muted; },

    chip   : function () { on(); tone(760, 0.07, "square", 0.16); noise(0.06, 2600, 900, 0.12, 2); },
    deny   : function () { on(); tone(190, 0.18, "sawtooth", 0.12, 0, 120); },
    launch : function () { on(); noise(0.8, 480, 3400, 0.2, 0.8); tone(120, 0.5, "sine", 0.12, 0, 320); },
    tick   : function (v) { on(); tone(1150 + Math.random() * 520, 0.028, "square", 0.05 * (v || 1)); },
    thud   : function () { on(); tone(180, 0.14, "sine", 0.2, 0, 90); noise(0.09, 1400, 300, 0.1, 1.4); },
    win    : function () { on(); [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.3, "triangle", 0.28, i * 0.085); }); },
    bigWin : function () {
      on();
      [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.45, "triangle", 0.28, i * 0.07); });
      noise(0.5, 900, 5200, 0.12, 0.7);
    },
    coin   : function () { on(); tone(1500 + Math.random() * 900, 0.06, "triangle", 0.07); },
    lose   : function () { on(); tone(260, 0.3, "sine", 0.13, 0, 150); }
  };

})(window);
