/**
 * Sky Rush - Spielkern (Core)
 * Hauptspiel-Engine mit lokalem Multiplayer
 * 
 * @version 1.0.0
 * @author ITpaul
 * @license MIT
 */

// ==================== SPIELKONFIGURATION ====================
const SPIEL_CONFIG = {
  spielFeldBreite: 800,
  spielFeldHoehe: 600,
  spielerGeschwindigkeit: 5,
  maxLeben: 3,
  spielDauer: 90, // Sekunden
  fps: 60
};

// ==================== SPIELZUSTAND ====================
let spielZustand = {
  istAktiv: false,
  istPausiert: false,
  verbleibendeZeit: SPIEL_CONFIG.spielDauer,
  spieler: [],
  punkte: [],
  spielModus: 'lokal' // 'lokal' oder 'online'
};

// ==================== PLAYER SPRITE PFAD ====================
const PLAYER_SPRITES = {
  1: 'assets/player1.png',
  2: 'assets/player2.png',
  3: 'assets/player3.png',
  4: 'assets/player4.png'
};

// ==================== INITIALISIERUNG ====================
/**
 * Initialisiert den Spielkern
 * @param {HTMLElement} canvas - Das Canvas-Element für das Rendering
 * @param {string} modus - Spielmodus: 'lokal' oder 'online'
 */
function spielInitialisieren(canvas, modus = 'lokal') {
  if (!canvas) {
    console.error('[Core] Canvas-Element nicht gefunden');
    return false;
  }

  spielZustand.spielModus = modus;
  spielZustand.istAktiv = false;
  spielZustand.istPausiert = false;
  spielZustand.verbleibendeZeit = SPIEL_CONFIG.spielDauer;
  spielZustand.spieler = [];
  spielZustand.punkte = [];

  console.log(`[Core] Spielkern initialisiert - Modus: ${modus}`);
  return true;
}

// ==================== SPIELER VERWALTUNG ====================
/**
 * Fügt einen Spieler zum Spiel hinzu
 * @param {number} spielerNummer - Spielernummer (1-4)
 * @param {Object} startPosition - Startposition {x, y}
 * @returns {boolean} Erfolg
 */
function spielerHinzufuegen(spielerNummer, startPosition) {
  if (spielerNummer < 1 || spielerNummer > 4) {
    console.error('[Core] Ungültige Spielernummer:', spielerNummer);
    return false;
  }

  if (spielZustand.spieler[spielerNummer - 1]) {
    console.warn('[Core] Spieler', spielerNummer, 'bereits vorhanden');
    return false;
  }

  const spieler = {
    nummer: spielerNummer,
    x: startPosition?.x || 100,
    y: startPosition?.y || 100,
    leben: SPIEL_CONFIG.maxLeben,
    punkte: 0,
    istAktiv: true,
    sprite: PLAYER_SPRITES[spielerNummer]
  };

  spielZustand.spieler[spielerNummer - 1] = spieler;
  spielZustand.punkte[spielerNummer - 1] = 0;

  console.log(`[Core] Spieler ${spielerNummer} hinzugefügt bei (${spieler.x}, ${spieler.y})`);
  return true;
}

/**
 * Entfernt einen Spieler aus dem Spiel
 * @param {number} spielerNummer - Spielernummer (1-4)
 */
function spielerEntfernen(spielerNummer) {
  if (spielerNummer >= 1 && spielerNummer <= 4) {
    spielZustand.spieler[spielerNummer - 1] = null;
    spielZustand.punkte[spielerNummer - 1] = 0;
    console.log(`[Core] Spieler ${spielerNummer} entfernt`);
  }
}

/**
 * Gibt alle aktiven Spieler zurück
 * @returns {Array} Array von Spielern
 */
function spielerHolen() {
  return spielZustand.spieler.filter(s => s !== null && s.istAktiv);
}

// ==================== SPIELER BEWEGUNG ====================
/**
 * Bewegt einen Spieler
 * @param {number} spielerNummer - Spielernummer (1-4)
 * @param {string} richtung - Bewegungsrichtung: 'hoch', 'runter', 'links', 'rechts'
 */
