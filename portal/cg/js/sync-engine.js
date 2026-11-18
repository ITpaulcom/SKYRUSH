/**
 * Sync-Engine für Sky Rush Multiplayer
 * Wrapper um core.js – synchronisiert Positionen, Score und Spielzustand
 * Unterstützt lokalen Multiplayer (4 Spieler) und Online-Synchronisation
 */

import { createGame, step, input, RULES } from './core.js'

/**
 * Synchronisations-Engine
 * Kapselt den Spielzustand und koordiniert Updates zwischen Clients
 */
export class SyncEngine {
  constructor (mode = 'local') {
    this.mode = mode // 'local' oder 'online'
    this.gameState = null
    this.players = [] // [{ id, x, y, score, color, eliminated }]
    this.localPlayerId = null
    this.remotePlayers = new Map() // id → { x, y, score, lastUpdate }
    this.interpolationBuffer = [] // Für Online-Smooth
    this.tickRate = 60 // [PLATZHALTER] – Updates pro Sekunde
    this.lastTick = 0
    this.isRunning = false
    this.callbacks = new Map()
  }

  /**
   * Initialisiert die Engine für einen Spielmodus
   * @param {string} mode - 'local' oder 'online'
   * @param {number} playerCount - Anzahl der Spieler (1-4)
   * @param {string} seed - Spiel-Seed für Determinismus
   */
  init (mode, playerCount = 1, seed = Date.now().toString()) {
    this.mode = mode
    this.players = []
    this.remotePlayers.clear()
    this.interpolationBuffer = []

    // Spielzustand erstellen
    this.gameState = createGame(seed, 'endless', {
      multiplayer: true,
      playerCount: Math.min(Math.max(playerCount, 1), 4) // [PLATZHALTER] – max 4
    })

    // Spieler anlegen
    const colors = ['#FF9AA8', '#4ECDC4', '#FFE66D', '#95E1D3'] // [PLATZHALTER] – Design-Farben
    for (let i = 0; i < playerCount; i++) {
      this.players.push({
        id: i,
        x: RULES.LANES * 0.5, // Start in der Mitte
        y: RULES.PLAYER_START_Y || 0, // [PLATZHALTER] – aus core.js
        score: 0,
        color: colors[i],
        eliminated: false,
        lane: Math.floor(RULES.LANES / 2)
      })
    }

    this.localPlayerId = 0 // Spieler 1 ist lokal
    this.isRunning = false

    this.emit('init', { mode, playerCount, seed })
    return this
  }

  /**
   * Startet den Spiel-Loop
   */
  start () {
    if (this.isRunning) return
    this.isRunning = true
    this.lastTick = performance.now()
    this.emit('start')
    this._tick()
  }

  /**
   * Stoppt den Spiel-Loop
   */
  stop () {
    this.isRunning = false
    this.emit('stop')
  }

  /**
   * Haupt-Tick – aktualisiert alle Spieler
   */
  _tick () {
    if (!this.isRunning) return

    const now = performance.now()
    const delta = (now - this.lastTick) / 1000
    this.lastTick = now

    // Spielkern-Update für jeden lokalen Spieler
    for (const player of this.players) {
      if (player.eliminated) continue

      // Core-Step ausführen
      if (this.gameState) {
        step(this.gameState)
      }

      // Position aktualisieren (wird von input() beeinflusst)
      this._updatePlayerPosition(player, delta)
    }

    // Online: Remote-Spieler interpolieren
    if (this.mode === 'online') {
      this._interpolateRemotePlayers(delta)
    }

    // State an Listener senden
    this.emit('update', this.getFullState())

    // Nächster Tick
    const tickInterval = 1000 / this.tickRate
    const nextTick = Math.max(0, tickInterval - (performance.now() - now))
    setTimeout(() => this._tick(), nextTick)
  }

  /**
   * Aktualisiert die Position eines Spielers
   * @private
   */
  _updatePlayerPosition (player, delta) {
    // Gravitation anwenden
    const gravity = RULES.GRAVITY || 9.8 // [PLATZHALTER] – aus core.js
    player.y -= gravity * delta * 50 // [PLATZHALTER] – Skalierung

    // Plattform-Kollision (vereinfacht)
    if (this.gameState && this.gameState.platforms) {
      for (const platform of this.gameState.platforms) {
        if (
          player.lane === platform.lane &&
          player.y <= platform.y + 10 && // [PLATZHALTER] – Toleranz
          player.y >= platform.y - 10 &&
          player.y - (gravity * delta * 50) > platform.y
        ) {
          player.y = platform.y
          // Doppelsprung-Logik hier
        }
      }
    }

    // Grenzen prüfen
    player.lane = Math.max(0, Math.min(RULES.LANES - 1, player.lane))
  }

  /**
   * Interpoliert Remote-Spieler für smooth Bewegung
   * @private
   */
  _interpolateRemotePlayers (delta) {
    for (const [id, remote] of this.remotePlayers) {
      if (!remote.buffer || remote.buffer.length < 2) continue

      // Älteste States entfernen
      const now = performance.now()
      remote.buffer = remote.buffer.filter(
        (state) => now - state.time < 200 // [PLATZHALTER] – 200ms Buffer
      )

      // Interpolation
      if (remote.buffer.length >= 2) {
        const t = (now - remote.buffer[0].time) / (remote.buffer[1].time - remote.buffer[0].time)
        const prev = remote.buffer[0]
        const next = remote.buffer[1]

        remote.x = prev.x + (next.x - prev.x) * t
        remote.y = prev.y + (next.y - prev.y) * t
      }
    }
  }

