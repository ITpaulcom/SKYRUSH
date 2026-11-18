/**
 * Lobby UI - Spielraum erstellen, beitreten und verwalten
 */

// Globale Variablen
let socket = null;
let currentRoom = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;

// Init
document.addEventListener('DOMContentLoaded', function() {
    loadRooms();
    
    // Tab-Wechsel
    document.getElementById('roomPassword').addEventListener('input', function() {
        setPasswordStatus(this.value.length > 0);
    });
});

// Section显示了
function showSection(sectionId) {
    // Alle Sektionen verstecken
    ['createRoomSection', 'joinSection', 'roomsListSection', 'inRoomSection', 'errorSection'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    
    // Gewählte Sektion zeigen
    const section = document.getElementById(sectionId);
    section.classList.remove('hidden');
    
    // Back-Button zeigen/verstecken
    const backBtn = document.getElementById('backBtn');
    const lobbyTitle = document.getElementById('lobbyTitle');
    
    if (sectionId === 'createRoomSection' || sectionId === 'joinSection') {
        backBtn.classList.add('hidden');
        lobbyTitle.textContent = sectionId === 'createRoomSection' ? 'Spielraum erstellen' : 'Spielraum beitreten';
    } else if (sectionId === 'roomsListSection') {
        backBtn.classList.add('hidden');
        lobbyTitle.textContent = 'Aktive Spielräume';
    } else if (sectionId === 'inRoomSection') {
        backBtn.classList.remove('hidden');
        lobbyTitle.textContent = 'In Spielraum';
    } else {
        backBtn.classList.add('hidden');
        lobbyTitle.textContent = 'Fehler';
    }
}

// Passwort-Status anzeigen
function setPasswordStatus(hasPassword) {
    const status = document.getElementById('passwordStatus');
    if (hasPassword) {
        status.textContent = 'Passwort ist erforderlich für diesen Raum.';
        status.classList.remove('hidden');
    } else {
        status.classList.add('hidden');
    }
}

// Raum erstellen
async function createRoom() {
    const name = document.getElementById('roomName').value.trim();
    const password = document.getElementById('roomPassword').value.trim();
    const allowSpectators = document.getElementById('spectators').checked;

    if (!name) {
        showError('Bitte gib einen Raumnamen ein.');
        return;
    }

    showSection('loading');
    
    try {
        const response = await fetch('/.netlify/functions/multiplayer/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                playerName: name
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Fehler beim Erstellen des Raumes');
        }

        const data = await response.json();
        joinRoom(data.roomId, data.password, true, name);

    } catch (error) {
        console.error('Fehler beim Erstellen:', error);
        showError(error.message || 'Fehler beim Erstellen des Raumes');
    }
}

// Raum beitreten
async function joinRoom(roomId, password = null, createdByOwner = false, playerName = 'Spieler') {
    // Passwort beim Starten werden übergeben
    showSection('inRoomSection');

    try {
        const response = await fetch('/.netlify/functions/multiplayer/join', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                roomId,
                playerName
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Fehler beim Beitreten');
        }

        const data = await response.json();
        
        currentRoom = {
            id: data.roomId,
            name: data.room.name,
            playerId: data.playerId,
            isOwner: data.isOwner,
            players: data.players || []
        };

        updateRoomUI();
        connectWebSocket(data.roomId, password || null, data.isOwner);

    } catch (error) {
        console.error('Fehler beim Beitreten:', error);
        showError(error.message);
    }
}

// WebSocket verbinden
function connectWebSocket(roomId, password, isOwner) {
    const wsUrl = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsUrl}//${window.location.host}/.netlify/functions/socket`;

    socket = new WebSocket(url);

    socket.onopen = function(event) {
        console.log('WebSocket verbunden');
        reconnectAttempts = 0;
        sendAuthEvent(roomId, password, isOwner);
    };

    socket.onmessage = function(event) {
        const message = JSON.parse(event.data);
        handleEvent(message);
    };

    socket.onerror = function(error) {
        console.error('WebSocket Fehler:', error);
    };

    socket.onclose = function(event) {
        console.log('WebSocket geschlossen');
        
        if (event.wasClean) {
            console.log(`Verbindung geschlossen mit Status ${event.code} und Reason ${event.reason}`);
        } else {
            console.log('Verbindung abgebrochen');
            
            // Automatische Wiederverbindung
            if (currentRoom && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                setTimeout(() => {
                    console.log(`Wiederverbindung (${reconnectAttempts})...`);
                    connectWebSocket(roomId, password, isOwner);
                }, RECONNECT_DELAY * reconnectAttempts);
            }
        }
    };
}

