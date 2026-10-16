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
  if (nav) nav.innerHTML = '<header><div class="bar"><a class="brand" href="index.html"><i></i>FaceVector Attendance</a>' +
    '<button class="ib" id="theme" aria-label="Toggle dark mode" title="Dark / light"></button><button class="ib" id="menu" aria-label="Menu">&#9776;</button>' +
    '<nav id="mainnav">' + pages.map(([h, t]) => `<a href="${h}" class="${h === here ? 'on' : ''}">${t}</a>`).join('') + '</nav></div></header>';
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


/* ---------- Sample data (gives the home page 4 people, 3 present today, 19 records) ---------- */
function seedDemo(silent) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const base = () => Array.from({ length: 128 }, () => gauss() * 0.09);
  const sample = b => b.map(v => v + gauss() * 0.01);

  const names = [['Riya Sharma', 'CS2026-001'], ['Arjun Das', 'CS2026-002'], ['Meera Roy', 'CS2026-003'], ['Kabir Sen', 'CS2026-004']];
  const people = names.map(([name, roll], i) => {
    const b = base();
    return { id: 1000 + i, name, roll, cls: 'BCA 3rd year', embeddings: Array.from({ length: 5 }, () => sample(b)), created: new Date().toISOString() };
  });

  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const logs = [];
  const add = (p, date, time) => logs.push({ id: p.id, name: p.name, roll: p.roll, cls: p.cls, session: 'General',
    date, time, distance: +(0.2 + rnd() * 0.15).toFixed(3), similarity: +(0.9 + rnd() * 0.08).toFixed(3) });

  // 16 past records over 5 days + 3 today = 19
  [[0, 1, 2, 3], [0, 1, 3], [0, 1, 2, 3], [0, 2, 3], [0, 1]].forEach((day, k) => {
    const d = new Date(); d.setDate(d.getDate() - (k + 1));
    day.forEach(i => add(people[i], fmt(d), '9:0' + (k + i) + ':12 AM'));
  });
  [0, 1, 2].forEach(i => add(people[i], DB.today(), '9:1' + i + ':30 AM'));

  DB.save('people', people); DB.save('logs', logs);
  if (!silent) { toast('Sample data loaded'); renderChrome(); }
}

// First visit only: load the sample data once so the site looks like the preview.
// After "Delete everything" in Admin it will NOT come back.

/* ---------- Theme, motion and the animated hero map ---------- */
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
(function () { let t = null; try { t = localStorage.getItem('theme'); } catch (e) {} root.dataset.theme = t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); })();

function wireChrome() {
  const t = $('theme'), m = $('menu'), h = document.querySelector('header');
  const icon = () => t && (t.textContent = root.dataset.theme === 'dark' ? '\u2600' : '\u263E');
  if (t) { icon(); t.onclick = () => { const n = root.dataset.theme === 'dark' ? 'light' : 'dark'; root.dataset.theme = n; try { localStorage.setItem('theme', n); } catch (e) {} icon(); }; }
  if (m) m.onclick = () => $('mainnav').classList.toggle('open');
  if (h) addEventListener('scroll', () => h.classList.toggle('stuck', scrollY > 6), { passive: true });
}

function reveal() {
  if (reduced || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in'); io.unobserve(e.target);
    setTimeout(() => e.target.style.transitionDelay = '', 900);
  }), { threshold: 0.06 });
  document.querySelectorAll('.card,.stat,main h2').forEach((el, i) => { el.classList.add('rv'); el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });
}

