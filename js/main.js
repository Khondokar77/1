/* ==========================================================================
   main.js — bootstrap, fit-to-screen scaling, render loop

   SCALING MODEL
   -------------
   The UI is authored once, on a 720 x 1332 design stage lifted straight off
   the reference artwork. This function is the only place that knows about
   the real device:

       s = min(viewportWidth / 720, viewportHeight / 1332)

   #app is scaled by s, so every component keeps its exact designed size and
   position. There is no reflow path at all, which is what makes overflow
   impossible on any handset.

   On a taller-than-1332 device the stage is simply made taller (its height
   becomes viewportHeight / s design pixels). The header stays pinned to the
   top, the board and controls stay pinned to the bottom, and #wheelStage —
   which spans the gap between them — grows, centring the fixed 596px wheel
   in the extra room. The wheel therefore always renders at 82.8% of the
   stage width, exactly as in the reference.
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var U = MR.U;

  var DESIGN_W = 720;
  var DESIGN_H = 1332;
  var WHEEL_PX = 596;      // design pixels

  var lastFrame = 0;
  var resizeTimer = null;

  function layout () {
    var vw = global.innerWidth;
    var vh = global.innerHeight;
    if (vw < 2 || vh < 2) return;

    // Fit the design stage inside the viewport.
    var s = Math.min(vw / DESIGN_W, vh / DESIGN_H);

    // Let the stage grow downward on tall devices so the felt fills the
    // screen and the bottom cluster stays pinned to the bottom edge.
    var stageH = Math.max(DESIGN_H, vh / s);

    MR.stageScale = s;
    document.documentElement.style.setProperty("--s", s.toFixed(5));
    U.$("app").style.height = stageH.toFixed(1) + "px";

    // The canvas is a design-pixel box inside a CSS-scaled parent, so its
    // backing store must account for BOTH the stage scale and the device
    // pixel ratio to stay sharp. Capped at 2x: beyond that the wheel is
    // pushing several extra megapixels per frame for no visible gain.
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    MR.Wheel.resize(WHEEL_PX, s * dpr);
    MR.wheelDirty = true;

    MR.FX.resize();
    MR.Camera.measure(s);
    MR.Board.syncArrows();
  }

  function frame (now) {
    var dt = Math.min((now - lastFrame) / 1000, 0.05);   // clamp tab-switch spikes
    lastFrame = now;

    MR.Phys.step(dt);

    // While the wheel is idle nothing on it changes, so there is no reason to
    // clear and re-blit it 60 times a second. The canvas simply keeps its
    // last frame; `wheelDirty` forces one redraw after a resize.
    var spinning = MR.Phys.state !== "idle";
    if (spinning || MR.wheelDirty) {
      MR.Wheel.draw(MR.Phys.wheelAng, MR.Phys.wheelVel);
      if (spinning) {
        MR.Wheel.drawBall(MR.Phys.ballAng, MR.Phys.ballRad,
                          MR.Phys.ballVel - MR.Phys.wheelVel);
      }
      MR.wheelDirty = false;
    }

    MR.FX.step(dt);

    requestAnimationFrame(frame);
  }

  function scheduleLayout (delay) {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, delay || 140);
  }

  function bindControls () {
    U.$("spinBtn").addEventListener("click", function () { MR.Game.spin(); });
    U.$("dblBtn").addEventListener("click", function () { MR.Game.doubleBet(); });

    /* Repeat: tap re-places the previous round's chips.
       Hold (500ms) undoes the last stake instead — the reference layout only
       has room for three keys, so undo lives on the same one. */
    (function () {
      var btn = U.$("repeatBtn");
      var timer = null, fired = false;

      function start () {
        fired = false;
        clearTimeout(timer);
        timer = setTimeout(function () {
          fired = true;
          MR.Game.undo();
        }, 500);
      }
      function stop () { clearTimeout(timer); }

      btn.addEventListener("pointerdown", start);
      btn.addEventListener("pointerup", stop);
      btn.addEventListener("pointerleave", stop);
      btn.addEventListener("pointercancel", stop);
      btn.addEventListener("click", function () {
        if (fired) { fired = false; return; }   // the hold already handled it
        MR.Game.repeat();
      });
    })();

    var sheet = U.$("sheet");
    U.$("menuBtn").addEventListener("click", function () {
      MR.Sound.unlock();
      sheet.hidden = false;
    });
    U.$("sheetClose").addEventListener("click", function () { sheet.hidden = true; });
    sheet.addEventListener("click", function (e) {
      if (e.target === sheet) sheet.hidden = true;
    });

    /* keep the fit honest through rotation and browser-chrome changes */
    global.addEventListener("resize", function () { scheduleLayout(140); });
    global.addEventListener("orientationchange", function () { scheduleLayout(320); });
    if (global.visualViewport) {
      global.visualViewport.addEventListener("resize", function () { scheduleLayout(140); });
    }

    /* mobile hygiene: no pinch-zoom, no double-tap zoom, no rubber-banding */
    document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
    document.addEventListener("dblclick", function (e) { e.preventDefault(); });
    document.addEventListener("touchmove", function (e) {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });

    /* first touch anywhere unlocks the audio context on iOS */
    document.addEventListener("pointerdown", function once () {
      MR.Sound.unlock();
      document.removeEventListener("pointerdown", once);
    });
  }

  function boot () {
    MR.Wheel.attach(U.$("wheelCv"), U.$("wheelStatic"));
    MR.FX.attach(U.$("fxCv"));
    MR.Game.init();
    MR.Icons.render();
    bindControls();

    U.afterLayout(function () {
      layout();
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})(window);