function spielerBewegen(spielerNummer, richtung) {
  const spieler = spielZustand.spieler[spielerNummer - 1];
  if (!spieler || !spieler.istAktiv) return;

  const geschw = SPIEL_CONFIG.spielerGeschwindigkeit;

  switch (richtung) {
    case 'hoch':
      spieler.y = Math.max(0, spieler.y - geschw);
      break;
    case 'runter':
      spieler.y = Math.min(SPIEL_CONFIG.spielFeldHoehe - 50, spieler.y + geschw);
      break;
    case 'links':
      spieler.x = Math.max(0, spieler.x - geschw);
      break;
    case 'rechts':
      spieler.x = Math.min(SPIEL_CONFIG.spielFeldBreite - 50, spieler.x + geschw);
      break;
  }

  // Event feuern für Multiplayer-Sync
  if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
    window.multiplayerLocal.eventFeuern('playerMoved', {
      spielerNummer: spielerNummer,
      x: spieler.x,
      y: spieler.y,
      richtung: richtung
    });
  }
}

// ==================== PUNKTE SYSTEM ====================
/**
 * Aktualisiert die Punkte eines Spielers
 * @param {number} spielerNummer - Spielernummer (1-4)
 * @param {number} aenderung - Punkteänderung (positiv oder negativ)
 */
function punkteAktualisieren(spielerNummer, aenderung) {
  if (spielerNummer < 1 || spielerNummer > 4) return;

  const spieler = spielZustand.spieler[spielerNummer - 1];
  if (!spieler) return;

  spieler.punkte += aenderung;
  spielZustand.punkte[spielerNummer - 1] = spieler.punkte;

  // Event feuern für UI-Update
  if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
    window.multiplayerLocal.eventFeuern('scoreUpdate', {
      spielerNummer: spielerNummer,
      punkte: spieler.punkte,
      gesamtPunkte: spielZustand.punkte
    });
  }

  console.log(`[Core] Spieler ${spielerNummer}: ${formatiereZahl(spieler.punkte)} Punkte`);
}

/**
 * Gibt die aktuellen Punkte aller Spieler zurück
 * @returns {Array} Punkte-Array
 */
function punkteHolen() {
  return [...spielZustand.punkte];
}

// ==================== LEBEN SYSTEM ====================
/**
 * Aktualisiert die Leben eines Spielers
 * @param {number} spielerNummer - Spielernummer (1-4)
 * @param {number} aenderung - Lebensänderung (negativ für Schaden)
 */
function lebenAktualisieren(spielerNummer, aenderung) {
  if (spielerNummer < 1 || spielerNummer > 4) return;

  const spieler = spielZustand.spieler[spielerNummer - 1];
  if (!spieler) return;

  spieler.leben = Math.max(0, spieler.leben + aenderung);

  // Event feuern für UI-Update
  if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
    window.multiplayerLocal.eventFeuern('lifeUpdate', {
      spielerNummer: spielerNummer,
      leben: spieler.leben,
      maxLeben: SPIEL_CONFIG.maxLeben
    });
  }

  // Spieler eliminieren wenn keine Leben mehr
  if (spieler.leben <= 0) {
    spielerEliminieren(spielerNummer);
  }
}

/**
 * Eliminiert einen Spieler aus dem Spiel
 * @param {number} spielerNummer - Spielernummer (1-4)
 */
function spielerEliminieren(spielerNummer) {
  const spieler = spielZustand.spieler[spielerNummer - 1];
  if (!spieler) return;

  spieler.istAktiv = false;

  if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
    window.multiplayerLocal.eventFeuern('playerEliminated', {
      spielerNummer: spielerNummer,
      verbleibendeSpieler: spielZustand.spieler.filter(s => s && s.istAktiv).length
    });
  }

  console.log(`[Core] Spieler ${spielerNummer} eliminiert`);
  
  // Spielende prüfen
  spielEndePrufen();
}

// ==================== SPIEL STEUERUNG ====================
/**
 * Startet das Spiel
 */
function spielStarten() {
  if (spielZustand.istAktiv) {
    console.warn('[Core] Spiel bereits aktiv');
    return;
  }

  spielZustand.istAktiv = true;
  spielZustand.istPausiert = false;
  spielZustand.verbleibendeZeit = SPIEL_CONFIG.spielDauer;

  if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
    window.multiplayerLocal.eventFeuern('gameStart', {
      modus: spielZustand.spielModus,
      spielerAnzahl: spielZustand.spieler.filter(s => s).length,
      dauer: spielZustand.verbleibendeZeit
    });
  }

  console.log('[Core] Spiel gestartet');
  spielSchleifeStarten();
}

