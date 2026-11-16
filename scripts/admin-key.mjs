// Neuen Zentrale-Schlüssel erzeugen (32 Zeichen, zufällig), in .env eintragen und einmal anzeigen.
// Wirksam wird er mit dem nächsten Deploy (SKY-RUSH-DEPLOY.bat). Danach gelten alte Sitzungen und Sperren nicht mehr.
//   node scripts/admin-key.mjs            → immer neuen Schlüssel
//   node scripts/admin-key.mjs --once 3   → nur, wenn für „3“ noch keiner erzeugt wurde (für das Update-Skript)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const i = process.argv.indexOf('--once'), tag = i > 0 ? process.argv[i + 1] : null;
let env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').replace(/\r\n/g, '\n') : '';
if (tag && new RegExp(`^ADMIN_KEY_GEN=${tag}$`, 'm').test(env)) { console.log('  Zentrale-Schlüssel ist schon neu – nichts zu tun.'); process.exit(0); }
const key = crypto.randomBytes(24).toString('base64url');   // 32 Zeichen
env = /^ADMIN_TOKEN=.*$/m.test(env) ? env.replace(/^ADMIN_TOKEN=.*$/m, `ADMIN_TOKEN=${key}`) : (env && !env.endsWith('\n') ? env + '\n' : env) + `ADMIN_TOKEN=${key}\n`;
if (tag) env = /^ADMIN_KEY_GEN=.*$/m.test(env) ? env.replace(/^ADMIN_KEY_GEN=.*$/m, `ADMIN_KEY_GEN=${tag}`) : env + `ADMIN_KEY_GEN=${tag}\n`;
fs.writeFileSync('.env', env);
let copied = false;
try { if (process.platform === 'win32') { execSync('clip', { input: key }); copied = true; } } catch {}
console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║  NEUER ZENTRALE-SCHLÜSSEL                                ║
  ║                                                          ║
  ║     ${key}                     ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
  ${copied ? '✔ In die Zwischenablage kopiert – jetzt im Passwort-Manager speichern.' : 'Jetzt im Passwort-Manager speichern.'}
  Er steht auch in .env (bleibt nur auf deinem PC). Gültig ab dem nächsten Deploy.
  Der alte Schlüssel, alle Sitzungen und alle Sperren gelten danach nicht mehr.
`);
if (tag) process.exitCode = 2;   // fürs Update-Skript: „neuer Schlüssel wurde erzeugt“
