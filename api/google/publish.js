// Cria a campanha de Pesquisa PAUSADA no Google Ads a partir do plano aprovado (mesmo formato do "Baixar plano").
// POST /api/google/publish  { plano, login?, validar: true|false }
// Uma única requisição atômica (sem falha parcial). Com validar=true a API só confere, sem gravar.
const m = require("../../lib/meta");
const g = require("../../lib/google");

const BID = { MANUAL_CPC: "MANUAL_CPC", MAXIMIZE_CLICKS: "MAXIMIZE_CLICKS", MAXIMIZE_CONVERSIONS: "MAXIMIZE_CONVERSIONS" };
const MATCH = new Set(["EXACT", "PHRASE", "BROAD"]);
const DAYS = new Set(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
const UFN = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };
const nz = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
// Converte cada área (cidade - UF, estado ou Brasil) no ID de localização do Google. Devolve {geo, erros}.
async function resolveAreas(areas, token) {
  const geo = [], erros = [];
  for (const [i, a] of arr(areas, 50).entries()) {
    const tipo = a && a.tipo, uf = a && String(a.uf || "").toUpperCase(), txt = tipo === "cidade" ? `${a.nome} - ${uf}` : tipo === "estado" ? (UFN[uf] || uf) + " (estado)" : "Brasil";
    if (tipo === "pais") { geo.push({ rn: "geoTargetConstants/2076", txt }); continue; }
    const want = tipo === "cidade" ? ["City", "Municipality"] : ["State"], name = tipo === "cidade" ? str(a.nome, 80) : UFN[uf];
    if (!name || (tipo === "estado" && !UFN[uf])) { erros.push({ t: `Área "${txt}": não entendi essa área.`, onde: { sec: "areas", i, txt } }); continue; }
    let sug = [];
    try { const r = await g.ads("geoTargetConstants:suggest", token, { body: { locale: "pt", countryCode: "BR", locationNames: { names: [name] } } }); sug = r.geoTargetConstantSuggestions || []; }
    catch (e) { erros.push({ t: `Área "${txt}": o Google não respondeu a busca da região (${e.message}).`, onde: { sec: "areas", i, txt } }); continue; }
    const st = nz(UFN[uf] || "");
    const hit = sug.map(x => x.geoTargetConstant || {}).find(x => x.status === "ENABLED" && x.countryCode === "BR" && want.includes(x.targetType) && nz(x.name) === nz(name) && (tipo !== "cidade" || nz(x.canonicalName).includes(st)));
    const same = sug.map(x => x.geoTargetConstant || {}).filter(x => x.status === "ENABLED" && x.countryCode === "BR" && want.includes(x.targetType) && nz(x.name) === nz(name));
    const pick = hit || (same.length === 1 ? same[0] : null);
    if (pick) geo.push({ rn: pick.resourceName, txt });
    else erros.push({ t: `Área "${txt}": o Google não achou essa ${tipo === "cidade" ? "cidade nessa UF" : "região"}. Confira o nome e a UF.`, onde: { sec: "areas", i, txt } });
  }
  return { geo, erros };
}
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
function operations(customer, p, geo) {
  const c = p.campanha || {}, cust = `customers/${customer}`;
  let n = 0; const tmp = kind => `${cust}/${kind}/-${++n}`;
  const ops = [], where = []; ops.where = where;
  const add = (op, w) => { ops.push(op); where.push(w); };
  const budget = tmp("campaignBudgets"), camp = tmp("campaigns");
  const daily = Math.round(Number(c.orcamento_diario_micros) || 0);
  if (daily < 1e6) throw new Error("Orçamento diário inválido.");
  add({ campaignBudgetOperation: { create: { resourceName: budget, name: str(c.nome, 100) + " | orçamento " + Date.now(), amountMicros: String(daily), deliveryMethod: "STANDARD", explicitlyShared: false } } }, { sec: "budget" });
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
  add({ campaignOperation: { create: campaign } }, { sec: "campanha" });
  // Regiões: um pino (raio) por endereço ou cidade.
  const loc = p.localizacao || {}, raio = Math.max(1, Math.min(65, Number(loc.raio_km) || 3));
  arr(loc.pinos || loc.locais, 50).map(x => str(x, 200)).filter(Boolean).forEach((a, li) => {
    const parts = a.split(",").map(s => s.trim()).filter(Boolean), last = parts[parts.length - 1] || "";
    const uf = (last.match(/\s-\s*([A-Za-z]{2})$/) || [])[1];
    const address = { cityName: last.replace(/\s*-\s*[A-Za-z]{2}$/, "").trim(), countryCode: "BR" };
    if (parts.length > 1) address.streetAddress = parts.slice(0, -1).join(", ");
    if (uf) address.provinceCode = uf.toUpperCase();
    add({ campaignCriterionOperation: { create: { campaign: camp, proximity: { address, radius: raio, radiusUnits: "KILOMETERS" } } } }, { sec: "regioes", i: li, txt: a });
  });
  // Áreas inteiras (cidade, estado ou país), já convertidas em IDs de localização do Google.
  (geo || []).forEach((g, ai) => add({ campaignCriterionOperation: { create: { campaign: camp, location: { geoTargetConstant: g.rn } } } }, { sec: "areas", i: ai, txt: g.txt }));
  // Horários dos anúncios.
  const ag = p.agenda;
  if (ag && Array.isArray(ag.dias)) {
    const ini = Math.max(0, Math.min(23, parseInt(ag.inicio, 10) || 0)), fim = Math.max(ini + 1, Math.min(24, parseInt(ag.fim, 10) || 24));
    ag.dias.filter(d => DAYS.has(d)).forEach(d => add({ campaignCriterionOperation: { create: { campaign: camp, adSchedule: { dayOfWeek: d, startHour: ini, startMinute: "ZERO", endHour: fim, endMinute: "ZERO" } } } }, { sec: "agenda" }));
  }
  arr(p.negativas, 200).map(x => str(x, 80)).filter(Boolean).forEach((t, ni) => add({ campaignCriterionOperation: { create: { campaign: camp, negative: true, keyword: { text: t, matchType: "PHRASE" } } } }, { sec: "neg", i: ni, txt: t }));
  arr(p.grupos, 6).forEach((gr, gi) => {
    const ag = tmp("adGroups");
    const group = { resourceName: ag, name: str(gr.nome, 250), campaign: camp, status: "ENABLED", type: "SEARCH_STANDARD" };
    if (est === "MANUAL_CPC" && lance.cpc_micros) group.cpcBidMicros = String(Math.round(lance.cpc_micros));
    add({ adGroupOperation: { create: group } }, { sec: "nome", g: gi, txt: group.name });
    arr(gr.palavras_chave, 200).forEach(k => { const t = str(k.texto, 80); if (t) add({ adGroupCriterionOperation: { create: { adGroup: ag, status: "ENABLED", keyword: { text: t, matchType: MATCH.has(k.correspondencia) ? k.correspondencia : "PHRASE" } } } }, { sec: "kws", g: gi, txt: t }); });
    const an = gr.anuncio || {};
    const heads = arr(an.titulos, 15).map(t => str(t, 30)), descs = arr(an.descricoes, 4).map(t => str(t, 90));
    add({ adGroupAdOperation: { create: { adGroup: ag, status: "ENABLED", ad: { finalUrls: [str(an.url_final, 300)], responsiveSearchAd: {
      headlines: heads.map(text => ({ text })), descriptions: descs.map(text => ({ text })) } } } } }, { sec: "ad", g: gi, heads, descs });
  });
  // Recursos: sitelinks e frases de destaque ligados à campanha.
  const rec = p.recursos || {};
  arr(rec.sitelinks, 8).forEach(s => { const as = tmp("assets"); const t = str(s.texto, 25); if (!t) return;
    add({ assetOperation: { create: { resourceName: as, finalUrls: [str(s.url, 300)], sitelinkAsset: { linkText: t } } } }, { sec: "sl", txt: t });
    add({ campaignAssetOperation: { create: { campaign: camp, asset: as, fieldType: "SITELINK" } } }, { sec: "sl", txt: t }); });
  arr(rec.frases_de_destaque, 10).forEach(s => { const as = tmp("assets"); const t = str(s, 25); if (!t) return;
    add({ assetOperation: { create: { resourceName: as, calloutAsset: { calloutText: t } } } }, { sec: "co", txt: t });
    add({ campaignAssetOperation: { create: { campaign: camp, asset: as, fieldType: "CALLOUT" } } }, { sec: "co", txt: t }); });
  return ops;
}

