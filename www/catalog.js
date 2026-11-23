// SKY DUELL – Katalog (Preise, Freischaltungen, Sets, Missionen, Kaufpakete). Gemeinsam für Gerät und Server:
// Der Server rechnet mit genau diesen Werten – ein verändertes Gerät kann daran nichts drehen.
export const CHARS = {
  hops:    { name: 'Hops', price: 0, body: ['#FFE066', '#FFB020'], acc: 'none' },
  kiki:    { name: 'Kiki', price: 2500, body: ['#FFB3C7', '#FF5A7A'], acc: 'ears' },
  robo:    { name: 'Robo', price: 5000, body: ['#9FE8FF', '#38A8FF'], acc: 'antenna' },
  sprout:  { name: 'Sprossi', price: 7500, body: ['#B6FFB0', '#2FCB77'], acc: 'leaf' },
  glimmer: { name: 'Glimmer', price: 12000, body: ['#E7C6FF', '#7B4DFF'], acc: 'crown' },
  pingo:   { name: 'Pingo', price: 9000, body: ['#8C9BC9', '#26335E'], acc: 'penguin' },
  flammi:  { name: 'Flammi', price: 11000, body: ['#FFE29A', '#FF6A2B'], acc: 'flame' },
  ninja:   { name: 'Ninja', price: 14000, body: ['#8A8AA8', '#2A2A44'], acc: 'ninja' },
  zork:    { name: 'Zork', price: 16000, body: ['#DAFFA8', '#4FCB3B'], acc: 'alien' },
  panda:   { name: 'Panda', price: 18000, body: ['#FFFFFF', '#D6D6E4'], acc: 'panda' },
  uni:     { name: 'Uni', price: 25000, body: ['#FFF4FC', '#FFB3E6'], acc: 'unicorn' },
  // Höhen-Figuren: nicht käuflich – nur wer so hoch kommt, bekommt sie
  aurum:     { name: 'Aurum', price: 0, unlock: 10000, body: ['#FFF3B0', '#E0A100'], acc: 'aurum', metal: 'gold' },
  platina:   { name: 'Platina', price: 0, unlock: 20000, body: ['#FFFFFF', '#9AA7BD'], acc: 'platina', metal: 'plat' },
  kristallo: { name: 'Kristallo', price: 0, unlock: 50000, body: ['#E8FFFF', '#5EC8FF'], acc: 'kristall', metal: 'crystal' },
};
// Stufe 1–5 (Bronze) wie bisher, 6–10 (Silber) und 11–15 (Gold) deutlich teurer – ein Ziel für Wochen, nicht für einen Tag
export const UPGRADE_COST = [600, 1500, 3500, 7000, 14000, 20000, 26000, 33000, 41000, 50000, 60000, 72000, 85000, 100000, 120000];

