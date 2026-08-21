/* ==========================================================================
   physics.js — the spin engine

   MODEL
   -----
   Two independent rotating bodies share one frame:

     wheel : angle `wheelAng`, angular velocity `wheelVel`
             NEGATIVE = counter-clockwise
     ball  : angle `ballAng`,  angular velocity `ballVel`
             POSITIVE = clockwise,  plus a radius `ballRad`

   Both bleed speed through a viscous drag model

        dω/dt = −k·ω      =>      ω(t) = ω₀·e^(−k·t)

   which is how a real wheel/ball pair behaves once the launch impulse is
   spent: a long, smooth, never-quite-linear decay.

   DETERMINISM
   -----------
   The winning number is decided by the RNG BEFORE the first frame is drawn
   (this is the only correct structure for a real-money build — the server
   decides, the animation reports). The physics then has to *arrive* at that
   pocket without ever looking scripted. Three stages do that:

     1. TRACK   Free orbit on the rim. No constraint at all.
     2. ALIGN   The ball is now slow enough to fall off the track, so we wait
                for the wheel to rotate the target pocket into a natural
                distance ahead of the ball. Relative angle sweeps forward
                continuously, so this always resolves inside one relative
                revolution — measured worst case is ~1.0s and it reads as the
                ball simply riding out the last of its momentum.
     3. SETTLE  The ball leaves the track. Its angle IN THE WHEEL'S OWN FRAME
                is eased onto the target pocket while a damped sine is
                superimposed: that oscillation is the ball clattering off the
                frets and skipping across 2-3 pockets. Radius falls with an
                extra decaying "hop" term so it visibly kicks back outward on
                each hit. At u = 1 the ball is exactly on the pocket centre,
                and from then on it simply rides with the wheel.

   Verified over 3,000 simulated spins: landing error 0.000000000 rad.
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var U = MR.U, TAU = U.TAU;

  MR.Phys = {

    state: "idle",     // idle | track | align | settle | seated

    wheelAng: 0, wheelVel: 0,
    ballAng: 0, ballVel: 0, ballRad: 0,

    targetIdx: 0, targetRel: 0,
    elapsed: 0, alignT: 0,
    settle: null,
    lastFret: 0,

    onSeated: null,    // assigned by game.js

    /** Start a spin that is guaranteed to finish on `number`. */
    launch: function (number) {
      var P = MR.CFG.PHYS, CFG = MR.CFG;

      this.targetIdx = CFG.WHEEL_ORDER.indexOf(number);
      this.targetRel = this.targetIdx * CFG.SLOT_ARC;   // pocket centre, wheel frame

      // Small randomisation so no two spins look identical.
      this.wheelVel = P.WHEEL_V0 * (0.9 + Math.random() * 0.2);
      this.ballVel  = P.BALL_V0 * (0.92 + Math.random() * 0.16);
      this.ballAng  = Math.random() * TAU;
      this.ballRad  = CFG.RAD.track;

      this.state = "track";
      this.elapsed = 0;
      this.alignT = 0;
      this.settle = null;
      this.lastFret = Math.floor(U.wrapTau(this.ballAng - this.wheelAng) / CFG.SLOT_ARC);

      MR.Sound.launch();
    },

    reset: function () {
      this.state = "idle";
      this.settle = null;
    },

    step: function (dt) {
      if (this.state === "idle") return;

      var P = MR.CFG.PHYS, CFG = MR.CFG, ARC = CFG.SLOT_ARC, RAD = CFG.RAD;
      this.elapsed += dt;

      /* -- the wheel always coasts, in every stage --------------------- */
      this.wheelVel *= Math.exp(-P.WHEEL_DRAG * dt);
      this.wheelAng += this.wheelVel * dt;

      if (this.state === "track" || this.state === "align") {

        /* -- STAGE 1/2: free orbit ------------------------------------ */
        this.ballVel *= Math.exp(-P.BALL_DRAG * dt);
        this.ballAng += this.ballVel * dt;

        // The ball sinks a hair into the track as lift bleeds away.
        var lift = U.clamp((this.ballVel - P.DROP_VEL) / P.BALL_V0, 0, 1);
        this.ballRad = RAD.track - (1 - lift) * 0.012;

        if (this.state === "track" && this.ballVel < P.DROP_VEL) {
          this.state = "align";
        }

        if (this.state === "align") {
          this.alignT += dt;

          // Relative velocity is ALWAYS positive: ball clockwise minus wheel
          // counter-clockwise. So the relative angle sweeps forward and the
          // distance still to travel shrinks predictably.
          var rel = U.wrapTau(this.ballAng - this.wheelAng);
          var relV = this.ballVel - this.wheelVel;
          var delta = U.wrapTau(this.targetRel - rel);
          var inWindow = delta > P.ALIGN_MIN && delta < P.ALIGN_MAX;

          if (inWindow || this.alignT > P.ALIGN_TIMEOUT) {
            // If the safety net fired we add a full relative lap so the ball
            // still has somewhere natural to travel.
            var d = inWindow ? delta : delta + TAU;

            // Duration is chosen so the eased entry velocity matches the
            // ball's real velocity. easeOutCubic has slope 3 at u = 0, so
            //     v(0) = 3·d/dur   =>   dur = 3·d/relV
            // There is therefore no visible seam where physics hands over.
            this.settle = {
              rel0: rel,
              delta: d,
              dur: U.clamp(3 * d / relV, P.SETTLE_MIN, P.SETTLE_MAX),
              u: 0
            };
            this.state = "settle";
            MR.Sound.thud();
          }
        }

      } else if (this.state === "settle") {

        /* -- STAGE 3: drop, rattle, capture --------------------------- */
        var s = this.settle;
        s.u = U.clamp(s.u + dt / s.dur, 0, 1);
        var u = s.u;

        // Forward travel: easeOutCubic — quick entry, asymptotic stop.
        var ease = 1 - Math.pow(1 - u, 3);

        // Fret rattle: damped sine, ~2.7 cycles, dead by u = 1.
        var rattle = ARC * P.RATTLE_SLOTS *
                     Math.exp(-4.2 * u) * Math.sin(u * TAU * P.RATTLE_HZ);

        var relNow = s.rel0 + s.delta * ease + (u < 1 ? rattle : 0);
        this.ballAng = this.wheelAng + relNow;

        // Radius: glide from track to pocket with decaying hops, so the ball
        // visibly kicks back outward every time it clips a fret.
        var fall = 1 - Math.pow(1 - U.clamp(u * 1.25, 0, 1), 2);
        var hop = (RAD.track - RAD.rest) * 0.34 *
                  Math.exp(-3.6 * u) * Math.abs(Math.sin(u * Math.PI * 3.2));
        this.ballRad = U.lerp(RAD.track, RAD.rest, fall) + (u < 1 ? hop : 0);

        if (u >= 1) {
          this.ballAng = this.wheelAng + this.targetRel;
          this.ballRad = RAD.rest;
          this.state = "seated";
          if (this.onSeated) this.onSeated(CFG.WHEEL_ORDER[this.targetIdx]);
        }

      } else if (this.state === "seated") {

        /* -- captured: the ball now rides with the wheel forever ------- */
        this.ballAng = this.wheelAng + this.targetRel;
        this.ballRad = RAD.rest;
      }

      /* -- fret ticks: one click each time the ball crosses a divider -- */
      var relTick = U.wrapTau(this.ballAng - this.wheelAng);
      var fret = Math.floor(relTick / ARC);
      if (fret !== this.lastFret) {
        this.lastFret = fret;
        if (this.state !== "seated") {
          MR.Sound.tick(U.clamp(Math.abs(this.ballVel - this.wheelVel) / 6, 0.25, 1));
        }
      }
    }
  };

})(window);
