// Inspetor de campanha: métricas do Meta Ads por campanha, conjunto ou anúncio de uma conta.
// GET /api/meta/insights?act=act_123&level=campaign|adset|ad&since=AAAA-MM-DD&until=AAAA-MM-DD
const m = require("../../lib/meta");

const LEVELS = { campaign: "campaigns", adset: "adsets", ad: "ads" };
const OBJ = {
  OUTCOME_SALES: "Vendas", OUTCOME_LEADS: "Cadastros", OUTCOME_TRAFFIC: "Tráfego", OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_AWARENESS: "Reconhecimento", OUTCOME_APP_PROMOTION: "App", MESSAGES: "Mensagens", CONVERSIONS: "Conversões",
  LINK_CLICKS: "Tráfego", LEAD_GENERATION: "Cadastros", REACH: "Alcance", BRAND_AWARENESS: "Reconhecimento",
  POST_ENGAGEMENT: "Engajamento", VIDEO_VIEWS: "Visualizações", PRODUCT_CATALOG_SALES: "Catálogo",
};
// Status efetivo do Meta -> rótulo do app.
const STATUS = s => s === "ACTIVE" ? "ativo" : /PAUSED/.test(s || "") ? "pausado" : s === "DISAPPROVED" ? "reprovado"
  : /PENDING|IN_PROCESS|PREAPPROVED/.test(s || "") ? "analise" : s === "WITH_ISSUES" ? "problema" : "arquivado";
const LIVE_STATUS = ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED"];

const num = v => Number(v) || 0;
const sumOf = (list, types) => {
  // Usa o primeiro tipo que existir, para não contar o mesmo resultado duas vezes.
  for (const t of types) { const a = (list || []).find(x => x.action_type === t); if (a) return num(a.value); }
  return 0;
};
const MSG = ["onsite_conversion.messaging_conversation_started_7d"];
const LEAD = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const BUY = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase"];

module.exports = async (req, res) => {
  const s = m.open(m.cookies(req)[m.COOKIE] || "");
  if (!s) return m.send(res, 401, { connected: false });
  const q = new URL(req.url, "https://x").searchParams;
  const act = q.get("act") || "", level = q.get("level") || "campaign";
  const since = q.get("since") || "", until = q.get("until") || "";
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!/^act_\d{1,25}$/.test(act) || !LEVELS[level] || !day.test(since) || !day.test(until) || since > until)
    return m.send(res, 400, { error: "Parâmetros inválidos" });
  const tok = s.t;
  try {
    const filtering = JSON.stringify([{ field: "effective_status", operator: "IN", value: LIVE_STATUS }]);
    const entFields = { campaign: "id,name,effective_status,objective", adset: "id,name,effective_status,campaign_id", ad: "id,name,effective_status,adset_id,campaign_id,creative{thumbnail_url}" }[level];
    const [ins, ents, camps] = await Promise.all([
      m.all(`${act}/insights`, tok, {
        level, time_range: JSON.stringify({ since, until }), limit: "200",
        fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,reach,impressions,frequency,clicks,inline_link_clicks,actions,action_values",
      }),
      m.all(`${act}/${LEVELS[level]}`, tok, { fields: entFields, filtering }).catch(() => []),
      level === "campaign" ? Promise.resolve(null) : m.all(`${act}/campaigns`, tok, { fields: "id,name,objective,effective_status" }).catch(() => []),
    ]);
    const campInfo = new Map((camps || ents).map(c => [c.id, c]));
    const byId = new Map(ents.map(e => [e.id, e]));
    const idKey = level + "_id", nameKey = level + "_name";
    const rows = ins.map(r => {
      const e = byId.get(r[idKey]) || {};
      byId.delete(r[idKey]);
      const camp = campInfo.get(r.campaign_id) || {};
      return {
        id: r[idKey], name: r[nameKey] || e.name || r[idKey],
        campId: r.campaign_id, camp: r.campaign_name, setId: r.adset_id || null, set: r.adset_name || null,
        status: STATUS(e.effective_status), tipo: OBJ[(level === "campaign" ? e.objective : camp.objective)] || "—",
        thumb: e.creative && e.creative.thumbnail_url || null,
        spend: num(r.spend), reach: num(r.reach), impr: num(r.impressions), clicks: num(r.inline_link_clicks || r.clicks),
        msgs: sumOf(r.actions, MSG), leads: sumOf(r.actions, MSG) + sumOf(r.actions, LEAD),
        buys: sumOf(r.actions, BUY), rev: sumOf(r.action_values, BUY),
      };
    });
    // Itens ativos que ainda não gastaram nada no período também aparecem, zerados.
    byId.forEach(e => {
      if (e.effective_status !== "ACTIVE") return;
      const camp = campInfo.get(level === "campaign" ? e.id : e.campaign_id) || {};
      rows.push({ id: e.id, name: e.name, campId: level === "campaign" ? e.id : e.campaign_id, camp: camp.name || "",
        setId: level === "ad" ? e.adset_id : level === "adset" ? e.id : null, set: level === "adset" ? e.name : null, status: "ativo",
        tipo: OBJ[camp.objective] || "—", thumb: e.creative && e.creative.thumbnail_url || null, spend: 0, reach: 0, impr: 0, clicks: 0, msgs: 0, leads: 0, buys: 0, rev: 0 });
    });
    m.send(res, 200, { level, since, until, rows });
  } catch (e) {
    console.error("meta insights", e.message, e.meta);
    const expired = e.meta && (e.meta.code === 190);
    if (expired) res.setHeader("Set-Cookie", m.setCookie(m.COOKIE, "", 0));
    m.send(res, expired ? 401 : 502, { error: e.message });
  }
};