// Style: Jetpacks, Jet-Streams, Sprung-Sneaker, Hüte, Landen, Gesichter
export const STYLE = {
  jet: { title: 'Jetpacks', ico: '🎒', items: {
    classic: { name: 'Klassik', price: 0, rar: 'c' },
    retro:   { name: 'Retro-Rakete', price: 1500, rar: 'c' },
    bubble:  { name: 'Bubble-Pack', price: 3000, rar: 'r' },
    cyber:   { name: 'Cyber-Thruster', price: 5500, rar: 'r' },
    gold:    { name: 'Goldjet', price: 9000, rar: 'e' },
    dragon:  { name: 'Drachenflügel', price: 12000, rar: 'e' },
    angel:   { name: 'Engelsflügel', price: 20000, rar: 'l' },
    phoenix: { name: 'Phönixflügel', price: 0, rar: 'l', season: true },
  } },
  trail: { title: 'Streams', ico: '💨', items: {
    fire:    { name: 'Feuer', price: 0, rar: 'c', cols: ['#FFC83D', '#FF8A2B', '#FF5A7A'] },
    rainbow: { name: 'Regenbogen', price: 1200, rar: 'c', rainbow: true },
    plasma:  { name: 'Plasma', price: 2500, rar: 'r', cols: ['#FFFFFF', '#7FE8FF', '#38C6FF', '#7B4DFF'] },
    pixel:   { name: 'Pixel', price: 3000, rar: 'r', cols: ['#3BE8A4', '#B6FF5E', '#FFFFFF'], sh: 'sq' },
    bubbles: { name: 'Seifenblasen', price: 3500, rar: 'r', cols: ['#FFFFFF', '#BFE9FF', '#FFB3C7'], sh: 'ring' },
    hearts:  { name: 'Herzen', price: 5000, rar: 'e', cols: ['#FF5A7A', '#FF8FB1', '#FFFFFF'], sh: 'heart' },
    stars:   { name: 'Sternenstaub', price: 7000, rar: 'e', cols: ['#FFC83D', '#FFE066', '#FFFFFF'], sh: 'star' },
    galaxy:  { name: 'Galaxie', price: 15000, rar: 'l', cols: ['#B25CFF', '#FF6BD6', '#5EF2FF', '#FFFFFF'], sh: 'mix' },
    aurora:  { name: 'Polarlicht', price: 0, rar: 'e', season: true, cols: ['#3BE8A4', '#5EF2FF', '#B25CFF', '#C38BFF'], sh: 'ring' },
    comet:   { name: 'Kometenschweif', price: 0, rar: 'e', season: true, cols: ['#FFFFFF', '#BFE9FF', '#7FD3FF', '#FFE066'], sh: 'star' },
  } },
  shoe: { title: 'Sneaker', ico: '👟', items: {
    basic:  { name: 'Standard', price: 0, rar: 'c' },
    red:    { name: 'Rote Renner', price: 800, rar: 'c', up: '#FF4D6D', sole: '#FFFFFF', acc: '#FFFFFF' },
    high:   { name: 'High-Tops', price: 2000, rar: 'r', up: '#2E7BFF', sole: '#FFFFFF', acc: '#FFC83D', high: true },
    cloud:  { name: 'Wolkenläufer', price: 3500, rar: 'r', up: '#FFFFFF', sole: '#BFE9FF', acc: '#7FD3FF', cloud: true },
    neon:   { name: 'Neon-Glow', price: 4500, rar: 'r', up: '#1B1240', sole: '#3BE8A4', acc: '#3BE8A4', glow: true },
    gold:   { name: 'Gold-Kicks', price: 8000, rar: 'e', up: '#FFC83D', sole: '#FFF6C2', acc: '#B07A00', shine: true },
    rocket: { name: 'Raketen-Boots', price: 11000, rar: 'e', up: '#E8ECF8', sole: '#FF5A7A', acc: '#FF5A7A', flame: true, high: true },
    galaxy: { name: 'Galaxie-Sneaker', price: 16000, rar: 'l', up: '#2A1170', sole: '#FF6BD6', acc: '#5EF2FF', stars: true },
    aurora: { name: 'Polarlicht-Kicks', price: 0, rar: 'e', season: true, up: '#1E6E7A', sole: '#3BE8A4', acc: '#C38BFF', glow: true, high: true },
    comet:  { name: 'Kometen-Boots', price: 0, rar: 'e', season: true, up: '#EAF6FF', sole: '#7FD3FF', acc: '#FFE066', flame: true, stars: true },
  } },
  hat: { title: 'Hüte', ico: '🎩', items: {
    none:    { name: 'Ohne', price: 0, rar: 'c' },
    cap:     { name: 'Basecap', price: 600, rar: 'c' },
    beanie:  { name: 'Propellermütze', price: 1500, rar: 'c' },
    party:   { name: 'Partyhut', price: 2200, rar: 'r' },
    wizard:  { name: 'Zauberhut', price: 4000, rar: 'r' },
    tophat:  { name: 'Zylinder', price: 5500, rar: 'e' },
    halo:    { name: 'Heiligenschein', price: 9000, rar: 'e' },
    crown:   { name: 'Königskrone', price: 14000, rar: 'l' },
    comet:   { name: 'Kometenhelm', price: 0, rar: 'e', season: true },
    astro:   { name: 'Astro-Helm', price: 0, rar: 'l', season: true },
    laurel:  { name: 'Siegerkranz', price: 0, rar: 'l', season: true, tour: true },   // nur für den 1. Platz im Wochenturnier
  } },
  land: { title: 'Landen', ico: '💥', items: {
    dust:      { name: 'Standard', price: 0, rar: 'c' },
    stars:     { name: 'Sternchen', price: 1000, rar: 'c' },
    hearts:    { name: 'Herzchen', price: 2000, rar: 'r' },
    notes:     { name: 'Musik', price: 2500, rar: 'r' },
    rainbow:   { name: 'Regenbogen-Welle', price: 4500, rar: 'e' },
    goldrain:  { name: 'Goldregen', price: 7000, rar: 'e' },
    fireworks: { name: 'Feuerwerk', price: 0, rar: 'l', season: true },
  } },
  face: { title: 'Gesichter', ico: '😎', items: {
    happy:   { name: 'Fröhlich', price: 0, rar: 'c' },
    wink:    { name: 'Zwinker', price: 700, rar: 'c' },
    cat:     { name: 'Kätzchen', price: 1200, rar: 'c' },
    grin:    { name: 'Breites Grinsen', price: 1800, rar: 'r' },
    cool:    { name: 'Sonnenbrille', price: 2800, rar: 'r' },
    fierce:  { name: 'Entschlossen', price: 3500, rar: 'r' },
    hearts:  { name: 'Verliebt', price: 4500, rar: 'e' },
    stars:   { name: 'Sternenaugen', price: 6000, rar: 'e' },
    vampire: { name: 'Vampir', price: 8000, rar: 'e' },
    robot:   { name: 'Robo-Visier', price: 11000, rar: 'l' },
    diamond: { name: 'Diamantblick', price: 16000, rar: 'l' },
  } },
};
// Sets: komplette Sets bringen einen einmaligen Bonus
export const SETS = [
  { id: 'party', name: 'Party-Crew', ico: '🥳', parts: ['hat:party', 'trail:rainbow', 'land:stars', 'shoe:red'], coins: 1000 },
  { id: 'neon', name: 'Neon-Rider', ico: '⚡', parts: ['jet:cyber', 'trail:plasma', 'shoe:neon', 'land:rainbow'], coins: 1800 },
  { id: 'gold', name: 'Goldjunge', ico: '👑', parts: ['jet:gold', 'shoe:gold', 'trail:stars', 'hat:crown', 'land:goldrain'], coins: 3000 },
  { id: 'heaven', name: 'Himmelsbote', ico: '😇', parts: ['jet:angel', 'trail:hearts', 'hat:halo', 'land:hearts'], coins: 3000 },
];

