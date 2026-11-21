// Desconecta o Google Ads: apaga o cookie do refresh token.
const m = require("../../lib/meta");
const g = require("../../lib/google");
module.exports = (req, res) => { res.setHeader("Set-Cookie", m.setCookie(g.COOKIE, "", 0)); m.send(res, 200, { ok: true }); };
