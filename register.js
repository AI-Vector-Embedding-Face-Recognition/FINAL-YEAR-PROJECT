/* Register face page: capture 5 samples, check quality, save name + embeddings. */
(function () {
  const NEEDED = 5;
  const video = $('video'), overlay = $('overlay');
  let samples = [], live = null, running = false, ready = false;

  const say = (m, t) => setStatus($('status'), m, t);

  function refresh() {
    $('count').textContent = samples.length;
    $('bar').firstElementChild.style.width = (samples.length / NEEDED * 100) + '%';
    $('save').disabled = samples.length < NEEDED;
    $('cap').disabled = !running || !ready || samples.length >= NEEDED;
    $('flip').disabled = !running;
  }

  function recent() {
    const ps = DB.people().slice(-5).reverse();
    $('recent').innerHTML = ps.length
      ? ps.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.roll)}</td><td>${esc(p.cls || '-')}</td></tr>`).join('')
      : '<tr><td colspan="3">No one registered yet.</td></tr>';
  }

  async function loop() {
    if (!running) return;
    let r = null;
    try { r = await getEmbedding(video); } catch (e) { /* skip frame */ }
    const x = overlay.getContext('2d');
    overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 480;
    x.clearRect(0, 0, overlay.width, overlay.height);
    const q = $('quality');
    if (r) {
      const qual = faceQuality(r, video);
      live = { r, q: qual };
      x.lineWidth = 4; x.strokeStyle = qual.ok ? '#14866d' : '#d99a2b';
      x.strokeRect(r.box.x, r.box.y, r.box.width, r.box.height);
      q.textContent = qual.msg; q.className = 'badge ' + (qual.ok ? 'ok' : 'warn');
    } else {
      live = null; q.textContent = 'No face found'; q.className = 'badge bad';
    }
    if (running) setTimeout(loop, 450);
  }

  function stopAll() {
    running = false; stopCamera(video);
    overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    $('start').textContent = 'Start camera';
    $('quality').textContent = 'Camera off'; $('quality').className = 'badge';
    refresh();
  }

  loadModels().then(() => { ready = true; say('Models ready. Start the camera.'); refresh(); })
    .catch(() => say('Could not load the face models. Check your internet connection and reload.', 'bad'));

  $('start').onclick = async () => {
    if (running) return stopAll();
    if (!ready) return say('Models are still loading...');
    try { await startCamera(video); } catch (e) { return say(cameraError(e), 'bad'); }
    running = true; $('start').textContent = 'Stop camera';
    say('Camera on. Look at the camera and press Capture.', 'ok'); refresh(); loop();
  };

  $('flip').onclick = async () => {
    try { await flipCamera(video); } catch (e) { say(cameraError(e), 'bad'); }
  };

  $('cap').onclick = () => {
    if (!live) return say('No face found. Face the camera.', 'bad');
    if (!live.q.ok) return say(live.q.msg, 'bad');
    const e = live.r.embedding;
    if (samples.length && euclidean(e, samples[0]) > 0.6) return say('This looks like a different face. Only one person at a time.', 'bad');
    samples.push(e);
    say(samples.length < NEEDED ? `Sample ${samples.length} of ${NEEDED} captured. Turn your head slightly.` : 'All samples captured. Press Save person.', 'ok');
    refresh();
  };

  $('reset').onclick = () => { samples = []; say('Samples cleared.'); refresh(); };

  $('save').onclick = () => {
    const n = $('name').value.trim(), rl = $('roll').value.trim(), cl = $('cls').value.trim();
    if (!n || !rl) return toast('Enter name and roll number');
    const people = DB.people();
    if (people.some(p => String(p.roll).toLowerCase() === rl.toLowerCase())) return toast('This roll number already exists');
    const dup = rankPeople(samples[0])[0];
    if (dup && dup.distance < DB.settings().threshold &&
        !confirm('This face looks like ' + dup.person.name + '. Register as a new person anyway?')) return;
    people.push({ id: Date.now(), name: n, roll: rl, cls: cl, embeddings: samples, created: new Date().toISOString() });
    if (!DB.save('people', people)) return;
    toast(n + ' registered');
    samples = []; $('name').value = $('roll').value = $('cls').value = '';
    say('Saved. You can register the next person.', 'ok'); refresh(); recent();
  };

  refresh(); recent();
})();
