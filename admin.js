/* Admin: demo password gate, manage students, settings, backup. 
   NOTE: this is a front-end demo lock only. Real security needs a backend. */
(function () {
  const say = (id, m, t) => setStatus($(id), m, t);

  function show() {
    const ok = sessionStorage.getItem('adminOK') === '1';
    $('gate').hidden = ok; $('panel').hidden = !ok;
    if (ok) render();
  }

  $('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    if ($('pw').value === DB.settings().pass) { sessionStorage.setItem('adminOK', '1'); $('pw').value = ''; $('loginMsg').className = ''; $('loginMsg').textContent = ''; show(); }
    else say('loginMsg', 'Wrong password.', 'bad');
  });
  $('logout').onclick = () => { sessionStorage.removeItem('adminOK'); show(); };

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
    const b = e.target.closest('button'); if (!b) return;
    const id = +b.dataset.id, people = DB.people(), p = people.find(q => q.id === id); if (!p) return;
    if (b.dataset.act === 'del') {
      if (!confirm('Remove ' + p.name + '? Their past attendance records are kept.')) return;
      DB.save('people', people.filter(q => q.id !== id)); toast('Student removed'); render(); return;
    }
    const n = prompt('Name', p.name); if (n === null) return;
    const rl = prompt('Roll / ID', p.roll); if (rl === null) return;
    const cl = prompt('Class', p.cls || ''); if (cl === null) return;
    if (!n.trim() || !rl.trim()) return toast('Name and roll are required');
    if (people.some(q => q.id !== id && String(q.roll).toLowerCase() === rl.trim().toLowerCase())) return toast('Roll number already used');
    Object.assign(p, { name: n.trim(), roll: rl.trim(), cls: cl.trim() });
    DB.save('people', people);
    const logs = DB.logs(); logs.forEach(l => { if (l.id === id) { l.name = p.name; l.roll = p.roll; l.cls = p.cls; } }); DB.save('logs', logs);
    toast('Student updated'); render();
  });

  $('thr').oninput = () => $('thrv').textContent = (+$('thr').value).toFixed(2);
  $('mar').oninput = () => $('marv').textContent = (+$('mar').value).toFixed(2);
  $('saveSet').onclick = () => {
    const s = DB.settings(); s.threshold = +$('thr').value; s.margin = +$('mar').value;
    if (DB.save('settings', s)) toast('Settings saved');
  };

  $('passForm').addEventListener('submit', e => {
    e.preventDefault();
    const np = $('np').value;
    if (np.length < 4) return say('passMsg', 'Use at least 4 characters.', 'bad');
    const s = DB.settings(); s.pass = np; DB.save('settings', s); $('np').value = ''; say('passMsg', 'Password changed.', 'ok');
  });

  $('export').onclick = () => {
    const s = DB.settings(); delete s.pass;
    download('attendance-backup.json', JSON.stringify({ people: DB.people(), logs: DB.logs(), settings: s }), 'application/json');
  };
  $('import').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.people) || !Array.isArray(d.logs)) throw new Error('bad file');
        if (!confirm('Replace all current students and records with this backup?')) return;
        DB.save('people', d.people); DB.save('logs', d.logs);
        if (d.settings) DB.save('settings', { ...DB.settings(), ...d.settings, pass: DB.settings().pass });
        toast('Backup imported'); render();
      } catch (err) { toast('That file is not a valid backup'); }
      e.target.value = '';
    };
    r.readAsText(f);
  };

  $('clearLogs').onclick = () => { if (confirm('Delete ALL attendance records?')) { DB.save('logs', []); toast('Records deleted'); render(); } };
  $('clearAll').onclick = () => { if (confirm('Delete ALL students, face data and records?')) { DB.save('people', []); DB.save('logs', []); toast('Everything deleted'); render(); } };

  show();
})();
