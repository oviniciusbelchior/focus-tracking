// Desconecta o Meta: apaga o cookie do token.
const m = require("../../lib/meta");
module.exports = (req, res) => { res.setHeader("Set-Cookie", m.setCookie(m.COOKIE, "", 0)); m.send(res, 200, { ok: true }); };
