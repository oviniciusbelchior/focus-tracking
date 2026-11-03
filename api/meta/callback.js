// Recebe o retorno do login, troca o código por um token de longa duração e guarda num cookie criptografado.
const m = require("../../lib/meta");

module.exports = async (req, res) => {
  const q = new URL(req.url, "https://x").searchParams;
  const back = msg => { res.statusCode = 302; res.setHeader("Location", "/?meta=" + encodeURIComponent(msg) + "#empresa"); res.end(); };
  const clearState = m.setCookie(m.STATE, "", 0);
  if (q.get("error")) { res.setHeader("Set-Cookie", clearState); return back("cancelado"); }
  const st = m.cookies(req)[m.STATE];
  if (!st || st !== q.get("state")) { res.setHeader("Set-Cookie", clearState); return back("erro_estado"); }
  try {
    const short = await m.graph("oauth/access_token", null, { client_id: m.APP_ID, client_secret: m.SECRET, redirect_uri: m.redirectUri(req), code: q.get("code") || "" });
    let tok = short.access_token, exp = short.expires_in || 3600;
    try {
      const long = await m.graph("oauth/access_token", null, { grant_type: "fb_exchange_token", client_id: m.APP_ID, client_secret: m.SECRET, fb_exchange_token: tok });
      tok = long.access_token; exp = long.expires_in || 60 * 86400;
    } catch (e) {}
    const me = await m.graph("me", tok, { fields: "id,name" });
    const maxAge = Math.min(exp, 60 * 86400);
    res.setHeader("Set-Cookie", [clearState, m.setCookie(m.COOKIE, m.seal({ t: tok, id: me.id, n: me.name, at: Date.now() }), maxAge)]);
    back("ok");
  } catch (e) {
    console.error("meta callback", e.message, e.meta);
    res.setHeader("Set-Cookie", clearState); back("erro");
  }
};
