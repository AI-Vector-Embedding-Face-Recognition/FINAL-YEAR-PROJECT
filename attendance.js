/* Take attendance: scan the face, match the 128-D vector, save name + time. */
(function () {
  const REQUIRED = 2; // same person must be matched on 2 scans in a row (fewer false positives)
  const video = $('video'), overlay = $('overlay');
  let running = false, ready = false, streak = { id: null, n: 0 };

  const say = (m, t) => setStatus($('status'), m, t);
  const session = () => ($('session').value.trim() || 'General');

  $('session').value = DB.settings().session;
  $('session').onchange = () => { const s = DB.settings(); s.session = session(); DB.save('settings', s); };

  function render() {
    const rows = DB.logs().filter(l => l.date === DB.today()).reverse();
    $('present').textContent = new Set(rows.map(l => l.id)).size + ' / ' + DB.people().length;
    $('list').innerHTML = rows.length
      ? rows.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.roll)}</td><td>${esc(l.session || 'General')}</td><td>${esc(l.time)}</td></tr>`).join('')
      : '<tr><td colspan="4">No one marked yet.</td></tr>';
  }

  function result(kind, best) {
    const el = $('result');
    const pct = best ? Math.round(best.similarity * 100) : 0;
    const info = best ? `<div class="muted">Distance ${best.distance.toFixed(2)} &middot; cosine similarity ${pct}%</div>` : '';
    if (kind === 'new' || kind === 'dup') {
      const p = best.person;
      el.className = 'result ok';
      el.innerHTML = `<span class="badge ok">${kind === 'new' ? 'Marked present' : 'Already marked today'}</span><div class="big">${esc(p.name)}</div><div class="muted">Roll ${esc(p.roll)}${p.cls ? ' &middot; ' + esc(p.cls) : ''}</div>${info}`;
    } else if (kind === 'uncertain') {
      el.className = 'result bad';
      el.innerHTML = '<span class="badge warn">Not sure</span><div class="big">Two people look similar</div><div class="muted">Move closer, face the camera and try again.</div>';
    } else {
      el.className = 'result bad';
      el.innerHTML = '<span class="badge bad">Not recognised</span><div class="big">Unknown face</div><div class="muted">Register this person first, or try better light.</div>';
    }
  }

  function mark(best) {
    const p = best.person, s = session(), logs = DB.logs();
    if (logs.some(l => l.id === p.id && l.date === DB.today() && (l.session || 'General') === s)) return 'dup';
    logs.push({ id: p.id, name: p.name, roll: p.roll, cls: p.cls || '', session: s, date: DB.today(),
      time: new Date().toLocaleTimeString(), distance: +best.distance.toFixed(3), similarity: +best.similarity.toFixed(3) });
    if (!DB.save('logs', logs)) return 'dup';
    render(); beep(); toast('Attendance saved for ' + p.name);
    return 'new';
  }

  const box = (x, b, c) => { x.lineWidth = 4; x.strokeStyle = c; x.strokeRect(b.x, b.y, b.width, b.height); };

  async function scan() {
    if (!running) return;
    let r = null;
    try { r = await getEmbedding(video); } catch (e) { /* skip frame */ }
    const x = overlay.getContext('2d');
    overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 480;
    x.clearRect(0, 0, overlay.width, overlay.height);
    if (!r) { streak = { id: null, n: 0 }; say('Looking for a face...'); }
    else {
      const q = faceQuality(r, video);
      if (!q.ok) { streak = { id: null, n: 0 }; box(x, r.box, '#d99a2b'); say(q.msg, 'bad'); }
      else {
        const m = findMatch(r.embedding);
        if (m.status === 'match') {
          box(x, r.box, '#14866d');
          const id = m.best.person.id;
          streak = streak.id === id ? { id, n: streak.n + 1 } : { id, n: 1 };
          if (streak.n >= REQUIRED) { const k = mark(m.best); result(k, m.best); say('Face verified.', 'ok'); }
          else say('Verifying...');
        } else {
          streak = { id: null, n: 0 }; box(x, r.box, '#c8432b');
          result(m.status, m.best); say(m.status === 'uncertain' ? 'Not sure. Try again.' : 'Face not recognised.', 'bad');
        }
      }
    }
    if (running) setTimeout(scan, 450);
  }

  function stopAll() {
    running = false; stopCamera(video);
    overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    $('start').textContent = 'Start scanning'; $('flip').disabled = true; say('Stopped.');
  }

  loadModels().then(() => { ready = true; say('Models ready. Press Start scanning.'); })
    .catch(() => say('Could not load the face models. Check your internet connection and reload.', 'bad'));

  $('start').onclick = async () => {
    if (running) return stopAll();
    if (!ready) return say('Models are still loading...');
    if (!DB.people().length) return say('No registered people. Register a face first.', 'bad');
    try { await startCamera(video); } catch (e) { return say(cameraError(e), 'bad'); }
    running = true; streak = { id: null, n: 0 };
    $('start').textContent = 'Stop scanning'; $('flip').disabled = false; scan();
  };

  $('flip').onclick = async () => { try { await flipCamera(video); } catch (e) { say(cameraError(e), 'bad'); } };

  render();
})();
