// Prüft die Kauf-Gutschrift (genau einmal, Nachlieferung, alte Käufe) mit einem simulierten RevenueCat.
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
let txs = [{ productIdentifier: 'skyrush_coins_5000', transactionIdentifier: 'old-1' }], noAds = false;
const ci = () => ({ entitlements: { active: noAds ? { no_ads: {} } : {} }, nonSubscriptionTransactions: txs.slice(), allPurchasedProductIdentifiers: txs.map(t => t.productIdentifier) });
const prod = id => ({ identifier: id, priceString: '1,99 €', title: id });
const Purchases = {
  configure: async () => {}, addCustomerInfoUpdateListener() {}, getCustomerInfo: async () => ({ customerInfo: ci() }),
  getOfferings: async () => ({ current: { availablePackages: ['skyrush_remove_ads', 'skyrush_starter', 'skyrush_coins_small', 'skyrush_coins_medium', 'skyrush_coins_large', 'skyrush_coins_huge'].map(id => ({ product: prod(id) })) }, all: {} }),
  purchasePackage: async ({ aPackage }) => { const id = aPackage.product.identifier; if (id === 'skyrush_remove_ads') noAds = true; else txs.push({ productIdentifier: id, transactionIdentifier: 't' + txs.length }); return { customerInfo: ci() }; },
  restorePurchases: async () => ({ customerInfo: ci() }),
};
globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { Purchases } } };
globalThis.document = { createElement: () => ({ dataset: {} }), head: { appendChild() {} } };
const { CONFIG } = await import('../www/config.js');
CONFIG.iap.androidKey = 'goog_test';
const { Monetize } = await import('../www/monetize.js');
let fails = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✖ ') + m); if (!c) fails++; };
const got = [];
await Monetize.init();
Monetize.onGrant(g => got.push(g));
ok(got.length === 0, 'alter Kauf aus früherer Version wird nicht doppelt gutgeschrieben');
const info = Monetize.shopInfo();
ok(info.packs.length === 5 && info.packs.every(p => p.price === '1,99 €'), 'Shop zeigt 5 Angebote mit Store-Preisen');
let r = await Monetize.buyCoins('skyrush_coins_large');
ok(r.ok && got.length === 1 && got[0].coins === 15000, 'Kauf 15.000 Münzen → genau eine Gutschrift');
await Monetize.restore();
ok(got.length === 1, 'Wiederherstellen schreibt nichts doppelt gut');
r = await Monetize.buyCoins('skyrush_starter');
ok(got.length === 2 && !got[1].chest && got[1].headstarts === 3 && Monetize.shopInfo().packs.find(p => p.once).owned, 'Starterpaket: Münzen + Kopfstarts, keine Zufallstruhe, danach als gekauft markiert');
r = await Monetize.buyNoAds();
ok(r.ok && Monetize.noAds, 'Werbefrei aktiv nach Kauf');
// Absturz-Fall: Kauf ist im Store durch, App bekommt die Antwort nicht → beim nächsten Abgleich nachgeliefert
txs.push({ productIdentifier: 'skyrush_coins_small', transactionIdentifier: 'crash-1' });
await Monetize.restore();
ok(got.length === 3 && got[2].coins === 2000, 'Kauf nach Absturz wird beim nächsten Abgleich nachgeliefert');
console.log(fails ? `✖ ${fails} Fehler` : '✔ Käufe: alle Prüfungen ok'); process.exit(fails ? 1 : 0);
