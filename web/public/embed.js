// resourcestats embed widget (FiveM resource stats).
// Usage: <span data-fivem-resource="ox_lib" data-show="servers|players|rank"></span>
//        <script src="https://brandstationn.github.io/fivem-resource-stats/embed.js" async></script>
(function () {
  var src = (document.currentScript && document.currentScript.src) || "";
  var base = src.replace(/embed\.js(\?.*)?$/, "");
  var key = function (n) { return (n.slice(0, 2).replace(/[^a-z0-9]/g, "_") + "__").slice(0, 2); };
  var shards = {};
  function fill() {
    var els = document.querySelectorAll("[data-fivem-resource]:not([data-fivem-done])");
    Array.prototype.forEach.call(els, function (el) {
      el.setAttribute("data-fivem-done", "1");
      var name = el.getAttribute("data-fivem-resource").trim().toLowerCase();
      var show = el.getAttribute("data-show") || "servers";
      var k = key(name);
      shards[k] = shards[k] || fetch(base + "api/r/" + k + ".json?v=" + Math.floor(Date.now() / 3e5)).then(function (r) { return r.json(); });
      shards[k].then(function (d) {
        var v = d.r[name] || [0, 0, 0];
        var n = show === "players" ? v[1] : show === "rank" ? v[2] : v[0];
        el.textContent = Number(n).toLocaleString("en-US");
      }).catch(function () { el.textContent = "-"; });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill); else fill();
})();