/**
 * Stoppt das Spiel
 */
function spielStoppen() {
  if (!spielZustand.istAktiv) return;

  spielZustand.istAktiv = false;
  spielZustand.istPausiert = true;

  if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
    window.multiplayerLocal.eventFeuern('gameStop', {
      verbleibendeZeit: spielZustand.verbleibendeZeit,
      punkte: spielZustand.punkte
    });
  }

  console.log('[Core] Spiel gestoppt');
}

/**
 * Setzt das Spiel zurück
 */
function spielZuruecksetzen() {
  spielZustand.istAktiv = false;
  spielZustand.istPausiert = false;
  spielZustand.verbleibendeZeit = SPIEL_CONFIG.spielDauer;

  // Alle Spieler zurücksetzen
  spielZustand.spieler.forEach((spieler, index) => {
    if (spieler) {
      spieler.x = 100;
      spieler.y = 100;
      spieler.leben = SPIEL_CONFIG.maxLeben;
      spieler.punkte = 0;
      spieler.istAktiv = true;
      spielZustand.punkte[index] = 0;
    }
  });

  if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
    window.multiplayerLocal.eventFeuern('gameReset', {
      spieler: spielZustand.spieler,
      punkte: spielZustand.punkte
    });
  }

  console.log('[Core] Spiel zurückgesetzt');
}

/**
 * Pausiert das Spiel
 */
function spielPausieren() {
  spielZustand.istPausiert = true;
  console.log('[Core] Spiel pausiert');
}

/**
 * Setzt das Spiel fort
 */
function spielFortsetzen() {
  spielZustand.istPausiert = false;
  console.log('[Core] Spiel fortgesetzt');
  spielSchleifeStarten();
}

// ==================== SPIEL SCHLEIFE ====================
let spielSchleifeId = null;
let letzteZeit = 0;

/**
 * Startet die Hauptspielschleife
 */
function spielSchleifeStarten() {
  if (spielSchleifeId) {
    cancelAnimationFrame(spielSchleifeId);
  }
  letzteZeit = performance.now();
  spielSchleifeId = requestAnimationFrame(spielSchleife);
}

/**
 * Hauptspielschleife
 * @param {number} zeit - Aktuelle Zeit
 */
function spielSchleife(zeit) {
  if (!spielZustand.istAktiv || spielZustand.istPausiert) return;

  const delta = (zeit - letzteZeit) / 1000;
  letzteZeit = zeit;

  // Zeit aktualisieren
  spielZustand.verbleibendeZeit -= delta;
  if (spielZustand.verbleibendeZeit <= 0) {
    spielZustand.verbleibendeZeit = 0;
    spielBeenden();
    return;
  }

  // Game Update Event feuern
  if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
    window.multiplayerLocal.eventFeuern('gameUpdate', {
      zeit: spielZustand.verbleibendeZeit,
      spieler: spielZustand.spieler,
      punkte: spielZustand.punkte
    });
  }

  // Kollisionserkennung für lokalen Multiplayer
  if (spielZustand.spielModus === 'lokal' && spielZustand.istAktiv) {
    kollisionenPruefen();
  }

  // Weiter rendern
  spielSchleifeId = requestAnimationFrame(spielSchleife);
}

/**
 * Beendet das Spiel und ermittelt Gewinner
 */
function spielBeenden() {
  spielZustand.istAktiv = false;
  
  const gewinner = gewinnerErmitteln();

  if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
    window.multiplayerLocal.eventFeuern('gameOver', {
      gewinner: gewinner,
      punkte: spielZustand.punkte,
      spielModus: spielZustand.spielModus
    });
  }

  console.log('[Core] Spiel beendet - Gewinner:', gewinner);
}

/**
 * Prüft ob das Spiel beendet werden soll
 */
function spielEndePrufen() {
  const aktiveSpieler = spielZustand.spieler.filter(s => s && s.istAktiv);
  
  if (aktiveSpieler.length <= 1) {
    spielBeenden();
  }
}

/**
 * Ermittelt den Gewinner des Spiels
 * @returns {Object|null} Gewinner-Info oder null
 */
