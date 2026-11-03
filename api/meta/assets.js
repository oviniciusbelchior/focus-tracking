// Lista o perfil, as BMs, as contas de anúncio e os pixels a que o perfil conectado tem acesso.
const m = require("../../lib/meta");

module.exports = async (req, res) => {
  const s = m.open(m.cookies(req)[m.COOKIE] || "");
  if (!s) return m.send(res, 401, { connected: false });
  const tok = s.t;
  try {
    const me = await m.graph("me", tok, { fields: "id,name,picture.width(80).height(80){url}" });
    const bizs = await m.all("me/businesses", tok, { fields: "id,name" }).catch(() => []);
    const acc = a => [a.id, a.name || a.id, a.account_status];
    const bms = await Promise.all(bizs.map(async b => {
      const [own, cli, px] = await Promise.all([
        m.all(`${b.id}/owned_ad_accounts`, tok, { fields: "id,name,account_status" }).catch(() => []),
        m.all(`${b.id}/client_ad_accounts`, tok, { fields: "id,name,account_status" }).catch(() => []),
        m.all(`${b.id}/owned_pixels`, tok, { fields: "id,name" }).catch(() => []),
      ]);
      const seen = new Set();
      const accs = own.concat(cli).filter(a => !seen.has(a.id) && seen.add(a.id)).map(acc);
      return { id: b.id, n: b.name, accs, px: px.map(p => [p.id, p.name || p.id]) };
    }));
    // Contas de anúncio pessoais, fora de qualquer BM.
    const mine = await m.all("me/adaccounts", tok, { fields: "id,name,account_status,business" }).catch(() => []);
    const inBm = new Set(bms.flatMap(b => b.accs.map(a => a[0])));
    const loose = mine.filter(a => !inBm.has(a.id));
    if (loose.length) {
      const px = (await Promise.all(loose.map(a => m.all(`${a.id}/adspixels`, tok, { fields: "id,name" }).catch(() => [])))).flat();
      const pxs = [...new Map(px.map(p => [p.id, [p.id, p.name || p.id]])).values()];
      bms.push({ id: "me", n: "Contas pessoais (sem BM)", accs: loose.map(acc), px: pxs });
    }
    m.send(res, 200, { connected: true, user: { id: me.id, name: me.name, pic: me.picture && me.picture.data && me.picture.data.url }, bms });
  } catch (e) {
    console.error("meta assets", e.message, e.meta);
    const expired = e.meta && (e.meta.code === 190 || e.meta.type === "OAuthException");
    if (expired) res.setHeader("Set-Cookie", m.setCookie(m.COOKIE, "", 0));
    m.send(res, expired ? 401 : 502, { connected: false, error: e.message });
  }
};
