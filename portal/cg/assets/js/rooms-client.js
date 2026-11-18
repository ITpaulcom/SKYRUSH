/**
 * Sky Rush – Raum-Client
 * ======================
 *
 * Einziger Zugang des Browsers zum Multiplayer-Backend
 * (`/.netlify/functions/multiplayer`).
 *
 * Aufgaben:
 *  - Räume erstellen, betreten, auflisten und verlassen
 *  - Raumzustand regelmäßig abfragen (Polling, alle 800 ms)
 *  - bei Netzwerkfehlern automatisch wiederverbinden:
 *    höchstens 5 Versuche, Wartezeiten 2, 4, 8, 16 und 32 Sekunden
 *
 * Alle Meldungen sind deutsch formuliert und direkt anzeigbar.
 */

/** Wartezeiten zwischen den Wiederverbindungsversuchen in Millisekunden. */
export const WIEDERHOL_VERZOEGERUNGEN = [2000, 4000, 8000, 16000, 32000];

/** Höchstzahl der Wiederverbindungsversuche. */
export const MAX_VERSUCHE = 5;

/** Erlaubte Zeichen im Raumcode (ohne 0/O und 1/I wegen Verwechslung). */
export const CODE_MUSTER = /^[A-HJ-NP-Z2-9]{6}$/;

/** Prüft einen Raumcode und gibt ihn in Großbuchstaben zurück (oder null). */
export function raumCodePruefen(eingabe) {
  const sauber = String(eingabe || '').trim().toUpperCase().replace(/\s+/g, '');
  return CODE_MUSTER.test(sauber) ? sauber : null;
}

/** Ruft das Backend auf und liefert immer ein Objekt mit `ok`. */
async function anfrage(daten, zeitlimit = 8000) {
  const steuerung = new AbortController();
  const uhr = setTimeout(() => steuerung.abort(), zeitlimit);

  try {
    const antwort = await fetch('/.netlify/functions/multiplayer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(daten),
      signal: steuerung.signal
    });

    let koerper = {};
    try {
      koerper = await antwort.json();
    } catch {
      koerper = {};
    }

    if (!antwort.ok) {
      return {
        ok: false,
        fehler: koerper.fehler || `Der Server antwortete mit Fehler ${antwort.status}.`
      };
    }

    return koerper.ok === false
      ? { ok: false, fehler: koerper.fehler || 'Unbekannter Serverfehler.' }
      : { ...koerper, ok: true };
  } catch (ausnahme) {
    const abgebrochen = ausnahme?.name === 'AbortError';
    return {
      ok: false,
      netzfehler: true,
      fehler: abgebrochen
        ? 'Der Server hat nicht rechtzeitig geantwortet.'
        : 'Keine Verbindung zum Spielserver. Läuft der lokale Server (multiplayer.bat)?'
    };
  } finally {
    clearTimeout(uhr);
  }
}

/* ------------------------------------------------------------------ */
/* Einzelne Aufrufe                                                    */
/* ------------------------------------------------------------------ */

export async function raumErstellen(spielerName) {
  return anfrage({ aktion: 'erstellen', spielerName });
}

export async function raumBeitreten(raumCode, spielerName) {
  const code = raumCodePruefen(raumCode);
  if (!code) {
    return { ok: false, fehler: 'Der Raumcode muss aus sechs Zeichen bestehen (ohne 0/O und 1/I).' };
  }
  return anfrage({ aktion: 'beitreten', raumCode: code, spielerName });
}

export async function raumListe() {
  return anfrage({ aktion: 'liste' });
}

/* ------------------------------------------------------------------ */
/* Laufender Raum                                                      */
/* ------------------------------------------------------------------ */

/**
 * Verbindung zu einem Raum: fragt den Zustand im Takt ab, meldet den eigenen
 * Stand und verbindet sich nach Störungen selbstständig neu.
 *
 * Beispiel:
 *   const raum = new RaumClient({ raumCode, spielerId, intervall: 800 });
 *   raum.onZustand = zustand => console.log(zustand.spieler);
 *   raum.onStatus = text => console.log(text);
 *   raum.starten();
 */
