/**
 * Local Multiplayer Module
 * Verwaltet lokale Mehrspieler-Sitzungen auf einem Gerät (Hot-Seat / Shared Screen)
 */

const LocalMultiplayer = (() => {
  // Private State
  let players = [];
  let currentPlayerIndex = 0;
  let isGameActive = false;
  let gameMode = 'hotseat'; // 'hotseat' oder 'shared'
  let maxPlayers = 4;
  let eventListeners = {};

  // Player-Klasse
  class Player {
    constructor(id, name, color, controls) {
      this.id = id;
      this.name = name;
      this.color = color;
      this.controls = controls || { up: '', down: '', left: '', right: '', action: '' };
      this.score = 0;
      this.isActive = true;
      this.inputBuffer = [];
    }

    addInput(input) {
      this.inputBuffer.push({
        input,
        timestamp: Date.now()
      });
      // Buffer auf letzte 10 Inputs begrenzen
      if (this.inputBuffer.length > 10) {
        this.inputBuffer.shift();
      }
    }

    clearInputBuffer() {
      this.inputBuffer = [];
    }

    getLatestInput() {
      return this.inputBuffer.length > 0 
        ? this.inputBuffer[this.inputBuffer.length - 1].input 
        : null;
    }
  }

  // Event-System
  function emit(event, data) {
    if (eventListeners[event]) {
      eventListeners[event].forEach(callback => callback(data));
    }
  }

  function on(event, callback) {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(callback);
  }

  function off(event, callback) {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
    }
  }

  // Öffentliche API
  return {
    /**
     * Initialisiert das Local-Multiplayer-Modul
     * @param {Object} config - Konfiguration
     * @param {number} config.maxPlayers - Maximale Spieleranzahl (2-4)
     * @param {string} config.mode - Spielmodus ('hotseat' oder 'shared')
     */
    init(config = {}) {
      maxPlayers = Math.min(4, Math.max(2, config.maxPlayers || 2));
      gameMode = config.mode || 'hotseat';
      players = [];
      currentPlayerIndex = 0;
      isGameActive = false;
      console.log('[LocalMultiplayer] Initialisiert:', { maxPlayers, gameMode });
      emit('initialized', { maxPlayers, gameMode });
    },

    /**
     * Fügt einen neuen Spieler hinzu
     * @param {string} name - Spielername
     * @param {string} color - Spielerfarbe (Hex oder CSS-Name)
     * @param {Object} controls - Steuerungskonfiguration
     * @returns {Player|null}
     */
    addPlayer(name, color = '#ffffff', controls = null) {
      if (players.length >= maxPlayers) {
        console.warn('[LocalMultiplayer] Maximale Spieleranzahl erreicht');
        emit('error', { code: 'MAX_PLAYERS', message: 'Maximale Spieleranzahl erreicht' });
        return null;
      }

      const id = `player_${players.length + 1}`;
      const player = new Player(id, name, color, controls);
      players.push(player);

      console.log('[LocalMultiplayer] Spieler hinzugefügt:', name);
      emit('playerAdded', { player, playerCount: players.length });

      if (players.length === 1) {
        currentPlayerIndex = 0;
      }

      return player;
    },

    /**
     * Entfernt einen Spieler
     * @param {string} playerId - Spieler-ID
     * @returns {boolean}
     */
    removePlayer(playerId) {
      const index = players.findIndex(p => p.id === playerId);
      if (index === -1) return false;

      const removedPlayer = players[index];
      players.splice(index, 1);

      // Current Player Index anpassen
      if (index <= currentPlayerIndex && currentPlayerIndex > 0) {
        currentPlayerIndex--;
      }

      console.log('[LocalMultiplayer] Spieler entfernt:', removedPlayer.name);
      emit('playerRemoved', { player: removedPlayer, playerCount: players.length });

      return true;
    },

    /**
     * Startet eine Multiplayer-Sitzung
     * @returns {boolean}
     */
    startGame() {
      if (players.length < 2) {
        console.warn('[LocalMultiplayer] Mindestens 2 Spieler erforderlich');
        emit('error', { code: 'NOT_ENOUGH_PLAYERS', message: 'Mindestens 2 Spieler erforderlich' });
        return false;
      }

      isGameActive = true;
      currentPlayerIndex = 0;

      // Alle Spieler aktivieren
      players.forEach(p => p.isActive = true);

      console.log('[LocalMultiplayer] Spiel gestartet mit', players.length, 'Spielern');
      emit('gameStarted', { players, currentPlayer: this.getCurrentPlayer() });

      return true;
    },

    /**
     * Beendet die aktuelle Multiplayer-Sitzung
     */
    endGame() {
      isGameActive = false;
      currentPlayerIndex = 0;

      // Spieler-Eingaben leeren
      players.forEach(p => p.clearInputBuffer());

      console.log('[LocalMultiplayer] Spiel beendet');
      emit('gameEnded', { players });
    },

    /**
     * Wechselt zum nächsten Spieler (Hot-Seat-Modus)
     * @returns {Player|null}
     */
    nextPlayer() {
      if (!isGameActive || gameMode !== 'hotseat') return null;

      const previousIndex = currentPlayerIndex;
      currentPlayerIndex = (currentPlayerIndex + 1) % players.length;

      // Inaktive Spieler überspringen
      let attempts = 0;
      while (!players[currentPlayerIndex].isActive && attempts < players.length) {
        currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
        attempts++;
      }

      const player = this.getCurrentPlayer();
      console.log('[LocalMultiplayer] Spielerwechsel:', player?.name);
      emit('playerTurn', { player, previousPlayer: players[previousIndex] });

      return player;
    },

    /**
     * Gibt den aktuellen Spieler zurück
     * @returns {Player|null}
     */
    getCurrentPlayer() {
      return players[currentPlayerIndex] || null;
    },

    /**
     * Gibt alle Spieler zurück
     * @returns {Player[]}
     */
    getPlayers() {
      return [...players];
    },

    /**
     * Registriert Eingabe für den aktuellen Spieler
     * @param {Object} input - Eingabedaten
     */
    registerInput(input) {
      if (!isGameActive) return;

      const player = this.getCurrentPlayer();
      if (player) {
        player.addInput(input);
        emit('inputRegistered', { player, input });
      }
    },

    /**
     * Setzt den Score eines Spielers
     * @param {string} playerId - Spieler-ID
     * @param {number} score - Neuer Score
     */
    setPlayerScore(playerId, score) {
      const player = players.find(p => p.id === playerId);
      if (player) {
        const oldScore = player.score;
        player.score = score;
        console.log('[LocalMultiplayer] Score aktualisiert:', player.name, oldScore, '->', score);
        emit('scoreUpdated', { player, oldScore, newScore: score });
      }
    },

    /**
     * Addiert Punkte zum Score eines Spielers
     * @param {string} playerId - Spieler-ID
     * @param {number} points - Punkte
     */
    addPlayerPoints(playerId, points) {
      const player = players.find(p => p.id === playerId);
      if (player) {
        const oldScore = player.score;
        player.score += points;
        console.log('[LocalMultiplayer] Punkte addiert:', player.name, '+', points);
        emit('scoreUpdated', { player, oldScore, newScore: player.score });
      }
    },

    /**
     * Gibt den Gewinner zurück (Spieler mit höchstem Score)
     * @returns {Player|null}
     */
    getWinner() {
      if (players.length === 0) return null;
      return players.reduce((max, p) => p.score > max.score ? p : max);
    },

    /**
     * Rangliste aller Spieler (nach Score sortiert)
     * @returns {Player[]}
     */
    getLeaderboard() {
      return [...players].sort((a, b) => b.score - a.score);
    },

    /**
     * Deaktiviert einen Spieler temporär
     * @param {string} playerId - Spieler-ID
     */
    deactivatePlayer(playerId) {
      const player = players.find(p => p.id === playerId);
      if (player) {
        player.isActive = false;
        console.log('[LocalMultiplayer] Spieler deaktiviert:', player.name);
        emit('playerDeactivated', { player });

        // Wenn aktueller Spieler deaktiviert wurde, weiterschalten
        if (player === this.getCurrentPlayer() && isGameActive) {
          this.nextPlayer();
        }
      }
    },

    /**
     * Aktiviert einen Spieler wieder
     * @param {string} playerId - Spieler-ID
     */
    activatePlayer(playerId) {
      const player = players.find(p => p.id === playerId);
      if (player) {
        player.isActive = true;
        console.log('[LocalMultiplayer] Spieler aktiviert:', player.name);
        emit('playerActivated', { player });
      }
    },

    /**
     * Setzt alle Scores zurück
     */
    resetScores() {
      players.forEach(p => {
        p.score = 0;
      });
      console.log('[LocalMultiplayer] Alle Scores zurückgesetzt');
      emit('scoresReset', { players });
    },

    /**
     * Event-Listener registrieren
     * @param {string} event - Event-Name
     * @param {Function} callback - Callback-Funktion
     */
    on,

    /**
     * Event-Listener entfernen
     * @param {string} event - Event-Name
     * @param {Function} callback - Callback-Funktion
     */
    off,

    /**
     * Status des Multiplayer-Moduls
     * @returns {Object}
     */
    getStatus() {
      return {
        isGameActive,
        gameMode,
        maxPlayers,
        playerCount: players.length,
        currentPlayerIndex,
        currentPlayer: this.getCurrentPlayer()?.name || null,
        players: players.map(p => ({
          id: p.id,
          name: p.name,
          color: p.color,
          score: p.score,
          isActive: p.isActive
        }))
      };
    },

    /**
     * Reset des gesamten Moduls
     */
    reset() {
      this.endGame();
      players = [];
      currentPlayerIndex = 0;
      eventListeners = {};
      console.log('[LocalMultiplayer] Modul zurückgesetzt');
      emit('reset');
    }
  };
})();

// Export für verschiedene Module-Systeme
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LocalMultiplayer;
} else if (typeof window !== 'undefined') {
  window.LocalMultiplayer = LocalMultiplayer;
}
