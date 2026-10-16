/* 2D Lab: PCA map of all stored face vectors + test a live face against them. */
(function () {
  const c = $('map'), x = c.getContext('2d'), video = $('video');
  const W = c.width, H = c.height, PAD = 60;
  const color = i => 'hsl(' + (i * 67 % 360) + ',65%,40%)';
  let model = null, pts = [], test = null, hover = -1, running = false;
  const say = (m, t) => setStatus($('status'), m, t);

  function build() {
    pts = [];
    DB.people().forEach((p, i) => p.embeddings.forEach((e, j) => pts.push({ e, i, j, name: p.name, roll: p.roll })));
    model = pts.length ? buildPCA(pts.map(p => p.e)) : null;
    if (model) pts.forEach((p, k) => p.xy = model.points[k]);
    $('legend').innerHTML = DB.people().map((p, i) => `<span class="chip"><i style="background:${color(i)}"></i>${esc(p.name)}</span>`).join('');
    $('stats').textContent = pts.length ? `${DB.people().length} people, ${pts.length} vectors (128-D) shown in 2D` : 'No data yet';
  }

  const scale = (v, min, r, size) => r < 1e-9 ? size / 2 : (v - min) / r * size;

  function star(cx, cy, r) {
    x.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, d = k % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
    x.closePath(); x.fill(); x.stroke();
  }

  function draw() {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#e4e9f3'; x.lineWidth = 1;
    for (let k = 0; k <= 8; k++) { const gx = PAD + k * (W - 2 * PAD) / 8, gy = PAD + k * (H - 2 * PAD) / 8; x.beginPath(); x.moveTo(gx, PAD); x.lineTo(gx, H - PAD); x.moveTo(PAD, gy); x.lineTo(W - PAD, gy); x.stroke(); }
    x.fillStyle = '#5f6b85'; x.font = '14px sans-serif'; x.textAlign = 'left';
    x.fillText('PC 1 (x)', W - PAD - 54, H - 24); x.fillText('PC 2 (y)', 14, PAD - 20);
    if (!pts.length) { x.fillStyle = '#2f4a45'; x.font = '16px sans-serif'; x.fillText('No data yet. Register a face to see the map.', PAD, PAD + 20); return; }

    const all = pts.map(p => p.xy).concat(test ? [test] : []);
    const xs = all.map(a => a[0]), ys = all.map(a => a[1]);
    const minx = Math.min(...xs), miny = Math.min(...ys), rx = Math.max(...xs) - minx, ry = Math.max(...ys) - miny;
    pts.forEach(p => { p.sx = PAD + scale(p.xy[0], minx, rx, W - 2 * PAD); p.sy = H - PAD - scale(p.xy[1], miny, ry, H - 2 * PAD); });

    const cent = {};
    pts.forEach((p, k) => { (cent[p.i] = cent[p.i] || { sx: 0, sy: 0, n: 0, name: p.name }); cent[p.i].sx += p.sx; cent[p.i].sy += p.sy; cent[p.i].n++; });
    Object.values(cent).forEach(o => { o.sx /= o.n; o.sy /= o.n; });

    pts.forEach((p, k) => {
      x.fillStyle = color(p.i); x.globalAlpha = hover === k ? 1 : 0.85;
      x.beginPath(); x.arc(p.sx, p.sy, hover === k ? 10 : 7, 0, 7); x.fill();
      x.globalAlpha = 1;
    });
    x.font = 'bold 14px sans-serif'; x.fillStyle = '#16213e';
    Object.values(cent).forEach(o => x.fillText(o.name, o.sx + 12, o.sy - 12));

    if (test) {
      const tx = PAD + scale(test[0], minx, rx, W - 2 * PAD), ty = H - PAD - scale(test[1], miny, ry, H - 2 * PAD);
      x.fillStyle = '#f2b632'; x.strokeStyle = '#16213e'; x.lineWidth = 2; star(tx, ty, 14);
      x.fillStyle = '#16213e'; x.fillText('You', tx + 16, ty - 14);
    }
  }

  // Hover / touch: show which sample a dot belongs to
  function onMove(e) {
    const r = c.getBoundingClientRect(), mx = (e.clientX - r.left) * W / r.width, my = (e.clientY - r.top) * H / r.height;
    let best = -1, bd = 18;
    pts.forEach((p, k) => { const d = Math.hypot(p.sx - mx, p.sy - my); if (d < bd) { bd = d; best = k; } });
    if (best !== hover) {
      hover = best; draw();
      $('hover').textContent = best >= 0 ? `${pts[best].name} (roll ${pts[best].roll}), sample ${pts[best].j + 1}` : 'Hover or tap a dot to see whose face sample it is.';
    }
  }
  c.addEventListener('pointermove', onMove); c.addEventListener('pointerdown', onMove);

  /* ---- Test a live face ---- */
  loadModels().then(() => say('Models ready. Start the camera to test a face.')).catch(() => say('Could not load the face models.', 'bad'));

  $('start').onclick = async () => {
    if (running) { running = false; stopCamera(video); $('start').textContent = 'Start camera'; $('plot').disabled = true; $('flip').disabled = true; return; }
    if (!model) return say('Register at least one person first.', 'bad');
    try { await loadModels(); await startCamera(video); } catch (e) { return say(cameraError(e), 'bad'); }
    running = true; $('start').textContent = 'Stop camera'; $('plot').disabled = false; $('flip').disabled = false; say('Camera on. Press Plot my face.', 'ok');
  };
  $('flip').onclick = async () => { try { await flipCamera(video); } catch (e) { say(cameraError(e), 'bad'); } };

  $('plot').onclick = async () => {
    let r = null; try { r = await getEmbedding(video); } catch (e) { /* handled below */ }
    if (!r) return say('No face found. Face the camera.', 'bad');
    test = model.project(r.embedding); draw();
    const ranks = rankPeople(r.embedding).slice(0, 3), thr = DB.settings().threshold;
    $('vec').textContent = '[' + r.embedding.slice(0, 8).map(v => v.toFixed(2)).join(', ') + ', ... 120 more values]';
    $('ranks').innerHTML = ranks.map(k => `<tr><td>${esc(k.person.name)}</td><td>${k.distance.toFixed(3)}</td><td>${k.similarity.toFixed(3)}</td>
      <td><span class="badge ${k.distance < thr ? 'ok' : 'bad'}">${k.distance < thr ? 'close enough' : 'too far'}</span></td></tr>`).join('');
    say('Face plotted as a star on the map.', 'ok');
  };

  build(); draw();
})();
