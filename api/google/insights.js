// Inspetor de campanha: métricas do Google Ads por campanha, grupo de anúncios ou anúncio.
// GET /api/google/insights?cid=1234567890&login=MCC&level=campaign|adset|ad&since=AAAA-MM-DD&until=AAAA-MM-DD
const m = require("../../lib/meta");
const g = require("../../lib/google");

const TIPO = { SEARCH: "Pesquisa", PERFORMANCE_MAX: "Performance Max", DISPLAY: "Display", VIDEO: "Vídeo", SHOPPING: "Shopping", DEMAND_GEN: "Demand Gen", LOCAL: "Local", SMART: "Inteligente", MULTI_CHANNEL: "App" };
const ST = s => s === "ENABLED" ? "ativo" : s === "PAUSED" ? "pausado" : "arquivado";
const METRICS = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";
const Q = {
  campaign: (a, b) => `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ${METRICS} FROM campaign WHERE segments.date BETWEEN '${a}' AND '${b}' AND campaign.status != 'REMOVED'`,
  adset: (a, b) => `SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ${METRICS} FROM ad_group WHERE segments.date BETWEEN '${a}' AND '${b}' AND ad_group.status != 'REMOVED'`,
  ad: (a, b) => `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.status, ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ${METRICS} FROM ad_group_ad WHERE segments.date BETWEEN '${a}' AND '${b}' AND ad_group_ad.status != 'REMOVED'`,
};
const num = v => Number(v) || 0;

module.exports = async (req, res) => {
  const q = new URL(req.url, "https://x").searchParams;
  const customer = g.cid(q.get("cid")), login = g.cid(q.get("login")), level = q.get("level") || "campaign";
  const since = q.get("since") || "", until = q.get("until") || "", day = /^\d{4}-\d{2}-\d{2}$/;
  if (!/^\d{10}$/.test(customer) || (login && !/^\d{10}$/.test(login)) || !Q[level] || !day.test(since) || !day.test(until) || since > until)
    return m.send(res, 400, { error: "Parâmetros inválidos" });
  const a = await g.auth(req, res); if (!a) return;
  try {
    const rows = await g.search(customer, a.token, Q[level](since, until), login || undefined);
    const byId = new Map();
    rows.forEach(r => {
      const c = r.campaign || {}, ag = r.adGroup || {}, ad = (r.adGroupAd || {}).ad || {}, mt = r.metrics || {};
      const id = String(level === "campaign" ? c.id : level === "adset" ? ag.id : ad.id);
      const ownStatus = level === "campaign" ? c.status : level === "adset" ? ag.status : (r.adGroupAd || {}).status;
      const status = [c.status, level !== "campaign" ? ag.status : null, ownStatus].includes("PAUSED") ? "pausado" : ST(ownStatus);
      const heads = ad.responsiveSearchAd && ad.responsiveSearchAd.headlines || [];
      const name = level === "ad" ? (ad.name || (heads[0] && heads[0].text ? heads.slice(0, 2).map(h => h.text).join(" | ") : "Anúncio " + id)) : level === "adset" ? ag.name : c.name;
      let x = byId.get(id);
      if (!x) { x = { id, name, campId: String(c.id), camp: c.name, setId: ag.id ? String(ag.id) : null, set: ag.name || null, status, tipo: TIPO[c.advertisingChannelType] || "—", thumb: null, spend: 0, reach: null, impr: 0, clicks: 0, leads: 0, buys: 0, rev: 0 }; byId.set(id, x); }
      x.spend += num(mt.costMicros) / 1e6; x.impr += num(mt.impressions); x.clicks += num(mt.clicks); x.leads += num(mt.conversions); x.rev += num(mt.conversionsValue);
    });
    const out = [...byId.values()].map(x => Object.assign(x, { spend: Math.round(x.spend * 100) / 100, leads: Math.round(x.leads * 10) / 10 }));
    m.send(res, 200, { level, since, until, rows: out });
  } catch (e) {
    console.error("google insights", e.message);
    m.send(res, e.status === 401 || e.status === 403 ? 403 : 502, { error: e.message });
  }
};
