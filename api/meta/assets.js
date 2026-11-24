// Lista o perfil, as BMs, as páginas (com Instagram), as contas de anúncio e os pixels a que o perfil conectado tem acesso.
const m = require("../../lib/meta");

module.exports = async (req, res) => {
  const s = m.open(m.cookies(req)[m.COOKIE] || "");
  if (!s) return m.send(res, 401, { connected: false });
  const tok = s.t;
  const q = new URL(req.url, "http://x").searchParams, t = q.get("t");
  // Buscas usadas no Criar campanha: interesses, públicos da conta e eventos do pixel.
  if (t) {
    try {
      if (t === "interesses") {
        const r = await m.graph("search", tok, { type: "adinterest", q: String(q.get("q") || "").slice(0, 80), limit: "8", locale: "pt_BR" });
        return m.send(res, 200, { rows: (r.data || []).map(x => ({ id: x.id, n: x.name, lo: x.audience_size_lower_bound, hi: x.audience_size_upper_bound, path: (x.path || []).join(" › ") })) });
      }
      if (t === "publicos") {
        const act = String(q.get("act") || "").replace(/[^\w]/g, "");
        if (!/^act_\d+$/.test(act)) return m.send(res, 400, { error: "Conta inválida." });
        const r = await m.all(`${act}/customaudiences`, tok, { fields: "id,name,subtype,approximate_count_lower_bound" });
        return m.send(res, 200, { rows: r.map(x => ({ id: x.id, n: x.name, sub: x.subtype, size: x.approximate_count_lower_bound })) });
      }
      if (t === "eventos") {
        const px = String(q.get("px") || "").replace(/\D/g, "");
        if (!px) return m.send(res, 400, { error: "Pixel inválido." });
        const r = await m.graph(`${px}/stats`, tok, { aggregation: "event" }).catch(() => ({ data: [] }));
        const n = {};
        (r.data || []).forEach(h => (h.data || []).forEach(e => { n[e.value] = (n[e.value] || 0) + (+e.count || 0); }));
        return m.send(res, 200, { rows: Object.entries(n).map(([ev, c]) => ({ ev, c })).sort((a, b) => b.c - a.c) });
      }
      return m.send(res, 400, { error: "Busca desconhecida." });
    } catch (e) {
      console.error("meta busca", t, e.message, e.meta);
      return m.send(res, 502, { error: e.message });
    }
  }
  try {
    const me = await m.graph("me", tok, { fields: "id,name,picture.width(80).height(80){url}" });
    const bizs = await m.all("me/businesses", tok, { fields: "id,name" }).catch(() => []);
    const acc = a => [a.id, a.name || a.id, a.account_status];
    const bms = await Promise.all(bizs.map(async b => {
      const pgFields = { fields: "id,name,whatsapp_number,instagram_business_account{id,username}" };
      const [own, cli, px, opg, cpg] = await Promise.all([
        m.all(`${b.id}/owned_ad_accounts`, tok, { fields: "id,name,account_status" }).catch(() => []),
        m.all(`${b.id}/client_ad_accounts`, tok, { fields: "id,name,account_status" }).catch(() => []),
        m.all(`${b.id}/owned_pixels`, tok, { fields: "id,name" }).catch(() => []),
        m.all(`${b.id}/owned_pages`, tok, pgFields).catch(() => []),
        m.all(`${b.id}/client_pages`, tok, pgFields).catch(() => []),
      ]);
      const seen = new Set(), seenPg = new Set();
      const accs = own.concat(cli).filter(a => !seen.has(a.id) && seen.add(a.id)).map(acc);
      // Páginas: [id, nome, @instagram, id do Instagram, WhatsApp ligado à página]
      const pg = opg.concat(cpg).filter(p => !seenPg.has(p.id) && seenPg.add(p.id)).map(p => {
        const ig = p.instagram_business_account || {};
        return [p.id, p.name || p.id, ig.username ? "@" + ig.username : "", ig.id || "", p.whatsapp_number || ""];
      });
      return { id: b.id, n: b.name, accs, px: px.map(p => [p.id, p.name || p.id]), pg };
    }));
    // Contas de anúncio pessoais, fora de qualquer BM.
    const mine = await m.all("me/adaccounts", tok, { fields: "id,name,account_status,business" }).catch(() => []);
    const inBm = new Set(bms.flatMap(b => b.accs.map(a => a[0])));
    const loose = mine.filter(a => !inBm.has(a.id));
    if (loose.length) {
      const px = (await Promise.all(loose.map(a => m.all(`${a.id}/adspixels`, tok, { fields: "id,name" }).catch(() => [])))).flat();
      const pxs = [...new Map(px.map(p => [p.id, [p.id, p.name || p.id]])).values()];
      const mp = await m.all("me/accounts", tok, { fields: "id,name,whatsapp_number,instagram_business_account{id,username}" }).catch(() => []);
      const pg = mp.map(p => { const ig = p.instagram_business_account || {}; return [p.id, p.name || p.id, ig.username ? "@" + ig.username : "", ig.id || "", p.whatsapp_number || ""]; });
      bms.push({ id: "me", n: "Contas pessoais (sem BM)", accs: loose.map(acc), px: pxs, pg });
    }
    m.send(res, 200, { connected: true, user: { id: me.id, name: me.name, pic: me.picture && me.picture.data && me.picture.data.url }, bms });
  } catch (e) {
    console.error("meta assets", e.message, e.meta);
    const expired = e.meta && (e.meta.code === 190 || e.meta.type === "OAuthException");
    if (expired) res.setHeader("Set-Cookie", m.setCookie(m.COOKIE, "", 0));
    m.send(res, expired ? 401 : 502, { connected: false, error: e.message });
  }
};
