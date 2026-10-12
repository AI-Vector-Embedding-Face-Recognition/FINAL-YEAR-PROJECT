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

function renderChrome() {
  const pages = [['index.html', 'Home'], ['about.html', 'About'], ['register.html', 'Register face'], ['attendance.html', 'Attendance'],
                 ['records.html', 'Records'], ['lab.html', '2D Lab'], ['admin.html', 'Admin'], ['contact.html', 'Contact']];
  const here = location.pathname.split('/').pop() || 'index.html';
  const nav = $('nav');
  if (nav) nav.innerHTML = '<header><div class="bar"><a class="brand" href="index.html"><i></i>FaceVector Attendance</a><nav>' +
    pages.map(([h, t]) => `<a href="${h}" class="${h === here ? 'on' : ''}">${t}</a>`).join('') + '</nav></div></header>';
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
