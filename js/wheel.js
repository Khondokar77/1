/* ==========================================================================
   wheel.js — canvas renderer

   TWO PHYSICAL LAYERS, NOT ONE
   ----------------------------
   A real roulette wheel is two separate objects:

     BOWL   the wooden surround, the brushed-steel rim, the deflector
            diamonds and the ball track.  This does NOT move.
     ROTOR  the pockets, frets, numerals and centre turret.  This spins.

   The first build rotated everything together, which was wrong twice over:
   physically (the diamonds orbited with the pockets) and visually (every
   off-centre highlight — the wood gradient origin, the rim sheen, the cone
   gradient — swung around the disc, so it read as wobbling rather than
   spinning).

   So there are two canvases stacked in the DOM:

     #wheelStatic   the bowl. Painted once at resize, never touched again.
     #wheelCv       the rotor plus the ball. Cleared and redrawn per frame.

   The rotor bitmap only has to cover radius 0.80R, so its blit is 64% the
   area of a full-size one — the per-frame cost went DOWN even though the
   scene is now more correct.

   NO BAKED SHADOW
   ---------------
   The drop shadow is a static DOM element (#wheelShadow). A directional
   shadow baked into a rotating bitmap orbits with it, which is exactly what
   made the spinning disc look lopsided.

   BLUR
   ----
   Only the rotor blurs, and its blurred copy is baked once at resize. The
   base layer is always drawn at globalAlpha = 1, so the wheel is fully
   opaque at every speed: compositing N copies at alpha 1/N over a
   transparent canvas only reaches 1-(1-1/N)^N, which is why an earlier
   build looked washed out while it span.
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var U = MR.U, TAU = U.TAU;

  var cv = null, ctx = null;          // dynamic layer: rotor + ball
  var sv = null, sctx = null;         // static layer: bowl

  var rotorSharp = null, rotorBlur = null;

  var SIZE = 0;      // full bitmap edge, device px
  var CX = 0;        // full bitmap centre
  var R = 0;         // WHEEL radius, device px
  var RSIZE = 0;     // rotor bitmap edge
  var RCX = 0;       // rotor bitmap centre

  /* A little transparent margin so the outer edge is never clipped flat at
     the bitmap boundary — flat chords at the edge are what stop a rotating
     disc from reading as circular. Small now that no shadow is baked in. */
  var PAD = 1.05;

  /* The rotor only needs to reach just past pocketOut (0.720R). */
  var ROTOR_REACH = 0.78;

  var BLUR_STEPS = 9;
  var BLUR_SPREAD = 0.17;      // radians of smear in the baked rotor blur

  function ringFill (c, r0, r1, fill) {
    c.beginPath();
    c.arc(0, 0, r1, 0, TAU);
    c.arc(0, 0, r0, 0, TAU, true);
    c.fillStyle = fill;
    c.fill("evenodd");
  }

  function ringStroke (c, r, colour, w) {
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.strokeStyle = colour;
    c.lineWidth = w;
    c.stroke();
  }

  /* ======================================================================
     STATIC LAYER — bowl, rim, deflectors, ball track
     ====================================================================== */
  function paintBowl (c) {
    var RAD = MR.CFG.RAD;

    c.clearRect(0, 0, SIZE, SIZE);
    c.save();
    c.translate(CX, CX);

    /* Dark base under the rotor, so the 0.730 -> 0.745 gap between the
       pocket ring and the rim reads as a recess rather than a hole. */
    c.beginPath();
    c.arc(0, 0, R * RAD.rimIn, 0, TAU);
    c.fillStyle = "#05080a";
    c.fill();

    /* ---- wooden bowl -------------------------------------------------- */
    var wood = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.2, 0, 0, R);
    wood.addColorStop(0, "#a2582a");
    wood.addColorStop(0.55, "#7a3d1b");
    wood.addColorStop(1, "#3a180a");
    ringFill(c, R * RAD.woodIn, R * RAD.woodOut, wood);
    ringStroke(c, R * RAD.woodOut * 0.995, "rgba(0,0,0,.5)", R * 0.012);

    /* ---- brushed steel rim -------------------------------------------- */
    var rw = R * (RAD.rimOut - RAD.rimIn);
    var rm = R * (RAD.rimOut + RAD.rimIn) / 2;
    c.lineWidth = rw;
    for (var a = 0; a < TAU; a += 0.035) {
      var sheen = 0.5 + 0.5 * Math.cos(2 * (a - 0.7));
      var l = Math.round(U.lerp(104, 238, sheen));
      c.strokeStyle = "rgb(" + l + "," + (l + 4) + "," + (l + 10) + ")";
      c.beginPath();
      c.arc(0, 0, rm, a, a + 0.042);
      c.stroke();
    }
    ringStroke(c, R * RAD.rimOut, "rgba(255,255,255,.45)", R * 0.007);
    ringStroke(c, R * RAD.rimIn, "rgba(0,0,0,.4)", R * 0.009);

    /* ball-track groove */
    c.lineWidth = R * 0.06;
    c.strokeStyle = "rgba(0,0,0,.18)";
    c.beginPath();
    c.arc(0, 0, R * RAD.track, 0, TAU);
    c.stroke();

    /* ---- deflector diamonds (fixed to the bowl, they never rotate) ----- */
    for (var d = 0; d < 8; d++) {
      c.save();
      c.rotate(d * TAU / 8 + TAU / 16);
      c.translate(0, -R * RAD.diamond);
      c.rotate(Math.PI / 4);
      var s = R * 0.026;
      var dg = c.createLinearGradient(-s, -s, s, s);
      dg.addColorStop(0, "#ffffff");
      dg.addColorStop(0.5, "#a3adb5");
      dg.addColorStop(1, "#616c74");
      c.fillStyle = dg;
      c.fillRect(-s, -s, s * 2, s * 2);
      c.strokeStyle = "rgba(0,0,0,.35)";
      c.lineWidth = R * 0.005;
      c.strokeRect(-s, -s, s * 2, s * 2);
      c.restore();
    }

    c.restore();
  }

  /* ======================================================================
     ROTOR LAYER — pockets, frets, numerals, turret
     ====================================================================== */
  function paintRotor (c) {
    var CFG = MR.CFG, RAD = CFG.RAD, ORDER = CFG.WHEEL_ORDER, ARC = CFG.SLOT_ARC;

    c.clearRect(0, 0, RSIZE, RSIZE);
    c.save();
    c.translate(RCX, RCX);

    /* ---- pocket geometry ------------------------------------------------
       A pocket is NOT a flat annular wedge. In the reference each one is a
       tapered finger with a ROUNDED tip pointing at the hub. Construction:

         outer arc at pocketOut, spanning +-h
         two straight sides converging inward
         a semicircular cap of radius capR centred on the flat inner edge,
         bulging inward so the extremity lands exactly on pocketIn

       Given the wedge half-angle h, the chord half-width at radius rf is
       rf*sin(h), so setting capR = rf*sin(h) and requiring
       rf - capR = pocketIn gives  rf = pocketIn / (1 - sin h). */
    var h    = (ARC / 2) * CFG.POCKET_FILL;
    var pOut = R * RAD.pocketOut;
    var tip  = R * RAD.pocketIn;
    var rf   = tip / (1 - Math.sin(h));      // flat inner edge
    var capR = rf * Math.sin(h);             // rounded tip radius

    /* dark recess behind the pockets */
    ringFill(c, tip * 0.9, pOut, "#05080a");

    ORDER.forEach(function (num, i) {
      var col = CFG.colourOf(num);
      var hi, lo;
      if (col === "green")    { hi = "#2cc57e"; lo = "#04713f"; }
      else if (col === "red") { hi = "#e5313d"; lo = "#8d1019"; }
      else                    { hi = "#343b43"; lo = "#070a0d"; }

      c.save();
      c.rotate(i * ARC);                     // slot centreline now points up

      var g = c.createLinearGradient(0, -pOut, 0, -tip);
      g.addColorStop(0, lo);
      g.addColorStop(0.42, hi);
      g.addColorStop(1, lo);

      c.beginPath();
      c.arc(0, 0, pOut, -Math.PI / 2 - h, -Math.PI / 2 + h);   // outer arc
      c.arc(0, -rf, capR, 0, Math.PI);                         // rounded tip
      c.closePath();
      c.fillStyle = g;
      c.fill();

      /* inner shading so each finger reads as a recess */
      c.strokeStyle = "rgba(0,0,0,.45)";
      c.lineWidth = R * 0.008;
      c.stroke();

      c.restore();
    });

    /* ---- frets: metal dividers, outer edge down to the flat inner edge -- */
    for (var f = 0; f < CFG.SLOTS; f++) {
      c.save();
      c.rotate(f * ARC + ARC / 2);
      var w = R * 0.013;
      var fg = c.createLinearGradient(-w, 0, w, 0);
      fg.addColorStop(0, "#5c656c");
      fg.addColorStop(0.4, "#eef3f6");
      fg.addColorStop(1, "#79848c");
      c.fillStyle = fg;
      c.beginPath();
      c.moveTo(-w, -pOut);
      c.lineTo(w, -pOut);
      c.lineTo(w * 0.45, -rf);
      c.lineTo(-w * 0.45, -rf);
      c.closePath();
      c.fill();
      c.restore();
    }

    /* ---- rings -------------------------------------------------------- */
    ringStroke(c, pOut, "rgba(226,235,241,.92)", R * 0.016);
    ringStroke(c, R * RAD.innerRing, "rgba(214,224,232,.85)", R * 0.010);

    /* ---- numerals ----------------------------------------------------- */
    c.textAlign = "center";
    c.textBaseline = "middle";
    var fam = global.getComputedStyle(document.body).getPropertyValue("--font-board") || "Georgia, serif";
    c.font = "700 " + Math.round(R * 0.155) + "px " + fam;
    ORDER.forEach(function (num, i) {
      c.save();
      c.rotate(i * ARC);
      c.fillStyle = "rgba(0,0,0,.55)";
      c.fillText(String(num), R * 0.008, -R * RAD.numText + R * 0.010);
      c.fillStyle = "#fdf8ec";
      c.fillText(String(num), 0, -R * RAD.numText);
      c.restore();
    });

    paintTurret(c);

    c.restore();
  }

  /**
   * The centre turret: a metal disc carrying a four-armed cross with knobbed
   * ends and a ring at its hub. This is what the player sees before the first
   * spin and while the wheel is turning; once a result lands, the DOM hub
   * (#hub) fades in over it carrying the winning number.
   */
  function paintTurret (c) {
    var RAD = MR.CFG.RAD;
    var hd = R * RAD.hubDisc;

    /* metal disc */
    var disc = c.createRadialGradient(-hd * 0.35, -hd * 0.4, hd * 0.05, 0, 0, hd);
    disc.addColorStop(0, "#f2f5f8");
    disc.addColorStop(0.45, "#b9c3cb");
    disc.addColorStop(0.82, "#8b959d");
    disc.addColorStop(1, "#5d676f");
    c.beginPath();
    c.arc(0, 0, hd, 0, TAU);
    c.fillStyle = disc;
    c.fill();
    ringStroke(c, hd * 0.995, "rgba(255,255,255,.5)", R * 0.007);

    /* a soft dish shadow so the disc reads as concave */
    var dish = c.createRadialGradient(0, 0, hd * 0.15, 0, 0, hd);
    dish.addColorStop(0, "rgba(0,0,0,.18)");
    dish.addColorStop(0.7, "rgba(0,0,0,0)");
    c.beginPath();
    c.arc(0, 0, hd, 0, TAU);
    c.fillStyle = dish;
    c.fill();

    /* four arms with knobbed ends */
    var armLen = hd * 0.82;
    var armW = R * 0.020;
    for (var i = 0; i < 4; i++) {
      c.save();
      c.rotate(i * Math.PI / 2);

      var ag = c.createLinearGradient(-armW, 0, armW, 0);
      ag.addColorStop(0, "#7e8890");
      ag.addColorStop(0.35, "#f4f7fa");
      ag.addColorStop(1, "#8e989f");
      c.fillStyle = ag;
      c.beginPath();
      c.moveTo(-armW, 0);
      c.lineTo(armW, 0);
      c.lineTo(armW * 0.72, -armLen);
      c.lineTo(-armW * 0.72, -armLen);
      c.closePath();
      c.fill();

      /* knob */
      var kr = R * 0.026;
      var kg = c.createRadialGradient(-kr * 0.35, -armLen - kr * 0.35, kr * 0.1, 0, -armLen, kr);
      kg.addColorStop(0, "#ffffff");
      kg.addColorStop(0.5, "#c6d0d7");
      kg.addColorStop(1, "#707b83");
      c.beginPath();
      c.arc(0, -armLen, kr, 0, TAU);
      c.fillStyle = kg;
      c.fill();
      c.strokeStyle = "rgba(0,0,0,.3)";
      c.lineWidth = R * 0.004;
      c.stroke();

      c.restore();
    }

    /* centre ring */
    var ro = R * 0.072, ri = R * 0.040;
    var rg = c.createRadialGradient(-ro * 0.4, -ro * 0.4, ro * 0.1, 0, 0, ro);
    rg.addColorStop(0, "#ffffff");
    rg.addColorStop(0.5, "#c2ccd3");
    rg.addColorStop(1, "#6e7981");
    c.beginPath();
    c.arc(0, 0, ro, 0, TAU);
    c.fillStyle = rg;
    c.fill();

    c.beginPath();
    c.arc(0, 0, ri, 0, TAU);
    c.fillStyle = "#4a545c";
    c.fill();
    ringStroke(c, ri, "rgba(0,0,0,.45)", R * 0.005);
  }

  /**
   * Bake the blurred rotor ONCE.
   * Alphas run 1, 1/2, 1/3 ... 1/k: that sequence is the running average of
   * the rotated copies, so the result is the true mean AND stays fully
   * opaque at every step. A flat 1/k would not.
   */
  function bakeBlur (c) {
    c.clearRect(0, 0, RSIZE, RSIZE);
    for (var i = 0; i < BLUR_STEPS; i++) {
      var off = (i / (BLUR_STEPS - 1) - 0.5) * BLUR_SPREAD;
      c.save();
      c.globalAlpha = 1 / (i + 1);
      c.translate(RCX, RCX);
      c.rotate(off);
      c.drawImage(rotorSharp, -RCX, -RCX);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  MR.Wheel = {

    /** @param {HTMLCanvasElement} dynamicCv  @param {HTMLCanvasElement} staticCv */
    attach: function (dynamicCv, staticCv) {
      cv = dynamicCv;
      ctx = cv.getContext("2d");
      sv = staticCv;
      sctx = sv.getContext("2d");
    },

    /**
     * Re-bake every layer.
     * @param {number} designSize  WHEEL diameter in DESIGN pixels
     * @param {number} pixelRatio  stage scale x devicePixelRatio, so the
     *                             backing store matches real device pixels
     *                             even though #app is CSS-scaled
     *
     * The CSS box is designSize * PAD; the extra is transparent margin, so
     * the visible wheel is still exactly `designSize` across.
     */
    resize: function (designSize, pixelRatio) {
      var box = designSize * PAD;

      SIZE = Math.max(2, Math.min(1340, Math.round(box * pixelRatio)));
      CX = SIZE / 2;
      R = SIZE / (2 * PAD);

      [cv, sv].forEach(function (canvas) {
        canvas.style.width = box + "px";
        canvas.style.height = box + "px";
        canvas.width = SIZE;
        canvas.height = SIZE;
      });

      /* static bowl: painted once, then left alone for the rest of the run */
      paintBowl(sctx);

      /* rotor: its own, smaller bitmap */
      RSIZE = Math.max(2, Math.round(2 * R * ROTOR_REACH));
      RCX = RSIZE / 2;

      rotorSharp = document.createElement("canvas");
      rotorSharp.width = RSIZE; rotorSharp.height = RSIZE;
      paintRotor(rotorSharp.getContext("2d"));

      rotorBlur = document.createElement("canvas");
      rotorBlur.width = RSIZE; rotorBlur.height = RSIZE;
      bakeBlur(rotorBlur.getContext("2d"));
    },

    get radius () { return R; },

    /**
     * Per frame: clear, then blit the rotor (1 blit, or 2 while blurring in).
     * The bowl is a separate canvas underneath and is never redrawn.
     */
    draw: function (angle, vel) {
      if (!ctx || !rotorSharp) return;
      ctx.clearRect(0, 0, SIZE, SIZE);

      var smear = U.clamp((Math.abs(vel) - 1) / 6, 0, 1);

      ctx.save();
      ctx.translate(CX, CX);
      ctx.rotate(angle);

      if (smear <= 0.02) {
        ctx.drawImage(rotorSharp, -RCX, -RCX);
      } else {
        ctx.drawImage(rotorBlur, -RCX, -RCX);       // opaque base
        if (smear < 1) {
          ctx.globalAlpha = 1 - smear;              // fade the sharp copy in
          ctx.drawImage(rotorSharp, -RCX, -RCX);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    },

    /**
     * The ball is live-drawn every frame, on the same dynamic canvas but
     * OUTSIDE the rotation — it has its own angle.
     *
     * VISIBILITY
     * The ball rides on a brushed-steel rim, so a plain white sphere is
     * near-invisible against it: same value, same hue. Three things fix it:
     *   1. a hard dark contact ring, which separates it from any background
     *   2. an ivory body with a hot specular, so it reads warmer and
     *      brighter than the cool grey steel
     *   3. a short motion trail while travelling fast, which is what
     *      actually lets the eye track it at speed
     *
     * @param {number} ang      ball angle
     * @param {number} radNorm  radius as a fraction of the wheel radius
     * @param {number} relVel   speed relative to the wheel, for the trail
     */
    drawBall: function (ang, radNorm, relVel) {
      if (!ctx) return;

      var rad = radNorm * R;
      var br = R * MR.CFG.RAD.ball;
      var speed = Math.abs(relVel || 0);

      /* ---- motion trail: four ghosts back along the ball's own arc ----- */
      if (speed > 2.5) {
        var strength = U.clamp((speed - 2.5) / 6, 0, 1);
        var dir = relVel < 0 ? -1 : 1;
        for (var t = 1; t <= 4; t++) {
          var back = ang - dir * t * 0.055 * strength;
          var tx = CX + Math.sin(back) * rad;
          var ty = CX - Math.cos(back) * rad;
          ctx.beginPath();
          ctx.arc(tx, ty, br * (1 - t * 0.12), 0, TAU);
          ctx.fillStyle = "rgba(255,252,240," + (0.34 * strength * (1 - t / 5)).toFixed(3) + ")";
          ctx.fill();
        }
      }

      var x = CX + Math.sin(ang) * rad;
      var y = CX - Math.cos(ang) * rad;

      ctx.save();

      /* contact shadow */
      ctx.beginPath();
      ctx.ellipse(x + br * 0.3, y + br * 0.45, br * 1.15, br * 0.9, 0, 0, TAU);
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fill();

      /* body */
      var g = ctx.createRadialGradient(x - br * 0.38, y - br * 0.42, br * 0.08, x, y, br);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, "#fffaf0");
      g.addColorStop(0.78, "#ece2cf");
      g.addColorStop(1, "#b9ab93");
      ctx.beginPath();
      ctx.arc(x, y, br, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();

      /* dark rim: the single thing that makes it pop off the steel */
      ctx.lineWidth = Math.max(1, br * 0.16);
      ctx.strokeStyle = "rgba(24,20,14,.62)";
      ctx.stroke();

      /* specular */
      ctx.beginPath();
      ctx.arc(x - br * 0.34, y - br * 0.36, br * 0.3, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.fill();

      ctx.restore();
    }
  };

})(window);
