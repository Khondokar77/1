/* ==========================================================================
   utils.js — namespace bootstrap + shared helpers
   Every module hangs off the single global `MR` so the project runs from the
   file system with no bundler and no module loader.
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR = global.MR || {};

  var U = MR.U = {

    TAU: Math.PI * 2,

    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },

    lerp: function (a, b, t) { return a + (b - a) * t; },

    /** Normalise any angle into [0, 2π). */
    wrapTau: function (a) { var t = MR.U.TAU; return ((a % t) + t) % t; },

    /** Currency formatting used by every readout in the UI. */
    money: function (v) {
      return "$" + Number(v).toLocaleString("en-US", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
    },

    /** Compact chip face value: 0.25 -> ".25", 1 -> "1", 12.5 -> "12.50" */
    chipFace: function (v) {
      if (v < 1) return v.toFixed(2).replace(/^0/, "");
      return v % 1 ? v.toFixed(2) : String(v);
    },

    $: function (id) { return document.getElementById(id); },

    /** Crypto-grade uniform float in [0,1). Swap this for a server-provided
        outcome when wiring the game to a real-money backend. */
    random: function () {
      if (global.crypto && global.crypto.getRandomValues) {
        var a = new Uint32Array(1);
        global.crypto.getRandomValues(a);
        return a[0] / 4294967296;
      }
      return Math.random();
    },

    /** requestAnimationFrame twice — lets layout settle before measuring. */
    afterLayout: function (fn) {
      requestAnimationFrame(function () { requestAnimationFrame(fn); });
    }
  };

  return U;
})(window);
