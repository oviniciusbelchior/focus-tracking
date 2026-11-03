// Utilitários do login do Meta (Login do Facebook para Empresas).
// A chave secreta fica só na variável de ambiente META_APP_SECRET da Vercel.
const crypto = require("crypto");

const GRAPH = "v24.0";
const APP_ID = process.env.META_APP_ID || "1023558334104960";
const CONFIG_ID = process.env.META_CONFIG_ID || "1456294709929088";
const SECRET = process.env.META_APP_SECRET || "";
const COOKIE = "ft_meta";
const STATE = "ft_meta_state";

const key = () => crypto.createHash("sha256").update("ft-meta:" + SECRET).digest();

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64url");
}
function open(str) {
  try {
    const b = Buffer.from(str, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
  } catch (e) { return null; }
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(/;\s*/).forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); });
  return out;
}
const setCookie = (name, val, maxAge) =>
  `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const redirectUri = req => `https://${req.headers.host}/api/meta/callback`;
const proof = token => crypto.createHmac("sha256", SECRET).update(token).digest("hex");

async function graph(path, token, params = {}) {
  const u = new URL(`https://graph.facebook.com/${GRAPH}/${path.replace(/^\//, "")}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  if (token) { u.searchParams.set("access_token", token); u.searchParams.set("appsecret_proof", proof(token)); }
  const r = await fetch(u);
  const j = await r.json();
  if (!r.ok || j.error) { const e = new Error((j.error && j.error.message) || "Erro na API do Meta"); e.meta = j.error; throw e; }
  return j;
}
// Percorre a paginação da Graph API (até 500 itens).
async function all(path, token, params) {
  let j = await graph(path, token, Object.assign({ limit: "100" }, params)), out = j.data || [];
  while (j.paging && j.paging.next && out.length < 500) { const r = await fetch(j.paging.next); j = await r.json(); out = out.concat(j.data || []); }
  return out;
}
function send(res, code, obj) { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); }

module.exports = { GRAPH, APP_ID, CONFIG_ID, SECRET, COOKIE, STATE, seal, open, cookies, setCookie, redirectUri, graph, all, send };
