/* Shared helpers: storage, settings, navigation, toast, small utilities.
   All data lives in this browser (localStorage). */

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DEFAULTS = {
  threshold: 0.5,   // Euclidean distance: lower = same person
  margin: 0.06,     // best match must beat the 2nd person by this much
  session: 'General',
  pass: 'admin123'  // demo admin password (change it in the Admin page)
};

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Could not save: browser storage is full or blocked'); return false; } }
};

const DB = {
  people:   () => store.get('people', []),   // {id,name,roll,cls,embeddings:[[128 numbers],...],created}
  logs:     () => store.get('logs', []),     // {id,name,roll,cls,session,date,time,distance,similarity}
  settings: () => ({ ...DEFAULTS, ...store.get('settings', {}) }),
  save:     (k, v) => store.set(k, v),
  today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
};

const PAGES = [['index.html', 'Home'], ['about.html', 'About'], ['register.html', 'Register'], ['attendance.html', 'Attendance'],
               ['records.html', 'Records'], ['lab.html', '2D Lab'], ['admin.html', 'Admin'], ['contact.html', 'Contact']];

function renderChrome() {
  const here = location.pathname.split('/').pop() || 'index.html';
  const nav = $('nav');
  if (nav) {
    nav.innerHTML = '<header><div class="bar"><a class="brand" href="index.html"><i></i>FaceVector Attendance</a>' +
      '<nav aria-label="Pages">' + PAGES.map(([h, t]) => `<a href="${h}" class="${h === here ? 'on' : ''}">${t}</a>`).join('') + '</nav>' +
      '<div class="seg"><button class="tb on" id="vOut">Output</button><button class="tb" id="vCode">Code</button></div>' +
      '<div class="seg"><button class="tb on" id="dLap">Laptop</button><button class="tb" id="dPh">Phone</button></div></div></header>';
    setupToolbar(here);
  }
  const foot = $('foot');
  if (foot) foot.innerHTML = '<footer>FaceVector Attendance &middot; face vectors and attendance stay on this device &middot; <a href="about.html">How it works</a></footer>';
  if (!$('toast')) { const t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  const s1 = $('s1');
  if (s1) {
    s1.textContent = DB.people().length;
    $('s2').textContent = new Set(DB.logs().filter(l => l.date === DB.today()).map(l => l.id)).size;
    $('s3').textContent = DB.logs().length;
  }
}

/* Toolbar: Output / Code switch and Laptop / Phone width switch (on every page). */
function setupToolbar(here) {
  // Laptop / Phone: narrows the page to a phone width (remembered while you browse)
  const setDevice = phone => {
    document.documentElement.classList.toggle('phone', phone);
    $('dLap').classList.toggle('on', !phone); $('dPh').classList.toggle('on', phone);
    try { sessionStorage.setItem('device', phone ? 'phone' : 'laptop'); } catch (e) { /* ignore */ }
  };
  $('dLap').onclick = () => setDevice(false);
  $('dPh').onclick = () => setDevice(true);
  try { setDevice(sessionStorage.getItem('device') === 'phone'); } catch (e) { setDevice(false); }

  // Output / Code: shows the source of THIS page and the CSS / JS files it uses
  const local = u => u && !/^(https?:)?\/\//.test(u);
  const files = [...new Set([here,
    ...[...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')).filter(local),
    ...[...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).filter(local)])];
  const panel = document.createElement('section');
  panel.id = 'codeView'; panel.hidden = true;
  panel.innerHTML = '<div class="files" id="cvFiles"></div><div class="view"><div class="vh"><b id="cvName"></b><span id="cvInfo"></span>' +
    '<button class="tb" id="cvCopy">Copy code</button></div><pre id="cvPre" tabindex="0"></pre></div>';
  document.body.insertBefore(panel, $('foot') || null);
  $('cvFiles').innerHTML = files.map(f => `<button data-f="${esc(f)}">${esc(f)}</button>`).join('');

  const cache = {}; let cur = '';
  async function show(f) {
    cur = f;
    $('cvFiles').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    $('cvName').textContent = f; $('cvPre').scrollTop = 0;
    if (!(f in cache)) {
      $('cvPre').textContent = 'Loading...';
      try { const r = await fetch(f); if (!r.ok) throw new Error(r.status); cache[f] = await r.text(); }
      catch (e) { $('cvPre').textContent = 'Could not load this file. Open the site with Live Server, localhost or https (not by double-clicking the file).'; $('cvInfo').textContent = ''; return; }
    }
    if (cur !== f) return;
    $('cvPre').textContent = cache[f]; $('cvInfo').textContent = cache[f].split('\n').length + ' lines';
  }
  $('cvFiles').onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.f); };

  const setView = code => {
    panel.hidden = !code;
    const main = document.querySelector('main'); if (main) main.hidden = code;
    const ft = $('foot'); if (ft) ft.hidden = code;
    $('vCode').classList.toggle('on', code); $('vOut').classList.toggle('on', !code);
    if (code) show(cur || files[0]);
  };
  $('vOut').onclick = () => setView(false);
  $('vCode').onclick = () => setView(true);

  $('cvCopy').onclick = async e => {
    const b = e.target;
    try { await navigator.clipboard.writeText(cache[cur] || ''); b.textContent = 'Copied'; }
    catch (x) { const r = document.createRange(); r.selectNodeContents($('cvPre')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected, press Ctrl+C'; }
    setTimeout(() => b.textContent = 'Copy code', 1800);
  };
}

let toastTimer;
function toast(msg) {
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function setStatus(el, msg, type = '') { if (el) { el.textContent = msg; el.className = 'status ' + type; } }

function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator();
    o.frequency.value = 880; o.connect(a.destination); o.start();
    setTimeout(() => { o.stop(); a.close(); }, 130);
  } catch (e) { /* sound is optional */ }
}

function download(filename, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';

document.addEventListener('DOMContentLoaded', renderChrome);
