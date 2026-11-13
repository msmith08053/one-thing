// Copies the web app (one folder up) into native/www, which is what gets packaged into the iPhone app.
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const app = path.resolve(here, '../..');
const www = path.resolve(here, '../www');
const files = ['index.html', 'app.js', 'supabase-lib.js', 'styles.css', 'room.js', 'config.js', 'manifest.webmanifest', 'version.json', 'privacy.html', 'terms.html', 'support.html'];
const dirs = ['icons', 'fonts'];
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const f of files) {
  if (!fs.existsSync(path.join(app, f))) { console.error(`Missing ${f} (config.js: copy yours in, it's not in the repo)`); process.exit(1); }
  fs.copyFileSync(path.join(app, f), path.join(www, f));
}
for (const d of dirs) fs.cpSync(path.join(app, d), path.join(www, d), { recursive: true });
const cfg = fs.readFileSync(path.join(www, 'config.js'), 'utf8');
if (/YOUR-/.test(cfg)) { console.error('config.js still has YOUR-… placeholders'); process.exit(1); }
console.log('www ready:', fs.readdirSync(www).join(', '));
