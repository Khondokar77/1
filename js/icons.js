/* ==========================================================================
   icons.js — Lucide icons

   Icons come from the Lucide UMD build on the CDN (see index.html). The CDN
   is loaded with `defer`, so it may not be ready when this runs, and it may
   never arrive at all — offline, behind a firewall, or when the game is
   packaged into a WebView with no network.

   So: try Lucide, and if any placeholder is still empty afterwards, drop an
   inline SVG into it. The UI is never left with blank buttons.
   ========================================================================== */
(function (global) {
  "use strict";

  var MR = global.MR;

  /* Minimal inline copies of the same Lucide glyphs, used only as fallback.
     Paths are the 24x24 Lucide outlines. */
  var FALLBACK = {
    "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    "refresh-cw": '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>' +
                  '<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
    "coins":      '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/>' +
                  '<path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    "menu":       '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/>' +
                  '<line x1="4" x2="20" y1="18" y2="18"/>',
    "chevron-left":  '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>'
  };

  function inlineSvg (name) {
    var body = FALLBACK[name];
    if (!body) return "";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
           'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
           'stroke-linejoin="round" class="lucide lucide-' + name + '">' + body + "</svg>";
  }

  function fillGaps () {
    var nodes = document.querySelectorAll("[data-lucide]");
    var missing = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.tagName.toLowerCase() === "svg") continue;   // Lucide replaced it
      if (n.querySelector("svg")) continue;
      n.innerHTML = inlineSvg(n.getAttribute("data-lucide"));
      missing++;
    }
    return missing;
  }

  MR.Icons = {
    /** Render every [data-lucide] placeholder. Safe to call more than once. */
    render: function () {
      try {
        if (global.lucide && typeof global.lucide.createIcons === "function") {
          global.lucide.createIcons();
        }
      } catch (e) {
        /* fall through to the inline set */
      }
      var missing = fillGaps();
      if (missing) {
        // Lucide may still be in flight; try again once it has had a moment.
        setTimeout(function () {
          try {
            if (global.lucide && typeof global.lucide.createIcons === "function") {
              global.lucide.createIcons();
            }
          } catch (e) {}
          fillGaps();
        }, 600);
      }
    }
  };

})(window);
