/**
 * Multiplayer-Netzwerkmodul für Sky Rush – Client-seitige WebSocket-Logik.
 * Verbindet sich mit dem Server über /.netlify/functions/socket und verarbeitet
 * die Protokoll-Nachrichten: join, move, ping sowie serverseitige State-Broadcasts.
 * 
 * Features:
 * - Automatische Reconnection bei Disconnect (mit exponentiellem Backoff)
 * - Pufferung von Move-Befehlen während der Verbindungsaufbau-Phase
 * - Echo für Server-Ping-Nachrichten zur Latenzmessung
 * - Event-basierte Dispatch-Funktionen für einfache Integration in UI
 */

(function(global) {
    'use strict';

    // ---------------------------------------------------------------------------
    // Konstanten und Defaults
    // ---------------------------------------------------------------------------
    const DEFAULTS = {
        url: null,           // Wird automatisch aus window.location abgeleitet
        roomId: null,       // Optional: vorgegebener Room-Code (6-char)
        password: null,     // Optional: Passwort für den Join-Befehl
        isOwner: false,     // Optional: ob der Spieler den Raum erstellt hat
        reconnectDelayMs: 2000,
        maxReconnectAttempts: 10,
        pingIntervalMs: 30000,
        stateBroadcastIntervalMs: 500
    };

    // ---------------------------------------------------------------------------
    // WebSocket-Verbindungsklasse
    // ---------------------------------------------------------------------------
    class MultiplayerNetwork {
        constructor(options = {}) {
            this.url = options.url || null;
            this.roomId = options.roomId || null;
            this.password = options.password || null;
            this.isOwner = options.isOwner || false;

            // Interner Zustand
            this.socket = null;
            this.reconnectAttempts = 0;
            this.lastPong = null;
            this.messageQueue = [];
            this.stateBroadcastTimer = null;
            this.pingTimer = null;

            // Event-Dispatcher (wird von UI überschrieben)
            this.onEvent = null;

            // Initialisierung
            if (this.url) {
                this.connect();
            } else {
                console.warn('MultiplayerNetwork: keine URL angegeben – Verbindung wird nicht aufgebaut.');
            }
        }

        /**
         * WebSocket-Verbindung aufbauen und Auth-Nachricht senden.
         */
        connect() {
            // WS-URL konstruieren (Netlify Functions)
            const wsUrl = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.url = `${wsUrl}//${window.location.host}/.netlify/functions/socket`;

            console.log(`MultiplayerNetwork: Verbindungsaufbau zu ${this.url}...`);

            try {
                this.socket = new WebSocket(this.url);

                this.socket.onopen = () => {
                    console.log('MultiplayerNetwork: verbunden');
                    this.reconnectAttempts = 0;
                    this.sendAuthEvent();
                    this.startStateBroadcastTimer();
                    this.startPingTimer();
                };

                this.socket.onmessage = (event) => {
                    const msg = JSON.parse(event.data);
                    this.handleServerMessage(msg);
                };

                this.socket.onerror = (error) => {
                    console.error('MultiplayerNetwork: WebSocket-Fehler:', error);
                };

                this.socket.onclose = (event) => {
                    console.log(`MultiplayerNetwork: Verbindung geschlossen (${event.code}, ${event.reason || ''})`);

                    if (event.wasClean && event.code === 1000) {
                        // Geordneter Abschluss – nichts zu tun
                    } else {
                        // Ungewollter Disconnect – Reconnection versuchen
                        this.attemptReconnect();
                    }
                };
            } catch (err) {
                console.error('MultiplayerNetwork: Fehler beim Erstellen von WebSocket:', err);
            }
        }

        /**
         * Auth-Event senden (join/create).
         */
        sendAuthEvent() {
            if (!this.roomId) {
                console.warn('MultiplayerNetwork: roomId fehlt – kann nicht authentifizieren.');
                return;
            }

            const payload = {
                type: 'join',
                roomId: this.roomId,
                password: this.password || null,
                isOwner: this.isOwner
            };

            console.log('MultiplayerNetwork: sendAuthEvent:', JSON.stringify(payload));
            this.socket.send(JSON.stringify(payload));
        }

        /**
         * Move-Befehl senden (mit Delta-Handling).
         */
        move(dx, dy) {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                // Pufferung während der Verbindungsaufbau-Phase
                console.log('MultiplayerNetwork: Move gepuffert (nicht verbunden):', dx, dy);
                this.messageQueue.push({ type: 'move', dx, dy });
                return;
            }

            const payload = {
                type: 'move',
                roomId: this.roomId,
                dx,
                dy
            };

            console.log('MultiplayerNetwork: move:', JSON.stringify(payload));
            this.socket.send(JSON.stringify(payload));
        }

        /**
         * Ping senden (Server antwortet mit pong).
         */
        ping() {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

            const payload = { type: 'ping', roomId: this.roomId };
            console.log('MultiplayerNetwork: ping');
            this.socket.send(JSON.stringify(payload));
        }

        /**
         * Server-Nachricht verarbeiten.
         */
        handleServerMessage(msg) {
            switch (msg.type) {
                case 'welcome':
                    // Erfolgreicher Join – Event dispatchen
                    if (this.onEvent) this.onEvent('connected', msg);
                    console.log('MultiplayerNetwork: welcome:', JSON.stringify(msg));
                    break;

                case 'state':
                    // State-Broadcast – Event dispatchen
                    if (this.onEvent) this.onEvent('state', msg);
                    console.log('MultiplayerNetwork: state update:', JSON.stringify(msg));
                    break;

                case 'pong':
                    // Latenzmessung
                    this.lastPong = Date.now();
                    const pingMs = Math.round(Date.now() - (this.lastPong || 0));
                    if (this.onEvent) this.onEvent('ping', { ping: pingMs });
                    console.log(`MultiplayerNetwork: pong (${pingMs}ms)`);
                    break;

                case 'error':
                    // Server-Fehler – Event dispatchen
                    if (this.onEvent) this.onEvent('error', msg);
                    console.error('MultiplayerNetwork: server error:', JSON.stringify(msg));
                    break;

                default:
                    console.warn(`MultiplayerNetwork: unbekannte Nachricht vom Server:`, msg.type, msg);
            }
        }

        /**
         * Reconnection-Logik (exponentieller Backoff).
         */
        attemptReconnect() {
            if (this.reconnectAttempts >= DEFAULTS.maxReconnectAttempts) {
                console.error('MultiplayerNetwork: maximale Reconnection-Versuche erreicht.');
                return;
            }

            const delay = Math.min(DEFAULTS.reconnectDelayMs * Math.pow(2, this.reconnectAttempts), 60000);
            this.reconnectAttempts++;
            console.log(`MultiplayerNetwork: Reconnection (${this.reconnectAttempts}/${DEFAULTS.maxReconnectAttempts}) in ${delay}ms...`);

            setTimeout(() => {
                // Socket neu erstellen (URL bleibt gleich)
                this.connect();
            }, delay);
        }

        /**
         * State-Broadcast-Timer starten.
         */
        startStateBroadcastTimer() {
            if (this.stateBroadcastTimer) clearInterval(this.stateBroadcastTimer);
            this.stateBroadcastTimer = setInterval(() => {
                // Server fragt alle 500ms nach dem aktuellen State – wir senden einfach einen leeren Request
                const payload = { type: 'state', roomId: this.roomId };
                console.log('MultiplayerNetwork: state request:', JSON.stringify(payload));
                this.socket.send(JSON.stringify(payload));
            }, DEFAULTS.stateBroadcastIntervalMs);
        }

        /**
         * Ping-Timer starten.
         */
        startPingTimer() {
            if (this.pingTimer) clearInterval(this.pingTimer);
            this.pingTimer = setInterval(() => this.ping(), DEFAULTS.pingIntervalMs);
        }

        /**
         * Verbindungsstatus prüfen.
         */
        isConnected() {
            return !!this.socket && this.socket.readyState === WebSocket.OPEN;
        }

        /**
         * Alle gepufferten Nachrichten senden (wenn verbunden).
         */
        flushQueue() {
            while (this.messageQueue.length > 0) {
                const queued = this.messageQueue.shift();
                console.log('MultiplayerNetwork: Queue gesendet:', JSON.stringify(queued));
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify(queued));
                } else {
                    // Fallback – einfach wieder in die Queue legen
                    this.messageQueue.unshift(queued);
                }
            }
        }

        /**
         * Verbindungsstatus zurückgeben.
         */
        getStatus() {
            return {
                connected: this.isConnected(),
                reconnecting: this.reconnectAttempts > 0,
                reconnectAttempts: this.reconnectAttempts,
                ping: this.lastPong ? Math.round(Date.now() - this.lastPong) : null,
                queuedMessages: this.messageQueue.length
            };
        }

        /**
         * Verbindungsstatus zurücksetzen.
         */
        resetStatus() {
            this.reconnectAttempts = 0;
            this.messageQueue = [];
            if (this.stateBroadcastTimer) clearInterval(this.stateBroadcastTimer);
            if (this.pingTimer) clearInterval(this.pingTimer);
        }

        /**
         * Verbindungsstatus zurücksetzen.
         */
        disconnect() {
            console.log('MultiplayerNetwork: disconnect');
            this.resetStatus();
            if (this.socket) {
                this.socket.close(1000, 'Client disconnect');
                this.socket = null;
            }
        }

        /**
         * Room-Code aktualisieren.
         */
        setRoomId(roomId) {
            this.roomId = roomId || null;
            if (this.isConnected()) {
                // Auth neu senden mit neuer Room-ID
                this.sendAuthEvent();
            } else {
                console.warn('MultiplayerNetwork: roomId geändert, aber nicht verbunden.');
            }
        }

        /**
         * Passwort aktualisieren.
         */
        setPassword(password) {
            this.password = password || null;
            if (this.isConnected()) {
                // Auth neu senden mit neuem Passwort
                this.sendAuthEvent();
            } else {
                console.warn('MultiplayerNetwork: password geändert, aber nicht verbunden.');
            }
        }

        /**
         * Owner-Status aktualisieren.
         */
        setOwner(isOwner) {
            this.isOwner = isOwner || false;
            if (this.isConnected()) {
                // Auth neu senden mit neuem Owner-Status
                this.sendAuthEvent();
            } else {
                console.warn('MultiplayerNetwork: owner geändert, aber nicht verbunden.');
            }
        }

        /**
         * Event-Dispatcher setzen.
         */
        setEventHandler(handler) {
            this.onEvent = handler || null;
        }

        // -----------------------------------------------------------------------
        // Public API – für einfache Integration in UI
        // -----------------------------------------------------------------------

        /**
         * Spielerposition aktualisieren (x, y).
         */
        updatePlayerPosition(x, y) {
            const payload = {
                type: 'move',
                roomId: this.roomId,
                dx: x - this.lastX || 0,
                dy: y - this.lastY || 0
            };

            // Letzten bekannten Position speichern
            this.lastX = x;
            this.lastY = y;

            console.log('MultiplayerNetwork: updatePlayerPosition:', JSON.stringify(payload));
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(payload));
            } else {
                // Pufferung während der Verbindungsaufbau-Phase
                this.messageQueue.push({ type: 'move', roomId: this.roomId, dx: payload.dx, dy: payload.dy });
            }
        }

        /**
         * Chat-Nachricht senden.
         */
        sendChat(message) {
            const payload = {
                type: 'chat',
                roomId: this.roomId,
                message
            };

            console.log('MultiplayerNetwork: sendChat:', JSON.stringify(payload));
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(payload));
            } else {
                // Pufferung während der Verbindungsaufbau-Phase
                this.messageQueue.push({ type: 'chat', roomId: this.roomId, message });
            }
        }

        /**
         * Spieler-Status (lebendig/tot) aktualisieren.
         */
        setPlayerAlive(isAlive) {
            const payload = {
                type: 'player_status',
                roomId: this.roomId,
                isAlive
            };

            console.log('MultiplayerNetwork: setPlayerAlive:', JSON.stringify(payload));
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(payload));
            } else {
                // Pufferung während der Verbindungsaufbau-Phase
                this.messageQueue.push({ type: 'player_status', roomId: this.roomId, isAlive });
            }
        }

        /**
         * Alle verbundenen Spieler abrufen.
         */
        getPlayers() {
            const allPlayers = [];
            if (this.lastPlayer) {
                allPlayers.push({ ...this.lastPlayer });
            }
            return allPlayers;
        }

        /**
         * Spielzustand abrufen.
         */
        getGameState() {
            return { status: 'connected' };
        }

        /**
         * Verbindungs-Latenz (Ping) in ms.
         */
        getPing() {
            if (!this.lastPong) return null;
            return Date.now() - this.lastPong;
        }

        /**
         * Statistiken abrufen.
         */
        getStats() {
            return {
                connected: this.isConnected(),
                reconnecting: this.reconnectAttempts > 0,
                reconnectAttempts: this.reconnectAttempts,
                playerCount: this.lastPlayer ? 1 : 0,
                ping: this.getPing(),
                gameState: 'connected',
                queuedMessages: this.messageQueue.length
            };
        }
    }

    // ---------------------------------------------------------------------------
    // Singleton-Instanz für einfachen Zugriff
    // ---------------------------------------------------------------------------
    let multiplayerInstance = null;

    /**
     * Multiplayer-Netzwerk-Instanz zurückgeben (oder erstellen).
     */
    function getMultiplayer(options) {
        if (!multiplayerInstance) {
            multiplayerInstance = new MultiplayerNetwork(options);
        }
        return multiplayerInstance;
    }

    /**
     * Singleton-Instanz zurücksetzen.
     */
    function resetMultiplayer() {
        if (multiplayerInstance) {
            multiplayerInstance.disconnect();
            multiplayerInstance = null;
        }
    }

    // ---------------------------------------------------------------------------
    // Globale Registrierung für einfache Integration in UI
    // ---------------------------------------------------------------------------
    global.MultiplayerNetwork = MultiplayerNetwork;
    global.getMultiplayer = getMultiplayer;
    global.resetMultiplayer = resetMultiplayer;

})(typeof window !== 'undefined' ? window : this);