// Event verarbeiten
function handleEvent(event) {
    switch (event.type) {
        case 'player-joined':
            updateRoomUI();
            break;
        
        case 'player-left':
            updateRoomUI();
            break;
        
        case 'player-update':
            updatePlayer(event.player);
            break;
        
        case 'player-position-update':
            updatePlayerPosition(event.playerId, event.position);
            break;
        
        case 'room-updated':
            currentRoom = event.room;
            updateRoomUI();
            break;
        
        case 'error':
            showError(`Server-Fehler: ${event.message}`);
            break;
        
        case 'chat-message':
            console.log('Neu_chat-Nachricht:', event.message);
            break;
    }
}


// UI aktualisieren
function updateRoomUI() {
    if (!currentRoom) return;

    const playersContainer = document.getElementById('playersContainer');
    const playerCount = document.getElementById('playerCount');
    const roomInfo = document.getElementById('roomInfoName');
    const roomCode = document.getElementById('roomCode');

    roomInfo.textContent = currentRoom.name;
    playerCount.textContent = `Spieler: ${currentRoom.players.length}/4`;
    roomCode.textContent = `Code: ${currentRoom.id.substring(0, 4).toUpperCase()}`;

    playersContainer.innerHTML = '';
    
    currentRoom.players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-card';
        playerDiv.innerHTML = `
            <span class="player-avatar">${player.id[0].toUpperCase()}</span>
            <span class="player-name">${player.name || 'Spieler'}</span>
            ${player.isHost ? '<span class="badge host">Host</span>' : ''}
        `;
        playersContainer.appendChild(playerDiv);
    });

    // Start-Button nur für den Owner anzeigen wenn alle 4 Spieler
    const startBtn = document.getElementById('startGameBtn');
    if (currentRoom.isOwner && currentRoom.players.length === 4) {
        startBtn.style.display = 'inline-block';
    } else if (currentRoom.isOwner && currentRoom.players.length < 4) {
        startBtn.style.display = 'none';
    } else {
        startBtn.style.display = 'none';
    }
}

// Spieler aktualisieren
function updatePlayer(player) {
    console.log('Spieler aktualisiert:', player);
}

// Spielerposition aktualisieren
function updatePlayerPosition(playerId, position) {
    console.log('Spieler-Position:', playerId, position);
}

// Raum verlassen
function leaveRoom() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
    
    // currentRoom leeren
    currentRoom = null;
    reconnectAttempts = 0;
    socket = null;

    // Zurück zur Erstellung
    showSection('createRoomSection');
}

// Spiel starten
function startGame() {
    if (currentRoom && currentRoom.isOwner) {
        // Spiel-Startsignal an Server senden
        const wsUrl = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${wsUrl}//${window.location.host}/.netlify/functions/socket`;

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'start-game',
                roomId: currentRoom.id
            }));
            
            // Zum Spiel weiterleiten
            window.location.href = '../game.html?roomId=' + currentRoom.id;
        } else {
            showError('Verbindung mit dem Server verloren. Bitte versuche es erneut.');
        }
    }
}


// Fehler anzeigen
function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    showSection('errorSection');
}

// Spielräume laden
async function loadRooms() {
    try {
        const response = await fetch('/api/list-rooms');
        
        if (!response.ok) {
            console.log('Keine Spielräume oder Fehler beim Laden');
            return;
        }

        const data = await response.json();
        displayRooms(data.rooms || []);

    } catch (error) {
        console.error('Fehler beim Laden der Spielräume:', error);
    }
}

// Spielräume aneurigen
function displayRooms(rooms) {
    const container = document.getElementById('roomsContainer');
    
    if (rooms.length === 0) {
        container.innerHTML = '<p>Noch keine aktiven Spielräume.</p>';
        return;
    }

    container.innerHTML = rooms.map(room => `
        <div class="room-card" onclick="joinRoom('${room.id}', '${room.password || ''}', false, 'Spieler')" style="cursor:pointer">
            <div class="room-name">${room.name}</div>
            <div class="room-meta">
                <span class="player-count">${room.players.length}/4 Spieler</span>
                ${room.password ? '<span class="badge locked">Passwort</span>' : '<span class="badge open">Öffentlich</span>'}
                ${room.allowSpectators ? '<span class="badge">Spectator</span>' : ''}
            </div>
            <div class="room-code">${room.id.substring(0, 4).toUpperCase()}</div>
        </div>
    `).join('');
}
