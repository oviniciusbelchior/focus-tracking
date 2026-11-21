// Abre o login do Google pedindo acesso ao Google Ads (escopo adwords, com refresh token).
const crypto = require("crypto");
const m = require("../../lib/meta");
const g = require("../../lib/google");

module.exports = (req, res) => {
  if (!g.CLIENT_ID || !g.SECRET) return m.send(res, 500, { error: "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configuradas na Vercel." });
  const state = crypto.randomBytes(16).toString("hex");
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({ client_id: g.CLIENT_ID, redirect_uri: g.redirectUri(req), response_type: "code", scope: g.SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  res.setHeader("Set-Cookie", m.setCookie(g.STATE, state, 600));
  res.statusCode = 302; res.setHeader("Location", u.toString()); res.end();
};
