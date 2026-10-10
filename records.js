/* Records page: filters, attendance log, per-student percentage, CSV export. */
(function () {
  const sessOf = l => l.session || 'General';

  function fillSessions() {
    const cur = $('fsession').value;
    const list = [...new Set(DB.logs().map(sessOf))].sort();
    $('fsession').innerHTML = '<option value="">All sessions</option>' + list.map(s => `<option>${esc(s)}</option>`).join('');
    $('fsession').value = list.includes(cur) ? cur : '';
  }

  function filtered() {
    const d = $('fdate').value, q = $('fsearch').value.trim().toLowerCase(), s = $('fsession').value;
    return DB.logs().filter(l => (!d || l.date === d) && (!s || sessOf(l) === s) && (!q || (l.name + ' ' + l.roll).toLowerCase().includes(q)));
  }

  function render() {
    const rows = filtered().reverse();
    $('logs').innerHTML = rows.length
      ? rows.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.roll)}</td><td>${esc(sessOf(l))}</td><td>${esc(l.date)}</td><td>${esc(l.time)}</td></tr>`).join('')
      : '<tr><td colspan="5">No records match.</td></tr>';

    // Percentage = days present / days on which attendance was taken (for the chosen session)
    const s = $('fsession').value;
    const all = DB.logs().filter(l => !s || sessOf(l) === s);
    const days = new Set(all.map(l => l.date)).size;
    const people = DB.people();
    $('summary').innerHTML = people.length ? people.map(p => {
      const present = new Set(all.filter(l => l.id === p.id).map(l => l.date)).size;
      const pct = days ? Math.round(present / days * 100) : 0;
      return `<tr><td>${esc(p.name)}</td><td>${esc(p.roll)}</td><td>${present} / ${days}</td>
        <td><div class="meter ${pct < 75 ? 'low' : ''}"><i style="width:${pct}%"></i></div></td><td>${pct}%</td></tr>`;
    }).join('') : '<tr><td colspan="5">No registered people.</td></tr>';

    $('k1').textContent = DB.logs().length;
    $('k2').textContent = new Set(DB.logs().map(l => l.date)).size;
    $('k3').textContent = people.length;
    $('k4').textContent = new Set(DB.logs().filter(l => l.date === DB.today()).map(l => l.id)).size;
  }

  ['fdate', 'fsearch', 'fsession'].forEach(id => $(id).addEventListener('input', render));
  $('fclear').onclick = () => { $('fdate').value = $('fsearch').value = ''; $('fsession').value = ''; render(); };

  $('csv').onclick = () => {
    const head = ['Name', 'Roll', 'Class', 'Session', 'Date', 'Time', 'Distance', 'Similarity'];
    const rows = filtered().map(l => [l.name, l.roll, l.cls || '', sessOf(l), l.date, l.time, l.distance ?? '', l.similarity ?? '']);
    download('attendance.csv', '\ufeff' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };

  fillSessions(); render();
})();
