// Lista as contas do Google Ads a que o login tem acesso (diretas e, se forem MCC, as contas clientes).
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
        const r = await g.search(id, a.token, "SELECT customer.id, customer.descriptive_name, customer.manager, customer.test_account, customer.currency_code FROM customer LIMIT 1");
        const c = r[0] && r[0].customer || {};
        out.push({ id, name: c.descriptiveName || id, manager: !!c.manager, test: !!c.testAccount, currency: c.currencyCode || "" });
        if (c.manager) {
          const kids = await g.search(id, a.token, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.test_account, customer_client.currency_code FROM customer_client WHERE customer_client.level = 1 AND customer_client.status = 'ENABLED'", id).catch(() => []);
          kids.forEach(k => { const x = k.customerClient || {}; if (!x.manager) out.push({ id: String(x.id), name: x.descriptiveName || String(x.id), manager: false, test: !!x.testAccount, currency: x.currencyCode || "", login: id }); });
        }
      } catch (e) { out.push({ id, name: id, error: e.message }); }
    }));
    const seen = new Set();
    m.send(res, 200, { connected: true, accounts: out.filter(x => !seen.has(x.id) && seen.add(x.id)) });
  } catch (e) {
    console.error("google accounts", e.message);
    m.send(res, 502, { connected: true, error: e.message });
  }
};
