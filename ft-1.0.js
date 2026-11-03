/* Pixel do Focus Tracking: guarda gclid, fbclid e UTMs do clique no anúncio para os links rastreados. */
(function (w, d) {
  var ft = w.ft = w.ft || {};
  if (ft.loaded) return; ft.loaded = true; ft.v = "1.0";
  var KEYS = ["gclid", "gbraid", "wbraid", "fbclid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var q = new URLSearchParams(w.location.search), got = {}, any = false;
  KEYS.forEach(function (k) { var v = q.get(k); if (v) { got[k] = v; any = true; } });
  var saved = {};
  try { saved = JSON.parse(decodeURIComponent((d.cookie.match(/(?:^|; )ft_click=([^;]*)/) || [])[1] || "%7B%7D")); } catch (e) {}
  if (any) {
    got.ts = Date.now(); got.lp = w.location.origin + w.location.pathname; got.ref = d.referrer || "";
    saved = got;
    d.cookie = "ft_click=" + encodeURIComponent(JSON.stringify(saved)) + "; Path=/; Max-Age=" + 90 * 86400 + "; SameSite=Lax";
  }
  ft.params = saved;
  // Repassa os parâmetros aos links rastreados do Focus Tracking.
  function decorate() {
    var links = d.querySelectorAll('a[href*="focus-tracking.vercel.app/r/"],a[href*="focustracking.app/r/"]');
    for (var i = 0; i < links.length; i++) {
      try { var u = new URL(links[i].href); KEYS.forEach(function (k) { if (saved[k] && !u.searchParams.get(k)) u.searchParams.set(k, saved[k]); }); links[i].href = u.toString(); } catch (e) {}
    }
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", decorate); else decorate();
})(window, document);