// Traduz o erro da API para o português e diz onde corrigir.
const LABEL = { agenda: "Horários", areas: "Área", budget: "Orçamento", campanha: "Campanha", regioes: "Região", neg: "Negativa", nome: "Grupo", kws: "Palavra-chave", sl: "Sitelink", co: "Frase de destaque", titles: "Título", descs: "Descrição", url: "Página final" };
const CODE = {
  TOO_LONG: "texto longo demais", TOO_SHORT: "texto curto demais", DUPLICATE_ELEMENT: "item repetido", INVALID_CHARACTERS: "tem caracteres não aceitos", ILLEGAL_CHARS: "tem caracteres não aceitos",
  EXCESSIVE_CAPITALIZATION: "excesso de maiúsculas", INVALID_PUNCTUATION: "pontuação não aceita", REPETITIVE_PUNCTUATION: "pontuação repetida", PHONE_NUMBER_IN_AD_TEXT: "telefone no texto do anúncio",
  CANNOT_GEOCODE_ADDRESS: "o Google não achou esse endereço", INVALID_ADDRESS: "endereço inválido", DUPLICATE_NAME: "já existe uma campanha com esse nome na conta, mude o nome",
  INVALID_URL: "página final inválida", DESTINATION_NOT_WORKING: "a página final não abre", NOT_ENOUGH_HEADLINES: "títulos insuficientes", NOT_ENOUGH_DESCRIPTIONS: "descrições insuficientes",
  USER_PERMISSION_DENIED: "seu login não tem permissão nessa conta", CUSTOMER_NOT_ENABLED: "a conta não está ativa", NOT_ALLOWED_TO_CREATE_CAMPAIGN: "a conta não permite criar campanhas",
  KEYWORD_HAS_INVALID_CHARS: "palavra-chave com caracteres não aceitos", KEYWORD_TOO_MANY_WORDS: "palavra-chave com mais de 10 palavras", POLICY_FINDING: "viola uma política do Google",
  BUDGET_BELOW_MINIMUM: "orçamento abaixo do mínimo", NON_MULTIPLE_OF_MINIMUM_CURRENCY_UNIT: "valor com centavos não aceitos",
};
function explain(er, ops) {
  const top = er.path[0] && er.path[0].name === "mutate_operations" ? er.path[0].index : null;
  const w = top != null && ops.where[top] ? Object.assign({}, ops.where[top]) : null;
  const names = er.path.map(p => p.name).join(".");
  if (w && w.sec === "ad") {
    const hi = (er.path.find(p => p.name === "headlines") || {}).index, di = (er.path.find(p => p.name === "descriptions") || {}).index;
    if (/headlines/.test(names)) { w.sec = "titles"; w.txt = w.heads[hi]; }
    else if (/descriptions/.test(names)) { w.sec = "descs"; w.txt = w.descs[di]; }
    else if (/final_urls/.test(names)) w.sec = "url"; else w.sec = "titles";
  }
  if (w) { delete w.heads; delete w.descs; }
  const val = Object.values(er.code || {})[0] || "", why = er.policy ? `viola a política do Google (${er.policy.toLowerCase().replace(/_/g, " ")})` : CODE[val] || "";
  const head = w ? `${w.g != null && w.sec !== "nome" ? `Grupo ${w.g + 1}, ${LABEL[w.sec].toLowerCase()}` : LABEL[w.sec]}${w.txt ? ` "${w.txt}"` : ""}: ` : "";
  const t = head + (why || er.msg) + (er.trigger && !why.includes(er.trigger) ? ` (${er.trigger})` : "");
  return { t: t.replace(/^./, c => c.toUpperCase()).replace(/\.?$/, "."), orig: er.msg, onde: w };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return m.send(res, 405, { error: "Use POST" });
  let body; try { body = await readBody(req); } catch (e) { return m.send(res, 400, { error: "Corpo inválido" }); }
  const p = body.plano || {}, customer = g.cid(p.conta), login = g.cid(body.login), validar = body.validar !== false;
  if (!/^\d{10}$/.test(customer) || (login && !/^\d{10}$/.test(login))) return m.send(res, 400, { error: "ID da conta inválido" });
  const a = await g.auth(req, res); if (!a) return;
  const areas = await resolveAreas((p.localizacao || {}).areas, a.token);
  if (areas.erros.length) return m.send(res, 422, { ok: false, error: "Áreas não encontradas", erros: areas.erros });
  let ops; try { ops = operations(customer, p, areas.geo); } catch (e) { return m.send(res, 400, { error: e.message }); }
  try {
    const r = await g.ads(`customers/${customer}/googleAds:mutate`, a.token, { body: { mutateOperations: ops, partialFailure: false, validateOnly: validar }, login: login || undefined });
    const created = (r.mutateOperationResponses || []).map(x => { const k = Object.keys(x)[0]; return x[k] && x[k].resourceName; }).filter(Boolean);
    const camp = created.find(x => /\/campaigns\//.test(x));
    m.send(res, 200, { ok: true, validado: validar, operacoes: ops.length, campanha: camp || null, criados: created.length });
  } catch (e) {
    console.error("google publish", e.message);
    m.send(res, e.status === 401 ? 401 : e.status === 403 ? 403 : 422, { ok: false, error: e.message, detalhes: e.details || [], erros: (e.errors || []).slice(0, 30).map(x => explain(x, ops)) });
  }
};
