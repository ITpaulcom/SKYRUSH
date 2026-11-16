// Echtgeld-Verkäufe für die Zentrale („Einnahmen“). Quelle: vom Server bei RevenueCat geprüfte Käufe.
// Gespeichert pro Tag: sales/<JJJJ-MM-TT> → { n, gross, net, p: {Produkt: {n, gross}}, st: {Store: {n, gross}}, sb: Testkäufe }
// Preis: der vom Store gemeldete Preis, sonst der Listenpreis (Deutschland, inkl. MwSt.).
import { store, update } from './db.mjs';

export const LIST_EUR = {
  skyrush_remove_ads: 3.99, skyrush_starter: 1.99, skyrush_coins_small: 0.99, skyrush_coins_medium: 2.99,
  skyrush_coins_large: 5.99, skyrush_coins_huge: 12.99, skyrush_coins_5000: 1.99,
};
// Grobe Auszahlung: Stores ziehen die MwSt. (DE 19 %) und 15 % Provision (Small-Business-Programm) ab.
export const payout = gross => Math.round((gross / 1.19) * 0.85 * 100) / 100;
const STORES = { app_store: 'App Store', mac_app_store: 'App Store', play_store: 'Google Play', amazon: 'Amazon', stripe: 'Web', promotional: 'Gratis (Promo)' };
const day = iso => { const d = new Date(iso || Date.now()); return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10); };

// list: [{ tx, product, store, sandbox, date, price?: {amount, currency} }]
export async function recordSales(list) {
  const st = store(), by = {};
  for (const s of list) (by[day(s.date)] ||= []).push(s);
  for (const [d, items] of Object.entries(by)) {
    await update(`sales/${d}`, cur => {
      const o = cur || { n: 0, gross: 0, p: {}, st: {}, sb: 0, tx: [] };
      let ch = false;
      for (const s of items) {
        if (o.tx.includes(s.tx)) continue;
        o.tx.push(s.tx); if (o.tx.length > 2000) o.tx.shift(); ch = true;
        if (s.sandbox) { o.sb++; continue; }
        if (s.store === 'promotional') continue;
        const eur = s.price && s.price.currency === 'EUR' && s.price.amount > 0 ? +s.price.amount : LIST_EUR[s.product] ?? 0;
        o.n++; o.gross = Math.round((o.gross + eur) * 100) / 100;
        const p = o.p[s.product] ||= { n: 0, gross: 0 }; p.n++; p.gross = Math.round((p.gross + eur) * 100) / 100;
        const sn = STORES[s.store] || s.store || '?', x = o.st[sn] ||= { n: 0, gross: 0 }; x.n++; x.gross = Math.round((x.gross + eur) * 100) / 100;
      }
      return ch ? o : undefined;
    });
  }
  return st;
}

export async function salesDays(days) {
  const st = store(), out = [];
  const rows = await Promise.all(Array.from({ length: days }, (_, i) => { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); return st.get(`sales/${d}`, { type: 'json' }).then(v => [d, v]); }));
  for (const [d, v] of rows) out.push({ day: d, n: v ? v.n : 0, gross: v ? v.gross : 0, sandbox: v ? v.sb : 0, products: v ? v.p : {}, stores: v ? v.st : {} });
  return out;
}