export class RaumClient {
  constructor({ raumCode, spielerId, intervall = 800 }) {
    this.raumCode = raumCode;
    this.spielerId = spielerId;
    this.intervall = intervall;

    /** Letzter bekannter Raumzustand (siehe raumOeffentlich im Backend). */
    this.zustand = null;
    this.verbunden = false;
    this.beendet = false;

    /** Wird bei jedem neuen Zustand aufgerufen. */
    this.onZustand = null;
    /** Wird bei Statuswechseln aufgerufen: 'verbunden' | 'getrennt' | 'aufgegeben'. */
    this.onStatus = null;
    /** Wird aufgerufen, wenn der Raum nicht mehr existiert. */
    this.onRaumWeg = null;

    this._uhr = null;
    this._versuch = 0;
    this._laeuft = false;
  }

  /** Startet die Zustandsabfrage (sofort und dann im Takt). */
  starten() {
    if (this._laeuft) return;
    this._laeuft = true;
    this.beendet = false;
    this._abfragen();
  }

  /** Beendet die Abfrage endgültig (z. B. beim Verlassen der Seite). */
  stoppen() {
    this.beendet = true;
    this._laeuft = false;
    clearTimeout(this._uhr);
    this._uhr = null;
  }

  /** Meldet Höhe und Punkte an die Mitspieler. Fehler werden bewusst verschluckt. */
  async standMelden(hoehe, punkte) {
    if (this.beendet) return;
    await anfrage({
      aktion: 'position',
      raumCode: this.raumCode,
      spielerId: this.spielerId,
      hoehe: Math.round(hoehe || 0),
      punkte: Math.round(punkte || 0)
    }, 5000);
  }

  /** Nur der Host darf starten. */
  async starten_runde() {
    return anfrage({ aktion: 'starten', raumCode: this.raumCode, spielerId: this.spielerId });
  }

  /** Verlässt den Raum und beendet die Abfrage. */
  async verlassen() {
    this.stoppen();
    return anfrage({ aktion: 'verlassen', raumCode: this.raumCode, spielerId: this.spielerId }, 5000);
  }

  /* -------------------------------------------------------------- */

  _melden(art) {
    if (typeof this.onStatus === 'function') this.onStatus(art);
  }

  async _abfragen() {
    if (this.beendet) return;

    const ergebnis = await anfrage({
      aktion: 'zustand',
      raumCode: this.raumCode,
      spielerId: this.spielerId
    });

    if (this.beendet) return;

    if (ergebnis.ok) {
      const warVerbunden = this.verbunden;
      this.verbunden = true;
      this._versuch = 0;
      this.zustand = ergebnis.raum;
      if (!warVerbunden) this._melden('verbunden');
      if (typeof this.onZustand === 'function') this.onZustand(ergebnis.raum);
      this._uhr = setTimeout(() => this._abfragen(), this.intervall);
      return;
    }

    // Raum existiert nicht mehr → nicht weiter versuchen
    if (!ergebnis.netzfehler) {
      this.verbunden = false;
      this.stoppen();
      if (typeof this.onRaumWeg === 'function') this.onRaumWeg(ergebnis.fehler);
      return;
    }

    // Netzwerkstörung → Wiederverbindung mit wachsender Wartezeit
    this.verbunden = false;

    if (this._versuch >= MAX_VERSUCHE) {
      this.stoppen();
      this._melden('aufgegeben');
      if (typeof this.onRaumWeg === 'function') {
        this.onRaumWeg('Die Verbindung konnte nach fünf Versuchen nicht wiederhergestellt werden.');
      }
      return;
    }

    const wartezeit = WIEDERHOL_VERZOEGERUNGEN[this._versuch];
    this._versuch++;
    this._melden('getrennt');
    this._uhr = setTimeout(() => this._abfragen(), wartezeit);
  }
}
