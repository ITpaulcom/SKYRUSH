// SKY RUSH – zentrale Konfiguration. Am einfachsten über `npm run setup` ausfüllen.
// Solange testMode=true, werden ausschließlich Googles offizielle Test-Anzeigen geladen.

export const CONFIG = {
  appName: 'SKY RUSH',
  version: '1.0.0',

  // ---------- Server (Netlify) ----------
  // Adresse deiner Netlify-Seite. Leer = Offline-Modus (nur lokale Bestwerte).
  // Wird von `npm run setup` bzw. `npm run deploy` automatisch eingetragen.
  apiBase: 'https://myskyrush.com',

  // ---------- Werbung ----------
  ads: {
    testMode: false,        // false = echte Werbung (Geld verdienen). true = nur Google-Test-Anzeigen
    // AdMob-App-IDs (nicht Anzeigenblock-IDs). Werden per `npm run configure` in die nativen Projekte geschrieben.
    androidAppId: 'ca-app-pub-1764627877115679~2249290128', // Sky Rush Android
    iosAppId:     'ca-app-pub-1764627877115679~5334561968', // Sky Rush iOS
    android: {
      rewarded:     'ca-app-pub-1764627877115679/6549984440', // Android Rewarded
      interstitial: 'ca-app-pub-1764627877115679/6741556130', // Android Interstitial
    },
    ios: {
      rewarded:     'ca-app-pub-1764627877115679/4067291337', // iOS Rewarded
      interstitial: 'ca-app-pub-1764627877115679/6713635970', // iOS Interstitial
    },
    // Deine eigenen Handys als Testgeräte: zeigen echte Anzeigenblöcke, aber als „Testanzeige“ markiert –
    // so kannst du gefahrlos testen, ohne gegen die AdMob-Regeln zu verstoßen (nie auf echte eigene Anzeigen tippen!).
    // Die ID steht beim ersten App-Start im Log (Android Studio → Logcat, Suche „setTestDeviceIds“).
    testDeviceIds: [],
    // Web: Google H5 Games Ads (AdSense). Leer = keine Werbung im Web.
    webPublisherId: '',     // optional, Werbung in der Web-Version: ca-pub-…

    // Faire Taktung – innerhalb der Richtlinien von AdMob, Apple und Google Play.
    interstitial: {
      graceGames: 3,        // erste 3 Läufe komplett ohne Werbepause (wichtig für die Bindung neuer Spieler)
      everyGames: 2,        // danach höchstens nach jedem 2. Lauf …
      minSeconds: 120,      // … und frühestens 120 s nach der letzten Anzeige (auch nach einem Belohnungsvideo)
      maxPerDay: 15,
    },
    rewardedMaxPerDay: 40,

    // Schätzwerte (USD eCPM) nur für das Web und Geräte ohne Paid-Event – native Werte kommen exakt von AdMob.
    estimatedEcpm: { rewarded: 8, interstitial: 4 },
  },

  // ---------- In-App-Käufe (RevenueCat) ----------
  iap: {
    androidKey: 'goog_nmFtLMSQsisVtDiwEnfdEiAuSCd',       // RevenueCat (goog_…) – per npm run setup
    iosKey: '',             // RevenueCat (appl_…) – per npm run setup
    entitlementNoAds: 'no_ads',
    productNoAds: 'skyrush_remove_ads',     // Non-Consumable
    productCoins: 'skyrush_coins_5000',     // Consumable
  },

  // ---------- Spielökonomie ----------
  economy: {
    rescueCoinPrice: 500,
    coinPack: 5000,
    headstartPrice: 300,
    freeCoins: 100,          // Gratis-Münzen pro Werbevideo im Shop
    freeCoinsPerDay: 3,
    dailyBonus: 100,
  },

  // Turnier: 2 kostenlose Versuche pro Woche, +1 per Werbung, bester zählt
  tournament: { freeAttempts: 2, adAttempts: 1 },

  links: {
    privacy: 'privacy.html',     // liegt im Projekt; im Store die Netlify-URL angeben
    imprint: 'impressum.html',
    support: 'mailto:kontakt@itpaul.com',
  },
};
