/* ==========================================================================
   fx.js — coin shower, avatar pop-up, win callout, toast
   All particles live on one full-screen canvas that is only cleared while
   something is actually on it.
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var U = MR.U, TAU = U.TAU;

  var cv = null, ctx = null, dpr = 1;
  var coins = [];
  var dirty = false;
  var toastTimer = null;

  var AVATAR_SVG =
    '<svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true">' +
      '<ellipse cx="27" cy="49" rx="15" ry="4" fill="rgba(0,0,0,.35)"/>' +
      '<defs><radialGradient id="mrAva" cx="35%" cy="28%">' +
        '<stop offset="0" stop-color="#ffeaa8"/><stop offset="1" stop-color="#e0a52a"/>' +
      '</radialGradient></defs>' +
      '<circle cx="27" cy="26" r="19" fill="url(#mrAva)" stroke="#fff" stroke-width="2.5"/>' +
      '<circle cx="20" cy="23" r="3" fill="#2a1a05"/><circle cx="34" cy="23" r="3" fill="#2a1a05"/>' +
      '<circle cx="21" cy="22" r="1" fill="#fff"/><circle cx="35" cy="22" r="1" fill="#fff"/>' +
      '<path d="M18 31 q9 9 18 0" stroke="#2a1a05" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="13" cy="31" r="3.5" fill="#f2828f" opacity=".7"/>' +
      '<circle cx="41" cy="31" r="3.5" fill="#f2828f" opacity=".7"/>' +
    '</svg>';

  MR.FX = {

    attach: function (canvas) {
      cv = canvas;
      ctx = cv.getContext("2d");
      this.resize();
    },

    resize: function () {
      if (!cv) return;
      dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      cv.width = Math.floor(global.innerWidth * dpr);
      cv.height = Math.floor(global.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    },

    /** Burst of gold coins from a winning chip, arcing up then cascading to
        the bottom edge of the screen (i.e. "into the balance"). */
    coinBurst: function (node) {
      if (!node) return;
      var r = node.getBoundingClientRect();
      var x0 = r.left + r.width / 2;
      var y0 = r.top + r.height / 2;

      for (var i = 0; i < 22; i++) {
        coins.push({
          x: x0 + (Math.random() - 0.5) * 18,
          y: y0 + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 4.2,
          vy: -(5.5 + Math.random() * 6.5),
          s: 7 + Math.random() * 6,
          flip: Math.random() * TAU,
          vf: (Math.random() - 0.5) * 0.5,
          rot: (Math.random() - 0.5) * 0.3
        });
      }
      MR.Sound.coin();
    },

    step: function (dt) {
      if (!ctx) return;

      if (!coins.length) {
        if (dirty) {
          ctx.clearRect(0, 0, global.innerWidth, global.innerHeight);
          dirty = false;
        }
        return;
      }
      dirty = true;
      ctx.clearRect(0, 0, global.innerWidth, global.innerHeight);

      var g = 26;
      var floor = global.innerHeight + 40;
      var keep = [];

      for (var i = 0; i < coins.length; i++) {
        var c = coins[i];
        c.vy += g * dt;
        c.x += c.vx * dt * 21;
        c.y += c.vy * dt * 21;
        c.flip += c.vf;
        if (c.y > floor) continue;

        // Fake 3D spin: squash the horizontal radius by |cos(flip)|.
        var w = Math.max(1.2, Math.abs(Math.cos(c.flip)) * c.s);

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        var grd = ctx.createLinearGradient(-w, -c.s, w, c.s);
        grd.addColorStop(0, "#fff3c4");
        grd.addColorStop(0.45, "#f6cf6e");
        grd.addColorStop(1, "#a9770f");
        ctx.beginPath();
        ctx.ellipse(0, 0, w, c.s, 0, 0, TAU);
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = "rgba(120,80,10,.75)";
        ctx.stroke();
        if (w > c.s * 0.45) {
          ctx.beginPath();
          ctx.ellipse(0, 0, w * 0.55, c.s * 0.55, 0, 0, TAU);
          ctx.strokeStyle = "rgba(255,255,255,.55)";
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
        ctx.restore();
        keep.push(c);
      }
      coins = keep;
    },

    /** Animated avatar popping over the winning chip stack for 2s. */
    avatarPop: function (node) {
      if (!node) return;
      var a = U.$("avatar");
      var r = node.getBoundingClientRect();
      a.innerHTML = AVATAR_SVG;
      a.style.left = (r.left + r.width / 2) + "px";
      a.style.top = (r.top + r.height / 2) + "px";
      a.classList.remove("show");
      void a.offsetWidth;                       // restart the animation
      a.classList.add("show");
    },

    callout: function (text, amount) {
      var c = U.$("callout");
      c.querySelector(".big").textContent = text;
      c.querySelector(".amt").textContent = amount != null ? "+" + U.money(amount) : "";
      c.classList.remove("show");
      void c.offsetWidth;
      c.classList.add("show");
    },

    toast: function (msg) {
      var t = U.$("toast");
      t.textContent = msg;
      t.classList.add("on");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove("on"); }, 1500);
    }
  };

})(window);
