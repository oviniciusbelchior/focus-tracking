// Abre o Login do Facebook para Empresas com a configuração do app.
const crypto = require("crypto");
const m = require("../../lib/meta");

module.exports = (req, res) => {
  if (!m.SECRET) return m.send(res, 500, { error: "META_APP_SECRET não configurada na Vercel." });
  const state = crypto.randomBytes(16).toString("hex");
  const u = new URL(`https://www.facebook.com/${m.GRAPH}/dialog/oauth`);
  u.searchParams.set("client_id", m.APP_ID);
  u.searchParams.set("redirect_uri", m.redirectUri(req));
  u.searchParams.set("config_id", m.CONFIG_ID);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("override_default_response_type", "true");
  u.searchParams.set("state", state);
  res.setHeader("Set-Cookie", m.setCookie(m.STATE, state, 600));
  res.statusCode = 302; res.setHeader("Location", u.toString()); res.end();
};