// Missionen: drei aktive; alle erledigt → Score-Multiplikator +1
export const MISSIONS = [
  { k: 'height', base: 300, step: 150, run: true },
  { k: 'coins', base: 80, step: 40 },
  { k: 'springs', base: 5, step: 3 },
  { k: 'drones', base: 2, step: 1 },
  { k: 'dashes', base: 15, step: 8 },
  { k: 'powerups', base: 3, step: 2 },
  { k: 'coinsRun', base: 40, step: 20, run: true },
  { k: 'runs', base: 3, step: 1 },
  { k: 'gems', base: 2, step: 1 },
  { k: 'rushes', base: 1, step: 1 },
  { k: 'explore', base: 3, step: 0, run: true },
  { k: 'drops', base: 5, step: 3 },
  { k: 'crumbles', base: 4, step: 2 },
  { k: 'checkpoints', base: 2, step: 1 },
  { k: 'checkRun', base: 1, step: 1, run: true },
  { k: 'duels', base: 1, step: 1 },
  { k: 'sides', base: 2, step: 1 },
  { k: 'movers', base: 1, step: 1 },
];

// Kaufpakete (echte Zahlungen über Google Play / App Store, geprüft über RevenueCat)
export const PACKS = [
  // Fester Inhalt, keine Zufallstruhe: bezahlte Angebote enthalten nie zufällige Objekte
  { id: 'skyrush_starter', coins: 5000, item: 'hat:crown', itemCoins: 5000, headstarts: 3, once: true, tag: 'Einmalig' },
  { id: 'skyrush_coins_small', coins: 2000 },
  { id: 'skyrush_coins_medium', coins: 6500, tag: '+8 % Bonus' },
  { id: 'skyrush_coins_large', coins: 15000, tag: 'Beliebt · +25 %' },
  { id: 'skyrush_coins_huge', coins: 40000, tag: 'Bester Wert · +50 %' },
  { id: 'skyrush_coins_5000', coins: 5000, hidden: true },   // älteres Einzelpaket – nur noch für Gutschriften alter Käufe
];