function gewinnerErmitteln() {
  let maxPunkte = -1;
  let gewinner = null;

  spielZustand.spieler.forEach((spieler, index) => {
    if (spieler && spieler.punkte > maxPunkte) {
      maxPunkte = spieler.punkte;
      gewinner = {
        nummer: index + 1,
        punkte: spieler.punkte
      };
    }
  });

  return gewinner;
}

// ==================== HILFSFUNKTIONEN ====================
/**
 * Formatieren einer Zahl als PLATZHALTER
 * @param {number} zahl - Die zu formatierende Zahl
 * @returns {string} Formatierter String
 */
function formatiereZahl(zahl) {
  return `[PLATZHALTER:${zahl}]`;
}

/**
 * Gibt den aktuellen Spielzustand zurück
 * @returns {Object} Spielzustand
 */
function zustandHolen() {
  return {
    istAktiv: spielZustand.istAktiv,
    istPausiert: spielZustand.istPausiert,
    verbleibendeZeit: spielZustand.verbleibendeZeit,
    spielerAnzahl: spielZustand.spieler.filter(s => s).length,
    modus: spielZustand.spielModus
  };
}

/**
 * Kollisionsprüfung zwischen zwei Spielern
 * @param {number} spieler1Nummer - Spielernummer 1
 * @param {number} spieler2Nummer - Spielernummer 2
 * @param {number} abstand - Mindestabstand in Pixeln
 * @returns {boolean} true bei Kollision
 */
function kollisionPruefen(spieler1Nummer, spieler2Nummer, abstand = 50) {
  const s1 = spielZustand.spieler[spieler1Nummer - 1];
  const s2 = spielZustand.spieler[spieler2Nummer - 1];

  if (!s1 || !s2) return false;

  const dx = s1.x - s2.x;
  const dy = s1.y - s2.y;
  const distanz = Math.sqrt(dx * dx + dy * dy);

  return distanz < abstand;
}

/**
 * Prüft alle Spieler auf Kollisionen und wendet Abstoßung an
 * Wird automatisch in der Spielschleife aufgerufen
 */
function kollisionenPruefen() {
  const aktiveSpieler = spielZustand.spieler.filter(s => s && s.istAktiv);
  
  for (let i = 0; i < aktiveSpieler.length; i++) {
    for (let j = i + 1; j < aktiveSpieler.length; j++) {
      const a = aktiveSpieler[i];
      const b = aktiveSpieler[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distanz = Math.sqrt(dx * dx + dy * dy);
      const minAbstand = 40;
      
      if (distanz < minAbstand && distanz > 0) {
        const ausweichKraft = (minAbstand - distanz) / 2;
        const richtungX = dx / distanz;
        const richtungY = dy / distanz;
        
        a.x += richtungX * ausweichKraft;
        a.y += richtungY * ausweichKraft;
        b.x -= richtungX * ausweichKraft;
        b.y -= richtungY * ausweichKraft;
        
        if (window.multiplayerLocal && window.multiplayerLocal.eventFeuern) {
          window.multiplayerLocal.eventFeuern('collision', {
            spieler1: a.nummer,
            spieler2: b.nummer
          });
        }
      }
    }
  }
}

// ==================== EXPORT FÜR MODULE ====================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    spielInitialisieren,
    spielerHinzufuegen,
    spielerEntfernen,
    spielerHolen,
    spielerBewegen,
    punkteAktualisieren,
    punkteHolen,
    lebenAktualisieren,
    spielerEliminieren,
    spielStarten,
    spielStoppen,
    spielZuruecksetzen,
    spielPausieren,
    spielFortsetzen,
    spielBeenden,
    gewinnerErmitteln,
    zustandHolen,
    kollisionPruefen,
    formatiereZahl,
    SPIEL_CONFIG
  };
}

// Globale Verfügbarkeit für Browser
window.skyRushCore = {
  spielInitialisieren,
  spielerHinzufuegen,
  spielerEntfernen,
  spielerHolen,
  spielerBewegen,
  punkteAktualisieren,
  punkteHolen,
  lebenAktualisieren,
  spielerEliminieren,
  spielStarten,
  spielStoppen,
  spielZuruecksetzen,
  spielPausieren,
  spielFortsetzen,
  spielBeenden,
  gewinnerErmitteln,
  zustandHolen,
  kollisionPruefen,
  formatiereZahl,
  SPIEL_CONFIG
};

console.log('[Core] Sky Rush Spielkern geladen - Version 1.0.0');
