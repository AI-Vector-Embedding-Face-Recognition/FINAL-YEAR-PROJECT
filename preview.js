/* Preview shell: loads the real pages in a frame, shows their source code, switches Laptop / Mobile. */
const PAGES = [['index.html', 'Home'], ['about.html', 'About'], ['register.html', 'Register'], ['attendance.html', 'Attendance'],
               ['records.html', 'Records'], ['lab.html', '2D Lab'], ['admin.html', 'Admin'], ['contact.html', 'Contact']];
const GROUPS = [['HTML pages', PAGES.map(p => p[0]).concat('preview.html')],
                ['CSS', ['css/style.css', 'css/preview.css']],
                ['JavaScript', ['js/main.js', 'js/face.js', 'js/register.js', 'js/attendance.js', 'js/records.js', 'js/lab.js', 'js/admin.js', 'js/preview.js']]];

const $ = id => document.getElementById(id);
const frame = $('f'), stage = $('stage'), codeBox = $('code'), pre = $('pre'), files = $('files');
const SRC = {};
let cur = '';

/* ---------- Page tabs ---------- */
PAGES.forEach(([file, label]) => {
  const b = document.createElement('button');
  b.textContent = label; b.dataset.p = file;
  b.onclick = () => { if (codeBox.hidden) go(file); else showCode(file); markTab(file); };
  $('tabs').appendChild(b);
});
function markTab(file) { document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.p === file)); }
function go(file) { frame.src = file; markTab(file); }
// keep the tab highlighted when you click links inside the page
frame.addEventListener('load', () => {
  try { markTab(frame.contentWindow.location.pathname.split('/').pop() || 'index.html'); } catch (e) { /* ignore */ }
});

/* ---------- Output / Code ---------- */
GROUPS.forEach(([title, list]) => {
  const h = document.createElement('h4'); h.textContent = title; files.appendChild(h);
  list.forEach(n => { const b = document.createElement('button'); b.textContent = n; b.dataset.f = n; b.onclick = () => showCode(n); files.appendChild(b); });
});

async function showCode(n) {
  cur = n;
  files.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.f === n));
  $('fn').textContent = n; pre.scrollTop = 0;
  if (!SRC[n]) {
    pre.textContent = 'Loading...';
    try { const r = await fetch(n); if (!r.ok) throw new Error(r.status); SRC[n] = await r.text(); }
    catch (e) { pre.textContent = 'Could not load this file. Open the site with Live Server or localhost (not by double-clicking the file), then try again.'; $('fi').textContent = ''; return; }
  }
  if (cur !== n) return;
  pre.textContent = SRC[n]; $('fi').textContent = SRC[n].split('\n').length + ' lines';
}

function mode(code) {
  codeBox.hidden = !code; stage.hidden = code; $('note').hidden = code; $('devs').hidden = code;
  $('mc').classList.toggle('on', code); $('mo').classList.toggle('on', !code);
  if (code) showCode(cur || 'index.html');
}
$('mo').onclick = () => mode(false);
$('mc').onclick = () => mode(true);

$('cp').onclick = async e => {
  const b = e.target;
  try { await navigator.clipboard.writeText(SRC[cur] || ''); b.textContent = 'Copied'; }
  catch (x) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected, press Ctrl+C'; }
  setTimeout(() => b.textContent = 'Copy code', 1800);
};

/* ---------- Laptop / Mobile ---------- */
$('dl').onclick = () => { stage.classList.remove('phone'); $('dl').classList.add('on'); $('ph').classList.remove('on'); };
$('ph').onclick = () => { stage.classList.add('phone'); $('ph').classList.add('on'); $('dl').classList.remove('on'); };

/* ---------- Sample data (same demo data as the online preview) ---------- */
function loadSample() {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const mk = (n, r) => { const b = Array.from({ length: 128 }, () => gauss() * 0.088);
    return { id: Math.floor(rnd() * 1e9), name: n, roll: r, cls: 'BCA 3rd year', sample: true,
      embeddings: Array.from({ length: 5 }, () => b.map(v => v + gauss() * 0.014)), created: new Date().toISOString() }; };
  const people = DB_get('people').concat([mk('Riya Sharma', 'CS2026-014'), mk('Arjun Das', 'CS2026-021'), mk('Meera Nair', 'CS2026-009'), mk('Sourav Roy', 'CS2026-033')]);
  const ds = a => { const d = new Date(); d.setDate(d.getDate() - a); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const demo = people.filter(p => p.sample), logs = DB_get('logs');
  for (let d = 0; d < 6; d++) demo.forEach((p, i) => {
    if ((i === 2 && d % 2 === 1) || (i === 3 && d === 3) || (i === 2 && d === 0)) return;
    logs.push({ id: p.id, name: p.name, roll: p.roll, cls: p.cls, sample: true, session: 'Maths period 1', date: ds(d),
      time: '09:' + String(2 + i * 3 + d).padStart(2, '0') + ':1' + i + ' AM', distance: +(0.18 + rnd() * 0.12).toFixed(3), similarity: +(0.93 + rnd() * 0.05).toFixed(3) });
  });
  localStorage.setItem('people', JSON.stringify(people)); localStorage.setItem('logs', JSON.stringify(logs));
  frame.contentWindow.location.reload();
}
function clearSample() {
  localStorage.setItem('people', JSON.stringify(DB_get('people').filter(p => !p.sample)));
  localStorage.setItem('logs', JSON.stringify(DB_get('logs').filter(l => !l.sample)));
  frame.contentWindow.location.reload();
}
function DB_get(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } }

$('seed').onclick = () => { if (DB_get('people').some(p => p.sample)) return; loadSample(); };
$('unseed').onclick = clearSample;

// Admin pages stay unlocked in the preview only
try { sessionStorage.setItem('adminOK', '1'); } catch (e) { /* ignore */ }

if (!DB_get('people').length) loadSample0(); 
function loadSample0() { frame.addEventListener('load', function once() { frame.removeEventListener('load', once); loadSample(); }); }
go('index.html');
