/**
 * Sky Rush - Network Multiplayer Module
 * Verantwortlich für Netzwerk-Kommunikation, Spieler-Synchronisation und Spielzustände
 */

export class NetMultiplayer {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'ws://localhost:8080';
    this.playerId = null;
    this.sessionId = null;
    this.ws = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.players = new Map();
    this.messageHandlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    this.reconnectDelay = options.reconnectDelay || 1000;
    this.pingInterval = null;
    this.lastPong = null;
    this.connectionTimeout = options.connectionTimeout || 10000;
    this.messageQueue = [];
    this.sequenceNumber = 0;
    
    // Spielzustand
    this.gameState = {
      status: 'idle', // idle, lobby, playing, finished
      host: null,
      maxPlayers: options.maxPlayers || 8,
      map: null,
      startTime: null,
      endTime: null
    };
    
    // Lokaler Spieler
    this.localPlayer = {
      id: null,
      name: options.playerName || 'Player',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      score: 0,
      isAlive: true,
      lastUpdate: null
    };
    
    this._registerDefaultHandlers();
  }

  /**
   * Standard-Message-Handler registrieren
   */
  _registerDefaultHandlers() {
    this.on('welcome', (data) => {
      this.playerId = data.playerId;
      this.sessionId = data.sessionId;
      this.localPlayer.id = data.playerId;
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this._flushMessageQueue();
      this._startPingInterval();
    });

    this.on('player_joined', (data) => {
      this.players.set(data.player.id, data.player);
      this.emit('playerUpdate', { players: this.getPlayers() });
    });

    this.on('player_left', (data) => {
      this.players.delete(data.playerId);
      this.emit('playerUpdate', { players: this.getPlayers() });
    });

    this.on('player_update', (data) => {
      const player = this.players.get(data.playerId);
      if (player) {
        Object.assign(player, data.state);
      }
    });

    this.on('game_state', (data) => {
      Object.assign(this.gameState, data);
      this.emit('gameStateUpdate', { gameState: this.gameState });
    });

    this.on('pong', (data) => {
      this.lastPong = Date.now();
    });

    this.on('error', (data) => {
      console.error('[NetMultiplayer] Server error:', data.message);
      this.emit('error', data);
    });
  }

  /**
   * Event-Handler registrieren
   */
  on(event, handler) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event).push(handler);
    return () => this.off(event, handler);
  }

  /**
   * Event-Handler entfernen
   */
  off(event, handler) {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Event auslösen
   */
  emit(event, data) {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (err) {
          console.error('[NetMultiplayer] Handler error:', err);
        }
      });
    }
  }

  /**
   * Verbindung zum Server herstellen
   */
  async connect() {
    if (this.isConnected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        
        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(new Error('Connection timeout'));
          }
        }, this.connectionTimeout);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('[NetMultiplayer] Connected to server');
        };

        this.ws.onmessage = (event) => {
          this._handleMessage(event.data);
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          this.isConnected = false;
          this._stopPingInterval();
          console.log('[NetMultiplayer] Disconnected:', event.code, event.reason);
          
          if (!this.isReconnecting && event.code !== 1000) {
            this._attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('[NetMultiplayer] WebSocket error:', error);
          this.emit('error', { message: 'Connection error' });
        };

        // Resolve when welcome message received
        const welcomeHandler = (data) => {
          this.off('welcome', welcomeHandler);
          resolve();
        };
        this.on('welcome', welcomeHandler);

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Verbindung trennen
   */
  disconnect() {
    this._stopPingInterval();
    this.isReconnecting = false;
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.isConnected = false;
    this.players.clear();
    this.gameState.status = 'idle';
  }

  /**
   * Wiederherstellungsversuch
   */
  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[NetMultiplayer] Max reconnect attempts reached');
      this.emit('connectionFailed', { attempts: this.reconnectAttempts });
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[NetMultiplayer] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect()
        .then(() => {
          this.isReconnecting = false;
          this.emit('reconnected', { attempt: this.reconnectAttempts });
        })
        .catch(() => {
          this._attemptReconnect();
        });
    }, delay);
  }

  /**
   * Nachricht an Server senden
   */
  send(type, data = {}) {
    const message = {
      type,
      data,
      sequence: this.sequenceNumber++,
      timestamp: Date.now()
    };

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (err) {
        console.error('[NetMultiplayer] Send error:', err);
        this.messageQueue.push(message);
      }
    } else {
      this.messageQueue.push(message);
    }
  }

  /**
   * Gesendete Nachrichten nach Verbindungsaufbau nachholen
   */
  _flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Eingehende Nachricht verarbeiten
   */
  _handleMessage(rawData) {
    try {
      const message = JSON.parse(rawData);
      this.emit(message.type, message.data);
    } catch (err) {
      console.error('[NetMultiplayer] Parse error:', err);
    }
  }

  /**
   * Ping-Interval starten
   */
  _startPingInterval() {
    this._stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.send('ping', { timestamp: Date.now() });
        
        // Check for timeout
        if (this.lastPong && Date.now() - this.lastPong > this.connectionTimeout) {
          console.warn('[NetMultiplayer] Connection timeout - no pong received');
          this.ws?.close();
        }
      }
    }, 5000);
  }

  /**
   * Ping-Interval stoppen
   */
  _stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Spieler zum Lobby hinzufügen
   */
  joinLobby(playerName = null) {
    if (playerName) {
      this.localPlayer.name = playerName;
    }
    this.send('join_lobby', {
      name: this.localPlayer.name,
      metadata: {
        version: '1.0.0'
      }
    });
  }

  /**
   * Lobby verlassen
   */
  leaveLobby() {
    this.send('leave_lobby', {});
  }

  /**
   * Spiel starten (nur Host)
   */
  startGame(mapId = null) {
    if (this.gameState.host !== this.playerId) {
      console.warn('[NetMultiplayer] Only host can start game');
      return;
    }
    this.send('start_game', { mapId });
  }

  /**
   * Spiel beenden
   */
  endGame() {
    this.send('end_game', {});
  }

  /**
   * Spieler-Position aktualisieren
   */
  updatePlayerState(position, rotation, velocity) {
    if (position) {
      this.localPlayer.position = { ...position };
    }
    if (rotation) {
      this.localPlayer.rotation = { ...rotation };
    }
    if (velocity) {
      this.localPlayer.velocity = { ...velocity };
    }
    this.localPlayer.lastUpdate = Date.now();

    this.send('player_state', {
      position: this.localPlayer.position,
      rotation: this.localPlayer.rotation,
      velocity: this.localPlayer.velocity,
      isAlive: this.localPlayer.isAlive
    });
  }

  /**
   * Spieler-Score aktualisieren
   */
  updateScore(score) {
    this.localPlayer.score = score;
    this.send('score_update', { score });
  }

  /**
   * Spieler-Status (lebendig/tot) aktualisieren
   */
  setPlayerAlive(isAlive) {
    this.localPlayer.isAlive = isAlive;
    this.send('player_status', { isAlive });
  }

  /**
   * Chat-Nachricht senden
   */
  sendChat(message) {
    this.send('chat', {
      message,
      timestamp: Date.now()
    });
  }

  /**
   * Alle verbundenen Spieler abrufen
   */
  getPlayers() {
    const allPlayers = [];
    if (this.localPlayer.id) {
      allPlayers.push({ ...this.localPlayer });
    }
    this.players.forEach(player => {
      allPlayers.push({ ...player });
    });
    return allPlayers;
  }

  /**
   * Spieler nach ID abrufen
   */
  getPlayer(playerId) {
    if (playerId === this.playerId) {
      return { ...this.localPlayer };
    }
    return this.players.get(playerId);
  }

  /**
   * Spielzustand abrufen
   */
  getGameState() {
    return { ...this.gameState };
  }

  /**
   * Verbindungslatenz (Ping) in ms
   */
  getPing() {
    if (!this.lastPong) return null;
    return Date.now() - this.lastPong;
  }

  /**
   * Statistiken abrufen
   */
  getStats() {
    return {
      connected: this.isConnected,
      reconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      playerCount: this.players.size + (this.localPlayer.id ? 1 : 0),
      ping: this.getPing(),
      gameState: this.gameState.status,
      queuedMessages: this.messageQueue.length
    };
  }
}

/**
 * Singleton-Instanz für einfachen Zugriff
 */
let multiplayerInstance = null;

export function getMultiplayer(options) {
  if (!multiplayerInstance) {
    multiplayerInstance = new NetMultiplayer(options);
  }
  return multiplayerInstance;
}

export function resetMultiplayer() {
  if (multiplayerInstance) {
    multiplayerInstance.disconnect();
    multiplayerInstance = null;
  }
}

export default NetMultiplayer;
