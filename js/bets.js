/* ==========================================================================
   bets.js — the wagering model

   Pure state + arithmetic. Nothing here touches the DOM, which keeps the
   payout maths auditable and makes it trivial to swap the local wallet for a
   server-authoritative one: replace `stake`, `refund` and `resolve` with
   calls to your backend and leave the rest of the game untouched.

   RTP
   ---
     straight (11:1 on 1 of 13)   -> 12 / 13   = 92.31%
     row      ( 2:1 on 4 of 13)   -> 12 / 13   = 92.31%
     even-money (1:1 on 6 of 13, half back on zero)
                                  -> 12.5 / 13 = 96.15%
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var U = MR.U;

  MR.Bets = {

    balance: 0,
    active: {},      // betId -> staked amount
    history: [],     // stack of {id, amt} for Undo
    lastRound: null, // snapshot of `active` taken at spin time, for Repeat

    init: function () {
      this.balance = MR.CFG.START_BALANCE;
      this.active = {};
      this.history = [];
      this.lastRound = null;
    },

    /** Freeze the current layout so Repeat can rebuild it next round. */
    snapshot: function () {
      var snap = {}, id, any = false;
      for (id in this.active) {
        if (this.active.hasOwnProperty(id)) { snap[id] = this.active[id]; any = true; }
      }
      this.lastRound = any ? snap : null;
    },

    hasLastRound: function () {
      return !!this.lastRound && Object.keys(this.lastRound).length > 0;
    },

    /**
     * Re-place the previous round's chips on top of whatever is on the table.
     * Validated in full BEFORE anything is staked, so it can never leave the
     * board half-rebuilt.
     */
    repeat: function () {
      if (!this.hasLastRound()) return "No previous bet to repeat";

      var lim = MR.CFG.LIMITS, id, total = 0;
      for (id in this.lastRound) {
        if (!this.lastRound.hasOwnProperty(id)) continue;
        total += this.lastRound[id];
        if ((this.active[id] || 0) + this.lastRound[id] > lim.max) {
          return "Table max is " + U.money(lim.max);
        }
      }
      if (total > this.balance) return "Not enough balance to repeat";

      for (id in this.lastRound) {
        if (this.lastRound.hasOwnProperty(id)) this.stake(id, this.lastRound[id]);
      }
      return null;
    },

    total: function () {
      var t = 0, k;
      for (k in this.active) if (this.active.hasOwnProperty(k)) t += this.active[k];
      return t;
    },

    count: function () {
      return Object.keys(this.active).length;
    },

    /** Try to stake `amt` on `id`. Returns a reason string on failure. */
    stake: function (id, amt) {
      var lim = MR.CFG.LIMITS;
      var cur = this.active[id] || 0;

      if (amt > this.balance) return "Not enough balance";
      if (cur + amt > lim.max) return "Table max is " + U.money(lim.max);

      this.balance -= amt;
      this.active[id] = cur + amt;
      this.history.push({ id: id, amt: amt });
      return null;
    },

    /** Pop the last stake off the stack. Returns the affected bet id. */
    undo: function () {
      if (!this.history.length) return null;
      var last = this.history.pop();
      this.active[last.id] -= last.amt;
      this.balance += last.amt;
      if (this.active[last.id] <= 0.0001) delete this.active[last.id];
      return last.id;
    },

    /** Double every open bet. Returns a reason string on failure. */
    double: function () {
      var t = this.total(), lim = MR.CFG.LIMITS, id;
      if (!t) return "No bets to double";
      if (t > this.balance) return "Not enough balance to double";

      for (id in this.active) {
        if (this.active.hasOwnProperty(id) && this.active[id] * 2 > lim.max) {
          return "Table max is " + U.money(lim.max);
        }
      }
      for (id in this.active) {
        if (this.active.hasOwnProperty(id)) {
          var add = this.active[id];
          this.active[id] += add;
          this.history.push({ id: id, amt: add });
        }
      }
      this.balance -= t;
      return null;
    },

    /** Wipe the table. `lastRound` deliberately survives, so Repeat works. */
    clear: function () {
      this.active = {};
      this.history = [];
    },

    /**
     * Settle every open bet against `result`.
     * Returns { payout, staked, net, wins:[{id, stake, ret, half}] }
     */
    resolve: function (result) {
      var BETS = MR.CFG.BETS;
      var payout = 0, wins = [], id, def, s, ret;

      for (id in this.active) {
        if (!this.active.hasOwnProperty(id)) continue;
        def = BETS[id];
        if (!def) continue;
        s = this.active[id];

        if (def.nums.indexOf(result) !== -1) {
          ret = s * (def.pay + 1);
          payout += ret;
          wins.push({ id: id, stake: s, ret: ret, half: false });

        } else if (result === 0 && def.even) {
          // "ZERO ALWAYS PAYS" — la partage: half the stake comes back on the
          // even-money bets when the green pocket lands.
          ret = s / 2;
          payout += ret;
          wins.push({ id: id, stake: s, ret: ret, half: true });
        }
      }

      var staked = this.total();
      this.balance += payout;

      return { payout: payout, staked: staked, net: payout - staked, wins: wins };
    }
  };

})(window);
