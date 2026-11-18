// www/js/multiplayer-local.js
// Local Multiplayer Core – ermöglicht 4 Spieler gleichzeitig zu steuern, ohne
// Eingabekonflikte. Der Code ist komplett unabhängig von einer Netzwerkverbindung
// und nutzt keine externen Bibliotheken.

// -----------------------------------------------------------------------------
// Player-Konfiguration
// -----------------------------------------------------------------------------
class Player {
    constructor(id, keyMap) {
        this.id = id;
        this.x = 0;
        this.y = 0;
        this.speed = 2;
        this.keyMap = keyMap; // {up:Key, down:Key, left:Key, right:Key}
        this.activeKeys = new Set();
    }

    handleKey(key, isDown) {
        const action = Object.entries(this.keyMap).find(([,code])=>code===key);
        if(action) {
            const dir = action[0];
            if(isDown) this.activeKeys.add(dir); else this.activeKeys.delete(dir);
        }
    }

    update() {
        if(this.activeKeys.has('up'))    this.y -= this.speed;
        if(this.activeKeys.has('down'))  this.y += this.speed;
        if(this.activeKeys.has('left'))  this.x -= this.speed;
        if(this.activeKeys.has('right')) this.x += this.speed;
        // Randbegrenzung (0–800)
        this.x = Math.max(0, Math.min(this.x, 800));
        this.y = Math.max(0, Math.min(this.y, 600));
    }
}

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------
const MultiplayerLocal = {
    players: [],
    init() {
        const keyMaps = [
            {up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD'},                 // Spieler 1
            {up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight'},// Spieler 2
            {up:'KeyI', down:'KeyK', left:'KeyJ', right:'KeyL'},                  // Spieler 3
            {up:'Numpad8', down:'Numpad2', left:'Numpad4', right:'Numpad6'}        // Spieler 4
        ];
        this.players = keyMaps.map((km,i)=> new Player(i+1, km));

        window.addEventListener('keydown', e=> this._handleKey(e, true));
        window.addEventListener('keyup',   e=> this._handleKey(e, false));

        // einfache Spielschleife
        this._loop();
    },

    _handleKey(e, isDown) {
        this.players.forEach(p=> p.handleKey(e.code, isDown));
    },

    _loop() {
        this.players.forEach(p=> p.update());
        this._checkCollisions();
        // Rendering-Hook (UI-Modul kann dies überschreiben)
        if (typeof this.onRender === 'function') {
            this.onRender(this.getState());
        }
        requestAnimationFrame(()=> this._loop());
    },

    _checkCollisions() {
        for (let i = 0; i < this.players.length; i++) {
            for (let j = i + 1; j < this.players.length; j++) {
                const a = this.players[i];
                const b = this.players[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
                    // einfache Abstoßung
                    a.x += Math.sign(dx) * 2;
                    a.y += Math.sign(dy) * 2;
                }
            }
        }
    },

    // Zugriff auf den aktuellen Spielzustand – nützlich für UI oder übergreifende Logik
    getState() {
        return this.players.map(p=> ({id:p.id, x:p.x, y:p.y}));
    }
};

// Export in globalem Kontext, damit UI‑/Netzwerk‑Module sie benutzen können
window.MultiplayerLocal = MultiplayerLocal;
window.multiplayerLocal = MultiplayerLocal; // Alias für Kompatibilität

// Automatische Initialisierung, wenn das Skript geladen wird
try { MultiplayerLocal.init(); } catch(err){ console.error(err); }