function countUp() {
  if (reduced) return;
  document.querySelectorAll('.stat b').forEach(b => {
    const n = parseInt(b.textContent, 10); if (!n) return;
    const t0 = performance.now();
    const step = t => { const p = Math.min(1, (t - t0) / 1000); b.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    b.textContent = 0; requestAnimationFrame(step);
  });
}

/* Home page: dots float, a "new face" star flies to the closest person and shows the match */
function heroMap() {
  const c = $('heroMap'); if (!c) return;
  const x = c.getContext('2d'), cap = $('heroCap');
  const P = [{ n: 'Riya', c: '#2f6bff', x: .24, y: .32 }, { n: 'Arjun', c: '#10b392', x: .72, y: .26 }, { n: 'Meera', c: '#f0564a', x: .46, y: .74 }];
  P.forEach(p => p.d = [0, 1, 2, 3].map(k => ({ a: k * 1.7 + Math.random() * 3, r: .03 + .025 * Math.random(), s: .4 + Math.random() * .5 })));
  let W, H;
  const size = () => { const d = Math.min(devicePixelRatio || 1, 2), r = c.getBoundingClientRect(); W = r.width; H = r.height; c.width = W * d; c.height = H * d; x.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener('resize', size);
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, CYCLE = 6500, START = { x: .9, y: .62 };
  let lastCap = '';

  function frame(now) {
    const ink = getComputedStyle(root).getPropertyValue('--ink').trim() || '#0f1b3d';
    x.clearRect(0, 0, W, H);
    x.strokeStyle = 'rgba(120,140,190,.22)'; x.lineWidth = 1;
    for (let k = 1; k < 8; k++) { x.beginPath(); x.moveTo(W * k / 8, 8); x.lineTo(W * k / 8, H - 8); x.moveTo(8, H * k / 8); x.lineTo(W - 8, H * k / 8); x.stroke(); }
    const t = now / 1000;
    P.forEach(p => {
      x.fillStyle = p.c;
      p.d.forEach(o => {
        const px = (p.x + Math.cos(t * o.s + o.a) * o.r) * W, py = (p.y + Math.sin(t * o.s * 1.2 + o.a) * o.r) * H;
        x.globalAlpha = .18; x.beginPath(); x.arc(px, py, 15, 0, 7); x.fill();
        x.globalAlpha = 1; x.beginPath(); x.arc(px, py, 8, 0, 7); x.fill();
      });
      x.fillStyle = ink; x.font = '700 13px "Space Grotesk",sans-serif'; x.textAlign = 'center';
      x.fillText(p.n, p.x * W, (p.y - .13) * H);
    });
    const idx = Math.floor(now / CYCLE) % P.length, tt = (now % CYCLE) / CYCLE, tg = P[idx];
    const dest = { x: tg.x + .09, y: tg.y + .08 };
    let k = tt < .55 ? ease(tt / .55) : tt < .9 ? 1 : 1 - ease((tt - .9) / .1);
    const sx = (START.x + (dest.x - START.x) * k) * W, sy = (START.y + (dest.y - START.y) * k) * H;
    if (k > .02) { x.setLineDash([6, 5]); x.strokeStyle = ink; x.lineWidth = 1.6; x.beginPath(); x.moveTo(sx, sy); x.lineTo(tg.x * W, tg.y * H); x.stroke(); x.setLineDash([]); }
    x.save(); x.translate(sx, sy); x.rotate(Math.sin(t * 2) * .12);
    x.fillStyle = '#f5b301'; x.strokeStyle = '#0b1f4b'; x.lineWidth = 2; x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? 6.5 : 15; x.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
    x.closePath(); x.fill(); x.stroke(); x.restore();
    x.fillStyle = ink; x.textAlign = 'left'; x.fillText('new face', Math.min(sx + 18, W - 62), sy - 12);
    const msg = tt < .55 ? 'Comparing 128-D vectors...' : tt < .9 ? `Match: ${tg.n} \u00b7 distance ${(0.22 + idx * 0.05).toFixed(2)}` : 'Next face...';
    if (msg !== lastCap && cap) { cap.textContent = msg; lastCap = msg; }
    if (!reduced) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* First visit only: load sample data once so the site looks like the preview. */
document.addEventListener('DOMContentLoaded', () => {
  if (!store.get('demoSeeded', false) && !DB.people().length && !DB.logs().length) { seedDemo(true); store.set('demoSeeded', true); }
  renderChrome(); wireChrome(); reveal(); countUp(); heroMap();
});
