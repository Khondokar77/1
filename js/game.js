/* ==========================================================================
   game.js — round flow

   ROUND TIMELINE
   --------------
     0ms      SPIN pressed  -> camera zooms in (600ms)
     220ms    ball launches (overlaps the camera move, so the two read as one
              continuous gesture rather than a wait-then-go)
     ~4-8s    ball settles  -> hub reports the number, result pushed to the
              history strip
     +1500ms  hold the zoomed view so the player can read the result
     +620ms   camera zooms out, then payouts resolve on the normal layout:
              winning zones highlight, coins shower from the winning chip, the
              avatar pops, the balance counts up
     +2100ms  table clears, betting re-opens
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var U = MR.U;

  MR.Game = {

    busy: false,
    results: [],

    init: function () {
      MR.Bets.init();
      MR.Board.build();
      MR.Board.buildChips();
      MR.Board.refreshHud(false);

      MR.Board.onBet = this.placeBet.bind(this);
      MR.Phys.onSeated = this.onBallSeated.bind(this);
    },

    /* --------------------------- BETTING ---------------------------- */
    placeBet: function (betId, cell) {
      if (this.busy) return;
      MR.Sound.unlock();

      var amt = MR.Board.chipValue();
      var err = MR.Bets.stake(betId, amt);

      if (err) {
        MR.Sound.deny();
        MR.FX.toast(err);
        return;
      }
      MR.Sound.chip();
      MR.Board.paintChip(cell, betId);
      MR.Board.showTip(cell, betId);
      MR.Board.refreshHud(false);
    },

    /** Re-place the previous round's chips. Bound to the circular-arrow key. */
    repeat: function () {
      if (this.busy) return;
      MR.Sound.unlock();

      var err = MR.Bets.repeat();
      if (err) {
        MR.Sound.deny();
        MR.FX.toast(err);
        return;
      }
      MR.Sound.chip();
      MR.Board.repaintAll();
      MR.Board.refreshHud(false);
      MR.FX.toast("Bet repeated · " + U.money(MR.Bets.total()));
    },

    /** Undo the last stake. Bound to a hold on the repeat key. */
    undo: function () {
      if (this.busy) return;
      var id = MR.Bets.undo();
      if (!id) {
        MR.Sound.deny();
        MR.FX.toast("Nothing to undo");
        return;
      }
      MR.Sound.chip();
      MR.Board.paintChip(MR.Board.cellOf(id), id);
      MR.Board.refreshHud(false);
      MR.FX.toast("Undo");
    },

    doubleBet: function () {
      if (this.busy) return;
      var err = MR.Bets.double();
      if (err) {
        MR.Sound.deny();
        MR.FX.toast(err);
        return;
      }
      MR.Sound.chip();
      MR.Board.repaintAll();
      MR.Board.refreshHud(false);
      MR.FX.toast("Doubled · " + U.money(MR.Bets.total()));
    },

    /* ---------------------------- SPIN ------------------------------ */
    spin: function () {
      if (this.busy || MR.Bets.total() <= 0) return;
      MR.Sound.unlock();

      // Freeze the layout now, while the chips are still on the table, so
      // Repeat can rebuild it after the round clears.
      MR.Bets.snapshot();

      this.busy = true;
      U.$("app").classList.add("busy");
      MR.Board.refreshHud(true);
      MR.Board.hideTip();

      // Hide the result disc so the turret cross is visible while spinning.
      U.$("hub").classList.remove("on", "pop");

      /* ---- RNG: the result is decided here, before a frame is drawn ---
         Replace this single line with the outcome returned by your server
         to make the game server-authoritative. Nothing else changes. */
      var order = MR.CFG.WHEEL_ORDER;
      var result = order[Math.floor(U.random() * order.length)];

      MR.Camera["in"]();
      setTimeout(function () { MR.Phys.launch(result); }, MR.CFG.TIME.launchDelay);
    },

    /* -------------------------- BALL LANDS -------------------------- */
    onBallSeated: function (result) {
      var self = this;
      var colour = MR.CFG.colourOf(result);

      /* The result disc fades in over the turret carrying the number. */
      var hub = U.$("hub");
      var num = U.$("hubNum");
      num.textContent = String(result);
      num.style.color = colour === "red" ? "#ff6b76"
                      : colour === "green" ? "#5ce49a"
                      : "#e9eef3";
      hub.classList.remove("pop");
      void hub.offsetWidth;
      hub.classList.add("on", "pop");

      this.results.unshift(result);
      this.results = this.results.slice(0, 9);
      MR.Board.pushHistory(this.results);

      /* hold the zoomed view, then pull the camera back for the payout */
      setTimeout(function () {
        MR.Camera.out();
        setTimeout(function () { self.resolve(result); }, MR.CFG.TIME.camOut);
      }, MR.CFG.TIME.holdResult);
    },

    /* --------------------------- PAYOUT ----------------------------- */
    resolve: function (result) {
      var self = this;
      var before = MR.Bets.balance;
      var out = MR.Bets.resolve(result);

      if (out.payout > 0) {
        var best = out.wins[0];

        out.wins.forEach(function (w) {
          var cell = MR.Board.cellOf(w.id);
          if (!cell) return;
          cell.classList.add("hot");
          var chip = cell.querySelector(".chip");
          if (chip) chip.classList.add("win");
          MR.FX.coinBurst(cell);
          if (w.ret > best.ret) best = w;
        });

        MR.FX.avatarPop(MR.Board.cellOf(best.id));
        MR.FX.callout(out.net > 0 ? "You win!" : "Zero pays", out.payout);
        (out.net > out.staked ? MR.Sound.bigWin : MR.Sound.win)();
        MR.Board.countUp(before, MR.Bets.balance);
      } else {
        MR.Sound.lose();
        MR.FX.toast(MR.CFG.colourOf(result).toUpperCase() + " " + result + " · no win");
      }

      setTimeout(function () { self.endRound(); }, MR.CFG.TIME.clearTable);
    },

    endRound: function () {
      MR.Bets.clear();
      MR.Board.clearChips();
      MR.Phys.reset();

      this.busy = false;
      U.$("app").classList.remove("busy");
      // The result disc stays up between rounds — that is the "game finished"
      // state in the reference. spin() clears it again.

      /* Demo convenience: top the wallet back up so the prototype never
         dead-ends. Delete this block for a production build. */
      if (MR.Bets.balance < MR.CFG.LIMITS.min) {
        MR.Bets.balance = MR.CFG.START_BALANCE;
        MR.FX.toast("Balance topped up");
      }
      MR.Board.refreshHud(false);
    }
  };

})(window);
