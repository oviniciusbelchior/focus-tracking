// Verifica de verdade se o pixel do Focus Tracking está instalado numa página:
// abre a URL pelo servidor e procura o código da conta no HTML ou no contêiner do GTM publicado.
const dns = require("dns").promises;
const net = require("net");

const send = (res, code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };
const UA = "Mozilla/5.0 (compatible; FocusTrackingPixelCheck/1.0; +https://focus-tracking.vercel.app)";

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || (l.startsWith("::ffff:") && privateIp(l.slice(7)));
}
async function safe(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("Use um endereço que comece com http:// ou https://.");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("Porta não permitida.");
  const ips = await dns.lookup(u.hostname, { all: true }).catch(() => { throw new Error("Não encontramos esse domínio. Confira a URL."); });
  if (!ips.length || ips.some(i => privateIp(i.address))) throw new Error("Endereço não permitido.");
}
async function get(url, hops = 0) {
  const u = new URL(url); await safe(u);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(u, { redirect: "manual", signal: ctl.signal, headers: { "User-Agent": UA, Accept: "text/html,application/javascript,*/*" } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      if (hops >= 4) throw new Error("A página redireciona demais.");
      return get(new URL(r.headers.get("location"), u).toString(), hops + 1);
    }
    const reader = r.body.getReader(); let size = 0; const parts = [];
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; parts.push(value); if (size > 3e6) { ctl.abort(); break; } }
    return { status: r.status, url: u.toString(), text: Buffer.concat(parts.map(p => Buffer.from(p))).toString("utf8") };
  } catch (e) {
    if (e.name === "AbortError") throw new Error("A página demorou demais para responder.");
    throw e;
  } finally { clearTimeout(t); }
}

// Só usuários logados no Focus Tracking podem usar a verificação (evita uso como proxy aberto).
const SB_URL = process.env.SUPABASE_URL || "https://jutzkouymkbwlisnumzp.supabase.co";
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_0q43xqEAoJ5I4ULP2g2LKA_3-0JXC4k";
async function logged(req) {
  const h = req.headers.authorization || "";
  if (!/^Bearer [\w.-]+$/.test(h)) return false;
  try { const r = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: h } }); return r.ok; } catch (e) { return false; }
}

module.exports = async (req, res) => {
  if (!(await logged(req))) return send(res, 401, { ok: false, msg: "Entre no Focus Tracking para verificar o pixel." });
  const q = new URL(req.url, "https://x").searchParams;
  let url = (q.get("url") || "").trim(); const id = (q.get("id") || "").trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(id)) return send(res, 400, { ok: false, msg: "Código da conta inválido." });
  if (!url) return send(res, 400, { ok: false, msg: "Informe a URL do site." });
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const page = await get(url);
    if (page.status >= 400) return send(res, 200, { ok: false, url: page.url, msg: `A página respondeu com erro ${page.status}.` });
    const html = page.text, low = html.toLowerCase();
    if (low.includes(id)) return send(res, 200, { ok: true, via: "site", url: page.url, msg: "Código encontrado direto no HTML da página." });
    const gtms = [...new Set((html.match(/GTM-[A-Z0-9]{4,10}/g) || []))].slice(0, 4);
    for (const g of gtms) {
      try {
        const c = await get(`https://www.googletagmanager.com/gtm.js?id=${g}`);
        if (c.text.toLowerCase().includes(id)) return send(res, 200, { ok: true, via: "gtm", gtm: g, url: page.url, msg: `Código encontrado no contêiner ${g} do Google Tag Manager.` });
      } catch (e) {}
    }
    const other = /focustracking|focus-tracking/.test(low);
    let msg = "Não encontramos o pixel nesta página.";
    if (other) msg = "Encontramos um código do Focus Tracking, mas de outra conta. Copie o código desta conta de novo.";
    else if (gtms.length) msg = `A página usa o GTM (${gtms.join(", ")}), mas o pixel não está no contêiner publicado. Confira a tag e clique em Enviar no GTM.`;
    send(res, 200, { ok: false, url: page.url, gtm: gtms, msg });
  } catch (e) {
    send(res, 200, { ok: false, msg: e.message || "Não foi possível abrir a página." });
  }
};