  /**
   * Verarbeitet Eingabe für einen Spieler
   * @param {number} playerId - Spieler-ID
   * @param {string} action - 'left', 'right', 'up', 'down', 'jump'
   */
  handleInput (playerId, action) {
    const player = this.players[playerId]
    if (!player || player.eliminated) return

    // Eingabe an Core senden
    if (this.gameState) {
      const inputCode = this._actionToInputCode(action)
      input(this.gameState, inputCode)
    }

    // Lokale Aktion
    switch (action) {
      case 'left':
        player.lane = Math.max(0, player.lane - 1)
        break
      case 'right':
        player.lane = Math.min(RULES.LANES - 1, player.lane + 1)
        break
      case 'jump':
        player.y += 100 // [PLATZHALTER] – Sprungkraft
        break
      case 'down':
        player.y -= 50 // [PLATZHALTER] – Durchfallen
        break
    }

    this.emit('input', { playerId, action })

    // Online: Eingabe an Server senden
    if (this.mode === 'online') {
      this.emit('networkInput', { playerId, action, timestamp: performance.now() })
    }
  }

  /**
   * Wandelt Action in Core-Input-Code um
   * @private
   */
  _actionToInputCode (action) {
    const map = {
      left: 'ArrowLeft',
      right: 'ArrowRight',
      jump: 'Space',
      down: 'ArrowDown'
    }
    return map[action] || ''
  }

  /**
   * Empfängt Remote-Spieler-Update (Online-Modus)
   * @param {number} playerId - Remote-Spieler-ID
   * @param {object} state - { x, y, score, lane }
   */
  receiveRemoteState (playerId, state) {
    if (!this.remotePlayers.has(playerId)) {
      this.remotePlayers.set(playerId, {
        id: playerId,
        x: state.x || 0,
        y: state.y || 0,
        score: state.score || 0,
        lane: state.lane || 0,
        buffer: [],
        lastUpdate: performance.now()
      })
    }

    const remote = this.remotePlayers.get(playerId)
    remote.x = state.x
    remote.y = state.y
    remote.score = state.score
    remote.lane = state.lane
    remote.lastUpdate = performance.now()

    // Für Interpolation puffern
    remote.buffer.push({
      x: state.x,
      y: state.y,
      time: performance.now()
    })

    this.emit('remoteUpdate', { playerId, state })
  }

  /**
   * Setzt Score für einen Spieler
   * @param {number} playerId - Spieler-ID
   * @param {number} score - Neuer Score
   */
  setScore (playerId, score) {
    if (this.players[playerId]) {
      this.players[playerId].score = score
      this.emit('scoreUpdate', { playerId, score })
    }
  }

  /**
   * Markiert Spieler als eliminiert
   * @param {number} playerId - Spieler-ID
   */
  eliminatePlayer (playerId) {
    if (this.players[playerId]) {
      this.players[playerId].eliminated = true
      this.emit('playerEliminated', { playerId })

      // Spielende prüfen
      const activePlayers = this.players.filter((p) => !p.eliminated)
      if (activePlayers.length <= 1 && this.players.length > 1) {
        this.endGame(activePlayers[0]?.id || -1)
      }
    }
  }

  /**
   * Beendet das Spiel
   * @param {number} winnerId - Gewinner-Spieler-ID (-1 für Unentschieden)
   */
  endGame (winnerId = -1) {
    this.stop()
    this.emit('gameOver', { winnerId, finalScores: this.players.map((p) => p.score) })
  }

  /**
   * Setzt das Spiel zurück
   */
  reset () {
    const seed = Date.now().toString()
    const playerCount = this.players.length
    this.stop()
    this.init(this.mode, playerCount, seed)
    this.emit('reset')
  }

  /**
   * Gibt den vollständigen Spielzustand zurück
   * @returns {object} - { players, remotePlayers, gameState, isRunning }
   */
  getFullState () {
    return {
      players: this.players.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        score: p.score,
        color: p.color,
        eliminated: p.eliminated,
        lane: p.lane
      })),
      remotePlayers: Array.from(this.remotePlayers.values()).map((r) => ({
        id: r.id,
        x: r.x,
        y: r.y,
        score: r.score,
        lane: r.lane
      })),
      gameState: this.gameState,
      isRunning: this.isRunning,
      mode: this.mode,
      tickRate: this.tickRate
    }
  }

  /**
   * Registriert Event-Listener
   * @param {string} event - Event-Name
   * @param {function} callback - Callback-Funktion
   */
  on (event, callback) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, [])
    }
    this.callbacks.get(event).push(callback)
  }

  /**
   * Entfernt Event-Listener
   * @param {string} event - Event-Name
   * @param {function} callback - Callback-Funktion
   */
  off (event, callback) {
    if (!this.callbacks.has(event)) return
    const list = this.callbacks.get(event)
    const index = list.indexOf(callback)
    if (index > -1) {
      list.splice(index, 1)
    }
  }

  /**
   * Feuert Event an alle Listener
   * @private
   */
  emit (event, data) {
    if (!this.callbacks.has(event)) return
    for (const callback of this.callbacks.get(event)) {
      try {
        callback(data)
      } catch (err) {
        console.error(`[SyncEngine] Event-Callback-Fehler für "${event}":`, err)
      }
    }
  }
}

/**
 * Erstellt eine neue SyncEngine-Instanz
 * @param {string} mode - 'local' oder 'online'
 * @returns {SyncEngine}
 */
export function createSyncEngine (mode = 'local') {
  return new SyncEngine(mode)
}

// Export für Window (Fallback)
if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine
  window.createSyncEngine = createSyncEngine
}