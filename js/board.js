/* ==========================================================================
   board.js — betting layout, chip carousel, chip stacks, tooltip, HUD

   Grid model (14 tracks, mirrors the reference table exactly):
     track 1       "0", spanning rows 1-3
     tracks 2-13   twelve 1fr units
                     numbers            span 3  (4 per row)
                     1-6 / 4-9 / 7-12   span 4  (3 across)
                     EVEN ◆ ◆ ODD       span 3  (4 across)
     track 14      the three "2to1" row bets
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;
  var U = MR.U;

  var ROWS = [
    { id: "row1", nums: [3, 6, 9, 12] },
    { id: "row2", nums: [2, 5, 8, 11] },
    { id: "row3", nums: [1, 4, 7, 10] }
  ];

  var tipTimer = null;
  var selectedChip = 1;

  function makeCell (betId, text, cls) {
    var d = document.createElement("div");
    d.className = cls;
    d.dataset.bet = betId;
    d.setAttribute("role", "button");
    d.setAttribute("tabindex", "0");
    if (text) d.textContent = text;
    return d;
  }

  MR.Board = {

    onBet: null,      // assigned by game.js

    build: function () {
      var board = U.$("board");
      var CFG = MR.CFG;
      board.innerHTML = "";

      /* ---- 0 ---------------------------------------------------------- */
      board.appendChild(makeCell("n0", "0", "cell zero"));

      /* ---- numbers + 2to1 --------------------------------------------- */
      ROWS.forEach(function (row, r) {
        row.nums.forEach(function (n, i) {
          var c = makeCell("n" + n, String(n), "cell num " + CFG.colourOf(n));
          c.style.gridRow = String(r + 1);
          c.style.gridColumn = (2 + i * 3) + " / span 3";
          board.appendChild(c);
        });
        var side = makeCell(row.id, "2to1", "cell side");
        side.style.gridRow = String(r + 1);
        board.appendChild(side);
      });

      /* ---- 1-6 / 4-9 / 7-12 ------------------------------------------- */
      ["lo", "mid", "hi"].forEach(function (id, i) {
        var c = makeCell(id, CFG.BETS[id].label, "cell dozen");
        c.style.gridColumn = (2 + i * 4) + " / span 4";
        board.appendChild(c);
      });

      /* ---- EVEN / RED / BLACK / ODD ----------------------------------- */
      var outer = [
        { id: "even", text: "EVEN", dia: null },
        { id: "red", text: "", dia: "r" },
        { id: "black", text: "", dia: "b" },
        { id: "odd", text: "ODD", dia: null }
      ];
      outer.forEach(function (o, i) {
        var c = makeCell(o.id, o.text, "cell even");
        c.style.gridColumn = (2 + i * 3) + " / span 3";
        if (o.dia) {
          var s = document.createElement("span");
          s.className = "dia " + o.dia;
          c.appendChild(s);
        }
        board.appendChild(c);
      });

      /* ---- one delegated listener for the whole table ----------------- */
      board.addEventListener("pointerdown", function (e) {
        var cell = e.target.closest(".cell");
        if (!cell) return;
        e.preventDefault();
        if (MR.Board.onBet) MR.Board.onBet(cell.dataset.bet, cell);
      });
      board.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var cell = e.target.closest(".cell");
        if (!cell) return;
        e.preventDefault();
        if (MR.Board.onBet) MR.Board.onBet(cell.dataset.bet, cell);
      });
    },

    /* ------------------------- CHIP CAROUSEL ------------------------- */
    buildChips: function () {
      var rail = U.$("chipRail");
      rail.innerHTML = "";

      MR.CFG.CHIPS.forEach(function (chip, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chipBtn" + (i === selectedChip ? " sel" : "");
        b.style.background = "radial-gradient(circle at 34% 28%, " + chip.c1 + ", " + chip.c2 + ")";
        b.setAttribute("aria-label", "Chip " + U.money(chip.v));
        b.innerHTML = '<span class="ring"></span><span class="v">' + U.chipFace(chip.v) + "</span>";
        b.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          selectedChip = i;
          MR.Sound.chip();
          var kids = rail.children;
          for (var k = 0; k < kids.length; k++) kids[k].classList.toggle("sel", k === i);
          b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
        });
        rail.appendChild(b);
      });

      /* carousel arrows */
      var step = 120;
      U.$("railPrev").addEventListener("click", function () { rail.scrollLeft -= step; });
      U.$("railNext").addEventListener("click", function () { rail.scrollLeft += step; });
      rail.addEventListener("scroll", MR.Board.syncArrows);
      MR.Board.syncArrows();
    },

    syncArrows: function () {
      var rail = U.$("chipRail");
      var max = rail.scrollWidth - rail.clientWidth - 1;
      U.$("railPrev").disabled = rail.scrollLeft <= 0;
      U.$("railNext").disabled = rail.scrollLeft >= max;
    },

    chipValue: function () {
      return MR.CFG.CHIPS[selectedChip].v;
    },

    /* --------------------------- CHIP STACKS ------------------------- */
    paintChip: function (node, betId) {
      var val = MR.Bets.active[betId];
      var chip = node.querySelector(".chip");

      if (!val) {
        if (chip) chip.remove();
        return;
      }
      if (!chip) {
        chip = document.createElement("span");
        chip.className = "chip";
        chip.innerHTML = '<span class="ring"></span><span class="v"></span>';
        node.appendChild(chip);
      } else {
        chip.style.animation = "none";
        void chip.offsetWidth;
        chip.style.animation = "";
      }

      // Colour the stack by the largest denomination it can be built from.
      var chips = MR.CFG.CHIPS, def = chips[0];
      for (var i = chips.length - 1; i >= 0; i--) {
        if (val >= chips[i].v) { def = chips[i]; break; }
      }
      chip.style.background = "radial-gradient(circle at 34% 28%, " + def.c1 + ", " + def.c2 + ")";
      chip.querySelector(".v").textContent = U.chipFace(val);
    },

    repaintAll: function () {
      var cells = document.querySelectorAll("#board .cell");
      for (var i = 0; i < cells.length; i++) {
        MR.Board.paintChip(cells[i], cells[i].dataset.bet);
      }
    },

    clearChips: function () {
      var chips = document.querySelectorAll("#board .chip");
      for (var i = 0; i < chips.length; i++) chips[i].remove();
      var hot = document.querySelectorAll("#board .cell.hot");
      for (var j = 0; j < hot.length; j++) hot[j].classList.remove("hot");
    },

    cellOf: function (betId) {
      return document.querySelector('#board .cell[data-bet="' + betId + '"]');
    },

    /* ---------------------------- TOOLTIP ---------------------------- */
    /* Glassmorphism confirmation, on screen for 1.5s. */
    showTip: function (node, betId) {
      var t = U.$("tip");
      var def = MR.CFG.BETS[betId];
      var r = node.getBoundingClientRect();

      t.textContent = "BET " + U.money(MR.Bets.active[betId]) +
                      " · " + def.label +
                      " · PAYS " + def.pay + ":1";
      t.style.left = U.clamp(r.left + r.width / 2, 96, global.innerWidth - 96) + "px";
      t.style.top = r.top + "px";
      t.classList.add("on");

      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () { t.classList.remove("on"); }, 1500);
    },

    hideTip: function () {
      clearTimeout(tipTimer);
      U.$("tip").classList.remove("on");
    },

    /* ------------------------------ HUD ------------------------------ */
    refreshHud: function (busy) {
      var bets = MR.Bets;
      U.$("balTxt").textContent = U.money(bets.balance);
      U.$("betTxt").textContent = U.money(bets.total());

      var canSpin = !busy && bets.total() > 0;
      var spin = U.$("spinBtn");
      spin.disabled = !canSpin;
      spin.classList.toggle("ready", canSpin);
      // Repeat is available whenever a previous round exists, even with an
      // empty table — that is the whole point of it.
      U.$("repeatBtn").disabled = busy || !bets.hasLastRound();
      U.$("dblBtn").disabled = busy || bets.total() <= 0;
    },

    /** Animated balance count-up after a win. */
    countUp: function (from, to) {
      var el = U.$("balTxt");
      var t0 = performance.now(), dur = 900;
      (function tick (now) {
        var u = U.clamp((now - t0) / dur, 0, 1);
        el.textContent = U.money(U.lerp(from, to, 1 - Math.pow(1 - u, 3)));
        if (u < 1) requestAnimationFrame(tick);
      })(t0);
    },

    /** Push a result into the top history strip. */
    pushHistory: function (results) {
      var h = U.$("hist");
      h.innerHTML = "";
      results.forEach(function (n) {
        var s = document.createElement("span");
        s.className = "hchip c-" + MR.CFG.colourOf(n);
        s.textContent = n;
        h.appendChild(s);
      });
    }
  };

})(window);
