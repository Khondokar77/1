/* ==========================================================================
   config.js — every tunable value in one place
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var TAU = MR.U.TAU;

  /* ---------------------------------------------------------------------
     WHEEL
     Physical pocket order of a 13-slot Mini Roulette wheel, read CLOCKWISE
     from the green 0. Colours alternate perfectly around the ring, which is
     what makes this order valid rather than arbitrary.
     --------------------------------------------------------------------- */
  var WHEEL_ORDER = [0, 8, 7, 3, 11, 1, 6, 5, 4, 10, 9, 12, 2];

  var RED   = [1, 3, 5, 8, 10, 12];
  var BLACK = [2, 4, 6, 7, 9, 11];

  MR.CFG = {
    WHEEL_ORDER: WHEEL_ORDER,
    SLOTS: WHEEL_ORDER.length,
    SLOT_ARC: TAU / WHEEL_ORDER.length,
    RED: RED,
    BLACK: BLACK,

    START_BALANCE: 1000,
    LIMITS: { min: 0.25, max: 500 },

    /* Chip denominations shown in the bottom carousel. */
    CHIPS: [
      { v: 0.25, c1: "#57d3f6", c2: "#0a6f96" },
      { v: 0.5,  c1: "#f7ad3e", c2: "#8c4c05" },
      { v: 1,    c1: "#4ade80", c2: "#0a6b38" },
      { v: 5,    c1: "#f24d5d", c2: "#8b0f1a" },
      { v: 10,   c1: "#a78bfa", c2: "#4c1d95" },
      { v: 25,   c1: "#f6cf6e", c2: "#8c6110" }
    ],

    /* Wheel geometry as fractions of the wheel radius R.
       Every value measured off the reference artwork. */
    RAD: {
      woodOut  : 1.000,
      woodIn   : 0.897,   // narrow wooden band
      rimOut   : 0.897,
      rimIn    : 0.741,   // wide brushed-steel rim
      diamond  : 0.824,   // deflector centres
      track    : 0.800,   // radius the ball rides while on the rim
      pocketOut: 0.720,
      pocketIn : 0.325,   // the ROUNDED tip of each pocket, not a flat edge
      innerRing: 0.470,   // thin silver ring laid across the pockets
      rest     : 0.400,   // ball centre once seated in a pocket
      numText  : 0.584,
      hubDisc  : 0.337,   // centre metal disc carrying the turret cross
      ball     : 0.045
    },

    /* Angular half-width of a pocket wedge, as a fraction of half a slot.
       The remainder is the fret gap. */
    POCKET_FILL: 0.86,

    /* Physics tunables — see physics.js for the model they feed. */
    PHYS: {
      WHEEL_V0     : -3.4,   // rad/s, negative = counter-clockwise
      WHEEL_DRAG   : 0.115,  // 1/s viscous drag
      BALL_V0      : 9.6,    // rad/s, positive = clockwise
      BALL_DRAG    : 0.360,
      DROP_VEL     : 2.70,   // below this the ball leaves the track
      ALIGN_MIN    : 1.70,   // acceptable travel-to-target window (rad)
      ALIGN_MAX    : 3.90,
      ALIGN_TIMEOUT: 2.60,   // s, safety net so a spin can never stall
      RATTLE_SLOTS : 1.80,   // rattle amplitude in pockets
      RATTLE_HZ    : 2.70,   // ~2-3 audible fret hits
      SETTLE_MIN   : 1.35,   // s
      SETTLE_MAX   : 3.10
    },

    /* Round timings (ms). */
    TIME: {
      camIn      : 600,
      launchDelay: 220,
      holdResult : 1500,
      camOut     : 620,
      clearTable : 2100
    }
  };

  /* Colour lookup used everywhere. */
  var REDSET = {};
  RED.forEach(function (n) { REDSET[n] = 1; });
  MR.CFG.colourOf = function (n) {
    return n === 0 ? "green" : (REDSET[n] ? "red" : "black");
  };

  /* ---------------------------------------------------------------------
     BET CATALOGUE
     `pay` is quoted "to 1" — a winning bet returns stake * (pay + 1).
     `even` marks the even-money bets that get half the stake back when the
     green zero lands ("ZERO ALWAYS PAYS" / la partage).
     --------------------------------------------------------------------- */
  var BETS = {};
  for (var n = 0; n <= 12; n++) {
    BETS["n" + n] = { label: n === 0 ? "ZERO" : "STRAIGHT " + n, nums: [n], pay: 11 };
  }
  BETS.row1 = { label: "TOP ROW",  nums: [3, 6, 9, 12], pay: 2 };
  BETS.row2 = { label: "MID ROW",  nums: [2, 5, 8, 11], pay: 2 };
  BETS.row3 = { label: "LOW ROW",  nums: [1, 4, 7, 10], pay: 2 };
  BETS.lo   = { label: "1-6",   nums: [1, 2, 3, 4, 5, 6],    pay: 1, even: true };
  BETS.mid  = { label: "4-9",   nums: [4, 5, 6, 7, 8, 9],    pay: 1, even: true };
  BETS.hi   = { label: "7-12",  nums: [7, 8, 9, 10, 11, 12], pay: 1, even: true };
  BETS.even = { label: "EVEN",  nums: [2, 4, 6, 8, 10, 12],  pay: 1, even: true };
  BETS.odd  = { label: "ODD",   nums: [1, 3, 5, 7, 9, 11],   pay: 1, even: true };
  BETS.red  = { label: "RED",   nums: RED.slice(),           pay: 1, even: true };
  BETS.black= { label: "BLACK", nums: BLACK.slice(),         pay: 1, even: true };

  MR.CFG.BETS = BETS;

})(window);
