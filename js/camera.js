/* ==========================================================================
   camera.js — the "camera"

   There is no real camera: the whole move is two CSS transforms driven by a
   single class on #app, so the wheel push-in and the layout slide-out can
   never drift out of sync.

     ZOOM IN  (on SPIN)   #wheelStage scales up and translates so the wheel
                          lands on the exact centre of the viewport, while
                          #bottom (board + controls) slides down and fades out
                          over the same 0.6s ease.
     ZOOM OUT (on result) The class is removed; both moves reverse over the
                          same ease so the payout plays on the normal layout.

   NOTE ON UNITS
   -------------
   #app is itself CSS-scaled by --s (see layout.css). getBoundingClientRect
   returns REAL screen pixels, but --zoomY is applied inside that scaled box,
   so the measured offset must be divided by --s to convert it back into
   design pixels. --zoomS is a pure ratio and needs no conversion.
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var U = MR.U;

  MR.Camera = {

    /** @param {number} stageScale current value of --s */
    measure: function (stageScale) {
      var app = U.$("app");
      // Measure #wheelShadow: it is exactly the wheel, whereas #wheelBox
      // includes the transparent bitmap padding.
      var box = U.$("wheelShadow") || U.$("wheelBox");
      if (!app || !box) return;

      var s = stageScale || MR.stageScale || 1;

      // Measure in the un-zoomed state, then restore whatever we found.
      var wasFocused = app.classList.contains("focus");
      if (wasFocused) app.classList.remove("focus");

      var r = box.getBoundingClientRect();
      var wheelCentre = r.top + r.height / 2;
      var screenCentre = global.innerHeight / 2;

      // Convert the screen-pixel offset into design pixels.
      var dy = (screenCentre - wheelCentre) / s;

      // Largest push-in that still keeps the wheel inside the viewport.
      var byWidth = (global.innerWidth * 0.96) / Math.max(1, r.width);
      var byHeight = (global.innerHeight * 0.76) / Math.max(1, r.height);
      var zoom = U.clamp(Math.min(byWidth, byHeight), 1, 1.45);

      var root = document.documentElement.style;
      root.setProperty("--zoomY", dy.toFixed(1) + "px");
      root.setProperty("--zoomS", zoom.toFixed(3));

      if (wasFocused) {
        // Re-apply next frame so the browser does not collapse the
        // remove/add pair into "no change" and skip the transition.
        requestAnimationFrame(function () { app.classList.add("focus"); });
      }
    },

    "in": function () {
      this.measure(MR.stageScale);
      U.$("app").classList.add("focus");
    },

    out: function () {
      U.$("app").classList.remove("focus");
    },

    isIn: function () {
      return U.$("app").classList.contains("focus");
    }
  };

})(window);
