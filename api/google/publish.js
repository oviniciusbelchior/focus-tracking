// Cria a campanha de Pesquisa PAUSADA no Google Ads a partir do plano aprovado (mesmo formato do "Baixar plano").
// POST /api/google/publish  { plano, login?, validar: true|false }
// Uma única requisição atômica (sem falha parcial). Com validar=true a API só confere, sem gravar.
const m = require("../../lib/meta");
const g = require("../../lib/google");

const BID = { MANUAL_CPC: "MANUAL_CPC", MAXIMIZE_CLICKS: "MAXIMIZE_CLICKS", MAXIMIZE_CONVERSIONS: "MAXIMIZE_CONVERSIONS" };
const MATCH = new Set(["EXACT", "PHRASE", "BROAD"]);
const str = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const arr = (v, max) => (Array.isArray(v) ? v : []).slice(0, max);

function readBody(req) {
  return new Promise((ok, bad) => {
    if (req.body && typeof req.body === "object") return ok(req.body);
    let d = ""; req.on("data", c => { d += c; if (d.length > 200000) { bad(new Error("grande")); req.destroy(); } });
    req.on("end", () => { try { ok(JSON.parse(d || "{}")); } catch (e) { bad(e); } });
  });
}

// Monta as operações do mutate com nomes temporários (IDs negativos).
function operations(customer, p) {
  const c = p.campanha || {}, cust = `customers/${customer}`;
  let n = 0; const tmp = kind => `${cust}/${kind}/-${++n}`;
  const ops = [];
  const budget = tmp("campaignBudgets"), camp = tmp("campaigns");
  const daily = Math.round(Number(c.orcamento_diario_micros) || 0);
  if (daily < 1e6) throw new Error("Orçamento diário inválido.");
  ops.push({ campaignBudgetOperation: { create: { resourceName: budget, name: str(c.nome, 100) + " | orçamento " + Date.now(), amountMicros: String(daily), deliveryMethod: "STANDARD", explicitlyShared: false } } });
  const lance = c.lance || {}, campaign = {
    resourceName: camp, name: str(c.nome, 250), status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: budget,
    networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
    geoTargetTypeSetting: { positiveGeoTargetType: (p.localizacao || {}).opcao === "PRESENCE_OR_INTEREST" ? "PRESENCE_OR_INTEREST" : "PRESENCE" },
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  };
  const est = BID[lance.estrategia] || "MAXIMIZE_CONVERSIONS";
  if (est === "MANUAL_CPC") campaign.manualCpc = { enhancedCpcEnabled: false };
  else if (est === "MAXIMIZE_CLICKS") campaign.targetSpend = lance.cpc_maximo_micros ? { cpcBidCeilingMicros: String(Math.round(lance.cpc_maximo_micros)) } : {};
  else campaign.maximizeConversions = lance.cpa_desejado_micros ? { targetCpaMicros: String(Math.round(lance.cpa_desejado_micros)) } : {};
  ops.push({ campaignOperation: { create: campaign } });
  // Regiões: um pino (raio) por endereço ou cidade.
  const loc = p.localizacao || {}, raio = Math.max(1, Math.min(65, Number(loc.raio_km) || 3));
  arr(loc.locais, 50).map(x => str(x, 200)).filter(Boolean).forEach(a => {
    const parts = a.split(",").map(s => s.trim()).filter(Boolean), last = parts[parts.length - 1] || "";
    const uf = (last.match(/\s-\s*([A-Za-z]{2})$/) || [])[1];
    const address = { cityName: last.replace(/\s*-\s*[A-Za-z]{2}$/, "").trim(), countryCode: "BR" };
    if (parts.length > 1) address.streetAddress = parts.slice(0, -1).join(", ");
    if (uf) address.provinceCode = uf.toUpperCase();
    ops.push({ campaignCriterionOperation: { create: { campaign: camp, proximity: { address, radius: raio, radiusUnits: "KILOMETERS" } } } });
  });
  arr(p.negativas, 200).map(x => str(x, 80)).filter(Boolean).forEach(t => ops.push({ campaignCriterionOperation: { create: { campaign: camp, negative: true, keyword: { text: t, matchType: "PHRASE" } } } }));
  arr(p.grupos, 6).forEach(gr => {
    const ag = tmp("adGroups");
    const group = { resourceName: ag, name: str(gr.nome, 250), campaign: camp, status: "ENABLED", type: "SEARCH_STANDARD" };
    if (est === "MANUAL_CPC" && lance.cpc_micros) group.cpcBidMicros = String(Math.round(lance.cpc_micros));
    ops.push({ adGroupOperation: { create: group } });
    arr(gr.palavras_chave, 200).forEach(k => { const t = str(k.texto, 80); if (t) ops.push({ adGroupCriterionOperation: { create: { adGroup: ag, status: "ENABLED", keyword: { text: t, matchType: MATCH.has(k.correspondencia) ? k.correspondencia : "PHRASE" } } } }); });
    const an = gr.anuncio || {};
    ops.push({ adGroupAdOperation: { create: { adGroup: ag, status: "ENABLED", ad: { finalUrls: [str(an.url_final, 300)], responsiveSearchAd: {
      headlines: arr(an.titulos, 15).map(t => ({ text: str(t, 30) })), descriptions: arr(an.descricoes, 4).map(t => ({ text: str(t, 90) })) } } } } });
  });
  // Recursos: sitelinks e frases de destaque ligados à campanha.
  const rec = p.recursos || {};
  arr(rec.sitelinks, 8).forEach(s => { const as = tmp("assets"); const t = str(s.texto, 25); if (!t) return;
    ops.push({ assetOperation: { create: { resourceName: as, finalUrls: [str(s.url, 300)], sitelinkAsset: { linkText: t } } } });
    ops.push({ campaignAssetOperation: { create: { campaign: camp, asset: as, fieldType: "SITELINK" } } }); });
  arr(rec.frases_de_destaque, 10).forEach(s => { const as = tmp("assets"); const t = str(s, 25); if (!t) return;
    ops.push({ assetOperation: { create: { resourceName: as, calloutAsset: { calloutText: t } } } });
    ops.push({ campaignAssetOperation: { create: { campaign: camp, asset: as, fieldType: "CALLOUT" } } }); });
  return ops;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return m.send(res, 405, { error: "Use POST" });
  let body; try { body = await readBody(req); } catch (e) { return m.send(res, 400, { error: "Corpo inválido" }); }
  const p = body.plano || {}, customer = g.cid(p.conta), login = g.cid(body.login), validar = body.validar !== false;
  if (!/^\d{10}$/.test(customer) || (login && !/^\d{10}$/.test(login))) return m.send(res, 400, { error: "ID da conta inválido" });
  let ops; try { ops = operations(customer, p); } catch (e) { return m.send(res, 400, { error: e.message }); }
  const a = await g.auth(req, res); if (!a) return;
  try {
    const r = await g.ads(`customers/${customer}/googleAds:mutate`, a.token, { body: { mutateOperations: ops, partialFailure: false, validateOnly: validar }, login: login || undefined });
    const created = (r.mutateOperationResponses || []).map(x => { const k = Object.keys(x)[0]; return x[k] && x[k].resourceName; }).filter(Boolean);
    const camp = created.find(x => /\/campaigns\//.test(x));
    m.send(res, 200, { ok: true, validado: validar, operacoes: ops.length, campanha: camp || null, criados: created.length });
  } catch (e) {
    console.error("google publish", e.message);
    m.send(res, e.status === 401 || e.status === 403 ? 403 : 422, { ok: false, error: e.message, detalhes: e.details || [] });
  }
};
