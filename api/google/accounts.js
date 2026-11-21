// Lista as contas do Google Ads a que o login tem acesso: as diretas e, nas MCCs, todas as contas clientes da hierarquia.
const m = require("../../lib/meta");
const g = require("../../lib/google");

module.exports = async (req, res) => {
  const a = await g.auth(req, res); if (!a) return;
  try {
    const list = await g.ads("customers:listAccessibleCustomers", a.token);
    const ids = (list.resourceNames || []).map(r => r.split("/")[1]).slice(0, 50);
    const out = [];
    await Promise.all(ids.map(async id => {
      try {
        const r = await g.search(id, a.token, "SELECT customer.id, customer.descriptive_name, customer.manager, customer.test_account, customer.currency_code, customer.status FROM customer LIMIT 1", id);
        const c = r[0] && r[0].customer || {};
        const me = { id, name: c.descriptiveName || id, manager: !!c.manager, test: !!c.testAccount, currency: c.currencyCode || "", status: c.status || "", direct: true };
        out.push(me);
        if (c.manager) {
          // Hierarquia inteira abaixo da MCC (inclui sub-MCCs), usando a própria MCC como login-customer-id.
          try {
            const kids = await g.search(id, a.token, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.test_account, customer_client.currency_code, customer_client.status, customer_client.level FROM customer_client WHERE customer_client.level >= 1", id);
            kids.forEach(k => {
              const x = k.customerClient || {};
              out.push({ id: String(x.id), name: x.descriptiveName || String(x.id), manager: !!x.manager, test: !!x.testAccount, currency: x.currencyCode || "", status: x.status || "", login: id });
            });
            me.clients = kids.filter(k => k.customerClient && !k.customerClient.manager).length;
          } catch (e) { me.error = "Não foi possível listar as contas desta MCC: " + e.message; }
        }
      } catch (e) { out.push({ id, name: id, error: e.message, direct: true }); }
    }));
    // Conta direta vence a mesma conta vista pela MCC.
    const byId = new Map();
    out.forEach(x => { const o = byId.get(x.id); if (!o || (x.direct && !o.direct)) byId.set(x.id, o && o.direct ? o : { ...o, ...x }); });
    m.send(res, 200, { connected: true, direct: ids.length, accounts: [...byId.values()] });
  } catch (e) {
    console.error("google accounts", e.message);
    m.send(res, 502, { connected: true, error: e.message });
  }
};
