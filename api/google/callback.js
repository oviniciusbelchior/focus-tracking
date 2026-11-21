// Recebe o retorno do login do Google, troca o código pelo refresh token e guarda num cookie criptografado.
const m = require("../../lib/meta");
const g = require("../../lib/google");

module.exports = async (req, res) => {
  const q = new URL(req.url, "https://x").searchParams;
  const back = msg => { res.statusCode = 302; res.setHeader("Location", "/?google=" + encodeURIComponent(msg) + "#empresa"); res.end(); };
  const clearState = m.setCookie(g.STATE, "", 0);
  if (q.get("error")) { res.setHeader("Set-Cookie", clearState); return back("cancelado"); }
  const st = m.cookies(req)[g.STATE];
  if (!st || st !== q.get("state")) { res.setHeader("Set-Cookie", clearState); return back("erro_estado"); }
  try {
    const t = await g.tokenRequest({ code: q.get("code") || "", client_id: g.CLIENT_ID, client_secret: g.SECRET, redirect_uri: g.redirectUri(req), grant_type: "authorization_code" });
    if (!t.refresh_token) { res.setHeader("Set-Cookie", clearState); return back("sem_refresh"); }
    res.setHeader("Set-Cookie", [clearState, m.setCookie(g.COOKIE, g.seal({ r: t.refresh_token, at: Date.now() }), 180 * 86400)]);
    back("ok");
  } catch (e) {
    console.error("google callback", e.message);
    res.setHeader("Set-Cookie", clearState); back("erro");
  }
};
