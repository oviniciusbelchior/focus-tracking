// Google Ads API (REST) com OAuth do Google Cloud.
// Desde 9/9/2026 o Google Ads API não usa mais developer token: o acesso vem do projeto que emitiu as credenciais OAuth.
// Variáveis na Vercel: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e, se preciso, GOOGLE_ADS_API_VERSION / GOOGLE_ADS_DEVELOPER_TOKEN.
const crypto = require("crypto");
const m = require("./meta");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const VERSION = process.env.GOOGLE_ADS_API_VERSION || "v26";
const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const COOKIE = "ft_google", STATE = "ft_google_state";

const key = () => crypto.createHash("sha256").update("ft-google:" + SECRET).digest();
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64url");
}
function open(str) {
  try {
    const b = Buffer.from(str, "base64url"), d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
  } catch (e) { return null; }
}
const redirectUri = req => `https://${req.headers.host}/api/google/callback`;
const session = req => open(m.cookies(req)[COOKIE] || "");
const cid = v => String(v || "").replace(/\D/g, "");

async function tokenRequest(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const j = await r.json();
  if (!r.ok || j.error) { const e = new Error(j.error_description || j.error || "Erro no OAuth do Google"); e.code = j.error; throw e; }
  return j;
}
const accessToken = refresh => tokenRequest({ client_id: CLIENT_ID, client_secret: SECRET, refresh_token: refresh, grant_type: "refresh_token" }).then(j => j.access_token);

async function ads(path, token, { body, login } = {}) {
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  if (DEV_TOKEN) headers["developer-token"] = DEV_TOKEN;
  if (login) headers["login-customer-id"] = cid(login);
  const r = await fetch(`https://googleads.googleapis.com/${VERSION}/${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch (e) { j = { error: { message: text.slice(0, 300) } }; }
  if (!r.ok || j.error) {
    const err = j.error || {};
    const details = (err.details || []).flatMap(d => (d.errors || []).map(x => x.message + (x.location && x.location.fieldPathElements ? " (" + x.location.fieldPathElements.map(f => f.fieldName + (f.index != null ? "[" + f.index + "]" : "")).join(".") + ")" : "")));
    const errors = (err.details || []).flatMap(d => (d.errors || []).map(x => ({ msg: x.message || "", code: x.errorCode || {}, path: (x.location && x.location.fieldPathElements || []).map(f => ({ name: f.fieldName, index: f.index })), trigger: x.trigger && (x.trigger.stringValue || x.trigger.int64Value) || "", policy: x.details && x.details.policyFindingDetails ? (x.details.policyFindingDetails.policyTopicEntries || []).map(t => t.topic).join(", ") : "" })));
    const e = new Error(details.length ? details.join(" | ") : err.message || "Erro na Google Ads API"); e.status = r.status; e.details = details; e.errors = errors; throw e;
  }
  return j;
}
// GAQL com paginação (até 5.000 linhas).
async function search(customer, token, query, login) {
  let out = [], pageToken;
  do {
    const j = await ads(`customers/${cid(customer)}/googleAds:search`, token, { body: pageToken ? { query, pageToken } : { query }, login });
    out = out.concat(j.results || []); pageToken = j.nextPageToken;
  } while (pageToken && out.length < 5000);
  return out;
}
// Abre a sessão do Google a partir do cookie e devolve um access token novo.
async function auth(req, res) {
  const s = session(req);
  if (!s || !s.r) { m.send(res, 401, { connected: false }); return null; }
  try { return { s, token: await accessToken(s.r) }; }
  catch (e) {
    if (e.code === "invalid_grant") res.setHeader("Set-Cookie", m.setCookie(COOKIE, "", 0));
    m.send(res, 401, { connected: false, error: "A conexão com o Google expirou. Conecte de novo." }); return null;
  }
}

module.exports = { CLIENT_ID, SECRET, VERSION, SCOPE, COOKIE, STATE, seal, open, redirectUri, session, cid, tokenRequest, accessToken, ads, search, auth };
