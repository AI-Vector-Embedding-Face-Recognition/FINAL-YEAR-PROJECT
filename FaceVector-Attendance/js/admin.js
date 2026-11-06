/* Admin page: password login (salted PBKDF2 hash, lock-out, auto log-out),
   manage students, recognition settings, validated backup / restore.
   NOTE: everything runs in the browser, so this protects against casual access on a
   shared device. Real multi-user security needs a server (see README). */
(function () {
  'use strict';
  const say = (id, m, t) => setStatus($(id), m, t);
  const AUTH = 'auth', LOCK = 'authlock', SESSION_MS = 15 * 60 * 1000, MAX_FAILS = 5, LOCK_MS = 5 * 60 * 1000, ITER = 150000;
  let idleTimer = null;

  /* ---------- password hashing (Web Crypto) ---------- */
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function hash(pw, saltBytes, iter) {
    if (!(window.crypto && crypto.subtle)) throw new Error('Secure crypto is not available. Open the site with https:// or localhost.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: iter }, key, 256));
  }
  const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
  async function makeAuth(pw) { const salt = crypto.getRandomValues(new Uint8Array(16)); return { salt: b64(salt), iter: ITER, hash: await hash(pw, salt, ITER) }; }
  async function verify(pw) { const a = store.get(AUTH, null); return !!a && same(await hash(pw, unb64(a.salt), a.iter), a.hash); }
  const strong = pw => pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

  /* ---------- session + lock-out ---------- */
  const isAdmin = () => Number(sessionStorage.getItem('adminUntil') || 0) > Date.now();
  function touch() { sessionStorage.setItem('adminUntil', String(Date.now() + SESSION_MS)); clearTimeout(idleTimer); idleTimer = setTimeout(() => { logout('Logged out after 15 minutes of inactivity.'); }, SESSION_MS); }
  function logout(msg) { sessionStorage.removeItem('adminUntil'); clearTimeout(idleTimer); show(); if (msg) say('loginMsg', msg); }
  const lock = () => store.get(LOCK, { fails: 0, until: 0 });
  const audit = (t, d, o) => { try { window.FVAudit && window.FVAudit.log(t, d, o); } catch (e) { /* auditing is best effort */ } }; // no passwords or personal data are ever passed
  const need = () => { if (!isAdmin()) { audit('admin_action_denied', 'no_valid_session', 'blocked'); logout('Please log in again.'); return false; } touch(); return true; }; // re-checked before every admin action

  function show() {
    const has = !!store.get(AUTH, null), ok = isAdmin();
    $('gate').hidden = ok || !has; $('setup').hidden = ok || has; $('panel').hidden = !ok;
    if (ok) render();
  }

  $('setupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const p1 = $('sp1').value, p2 = $('sp2').value;
    if (!strong(p1)) return say('setupMsg', 'Use at least 8 characters with letters and numbers.', 'bad');
    if (p1 !== p2) return say('setupMsg', 'The two passwords do not match.', 'bad');
    try { store.set(AUTH, await makeAuth(p1)); } catch (err) { return say('setupMsg', err.message, 'bad'); }
    $('sp1').value = $('sp2').value = ''; touch(); show(); toast('Admin password created');
  });

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const l = lock();
    if (l.until > Date.now()) { audit('login_blocked', 'locked_out', 'blocked'); } if (l.until > Date.now()) return say('loginMsg', 'Too many wrong attempts. Try again in ' + Math.ceil((l.until - Date.now()) / 60000) + ' minute(s).', 'bad');
    let ok = false;
    try { ok = await verify($('pw').value); } catch (err) { return say('loginMsg', err.message, 'bad'); }
    $('pw').value = '';
    if (ok) { audit('login_ok', 'admin', 'ok'); store.set(LOCK, { fails: 0, until: 0 }); $('loginMsg').className = ''; $('loginMsg').textContent = ''; touch(); show(); return; }
    const fails = (l.until && l.until <= Date.now() ? 0 : l.fails) + 1;
    audit(fails >= MAX_FAILS ? 'login_lockout' : 'login_failed', 'admin', 'failed');
    store.set(LOCK, fails >= MAX_FAILS ? { fails: 0, until: Date.now() + LOCK_MS } : { fails, until: 0 });
    say('loginMsg', fails >= MAX_FAILS ? 'Too many wrong attempts. Locked for 5 minutes.' : 'Wrong password. ' + (MAX_FAILS - fails) + ' attempt(s) left.', 'bad');
  });

  $('forgot').onclick = () => {
    if (!confirm('Resetting the password DELETES all students, face data and records on this device. Continue?')) return;
    if ((prompt('Type RESET to confirm') || '').trim() !== 'RESET') return toast('Reset cancelled');
    ['people', 'logs', 'settings', AUTH, LOCK].forEach(k => localStorage.removeItem(k));
    audit('data_reset', 'forgot_password', 'ok');
    toast('Everything cleared. Create a new password.'); show();
  };
  $('logout').onclick = () => logout();
  ['click', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (isAdmin()) touch(); }, { passive: true }));

  /* ---------- panel ---------- */
  function render() {
    const people = DB.people(), logs = DB.logs(), s = DB.settings();
    $('a1').textContent = people.length; $('a2').textContent = logs.length;
    $('a3').textContent = new Set(logs.map(l => l.date)).size;
    $('plist').innerHTML = people.length ? people.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.roll)}</td><td>${esc(p.cls || '-')}</td><td>${p.embeddings.length}</td>
      <td><button class="btn alt small" data-act="edit" data-id="${p.id}">Edit</button> <button class="btn danger small" data-act="del" data-id="${p.id}">Remove</button></td></tr>`).join('')
      : '<tr><td colspan="5">No students yet.</td></tr>';
    $('thr').value = s.threshold; $('mar').value = s.margin;
    $('thrv').textContent = (+s.threshold).toFixed(2); $('marv').textContent = (+s.margin).toFixed(2);
  }

  $('plist').addEventListener('click', e => {
    if (!need()) return;
    const b = e.target.closest('button'); if (!b) return;
    const id = +b.dataset.id, people = DB.people(), p = people.find(q => q.id === id); if (!p) return;
    if (b.dataset.act === 'del') {
      if (!confirm('Remove ' + p.name + '? Their past attendance records are kept.')) return;
      DB.save('people', people.filter(q => q.id !== id)); toast('Student removed'); render(); return;
    }
    const n = prompt('Name', p.name); if (n === null) return;
    const rl = prompt('Roll / ID', p.roll); if (rl === null) return;
    const cl = prompt('Class', p.cls || ''); if (cl === null) return;
    const nn = Check.name(n), rr = Check.roll(rl);
    if (!nn || !rr) return toast('Enter a valid name and roll number');
    if (people.some(q => q.id !== id && String(q.roll).toLowerCase() === rr.toLowerCase())) return toast('Roll number already used');
    Object.assign(p, { name: nn, roll: rr, cls: Check.cls(cl) });
    DB.save('people', people);
    const logs = DB.logs(); logs.forEach(l => { if (l.id === id) { l.name = p.name; l.roll = p.roll; l.cls = p.cls; } }); DB.save('logs', logs);
    toast('Student updated'); render();
  });

  $('thr').oninput = () => $('thrv').textContent = (+$('thr').value).toFixed(2);
  $('mar').oninput = () => $('marv').textContent = (+$('mar').value).toFixed(2);
  $('saveSet').onclick = () => {
    if (!need()) return;
    const s = DB.settings(); s.threshold = Check.num($('thr').value, 0.3, 0.8, 0.5); s.margin = Check.num($('mar').value, 0, 0.2, 0.06);
    if (DB.save('settings', s)) toast('Settings saved');
  };

  $('passForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!need()) return;
    const cur = $('cp').value, np = $('np').value;
    try {
      if (!(await verify(cur))) return say('passMsg', 'Current password is wrong.', 'bad');
      if (!strong(np)) return say('passMsg', 'Use at least 8 characters with letters and numbers.', 'bad');
      store.set(AUTH, await makeAuth(np));
    } catch (err) { return say('passMsg', err.message, 'bad'); }
    $('cp').value = $('np').value = ''; say('passMsg', 'Password changed.', 'ok');
  });

  $('export').onclick = () => {
    if (!need()) return;
    download('attendance-backup.json', JSON.stringify({ app: 'FaceVector', version: 2, people: DB.people(), logs: DB.logs(), settings: DB.settings() }), 'application/json');
  };
  $('import').onchange = e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || !need()) return;
    if (f.size > 20 * 1024 * 1024) return toast('File is too large (max 20 MB)');
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.people) || !Array.isArray(d.logs)) throw new Error('bad file');
        const people = d.people.map(Check.person).filter(Boolean), logs = d.logs.map(Check.log).filter(Boolean); // every record is re-validated
        if (!confirm(`Replace all current data with ${people.length} students and ${logs.length} records from this backup?`)) return;
        DB.save('people', people); DB.save('logs', logs);
        if (d.settings) { const s = d.settings; DB.save('settings', { threshold: Check.num(s.threshold, 0.3, 0.8, 0.5), margin: Check.num(s.margin, 0, 0.2, 0.06), session: Check.text(s.session, 40) || 'General' }); }
        toast('Backup imported'); render();
      } catch (err) { toast('That file is not a valid backup'); }
    };
    r.readAsText(f);
  };

  $('clearLogs').onclick = () => { if (need() && confirm('Delete ALL attendance records?')) { DB.save('logs', []); toast('Records deleted'); render(); } };
  $('clearAll').onclick = () => { if (need() && confirm('Delete ALL students, face data and records?')) { DB.save('people', []); DB.save('logs', []); toast('Everything deleted'); render(); } };

  if (isAdmin()) touch();
  show();
})();
