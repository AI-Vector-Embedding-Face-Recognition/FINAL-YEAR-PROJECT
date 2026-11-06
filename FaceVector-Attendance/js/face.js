/* Camera + 128-D face embeddings (face-api.js, runs fully in the browser)
   + distance/similarity maths + 2D projection (PCA) for the map. */

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/';
let stream = null, facing = 'user', modelsPromise = null;

function loadModels() {
  if (typeof faceapi === 'undefined') return Promise.reject(new Error('face-api.js did not load'));
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]).catch(e => { modelsPromise = null; throw e; });
  }
  return modelsPromise;
}

/* ---------- Camera: laptop webcam, phone front camera, phone back camera ---------- */
let cameraCount = 0;

function isBackCamera(track, mode) {
  const st = track.getSettings ? track.getSettings() : {};
  if (st.facingMode) return st.facingMode === 'environment';
  if (/back|rear|environment/i.test(track.label || '')) return true;
  return false; // laptop webcams report nothing: treat as a front (mirrored) camera
}

async function startCamera(video, mode = facing, deviceId = null) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'Unsupported' });
  if (!window.isSecureContext) throw Object.assign(new Error('insecure'), { name: 'Insecure' });
  await ensureCameraConsent();
  stopCamera(video);
  facing = mode;
  const size = { width: { ideal: 640 }, height: { ideal: 480 } };
  // try the exact camera first, then relax: exact side -> preferred side -> any camera
  const tries = deviceId
    ? [{ ...size, deviceId: { exact: deviceId } }]
    : [{ ...size, facingMode: { exact: mode } }, { ...size, facingMode: { ideal: mode } }, true];
  let lastErr = null;
  for (const v of tries) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); break; }
    catch (e) {
      lastErr = e;
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { showCameraDialog('denied'); throw e; }
      if (!['OverconstrainedError', 'ConstraintNotSatisfiedError', 'NotFoundError', 'TypeError'].includes(e.name)) throw e; // permission denied, camera busy...
    }
  }
  if (!stream) throw lastErr || new Error('no camera');

  const track = stream.getVideoTracks()[0];
  track.addEventListener('ended', () => { stopCamera(video); document.dispatchEvent(new Event('camerastopped')); });
  video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = stream;
  await video.play();
  const back = isBackCamera(track, mode);
  facing = back ? 'environment' : 'user';
  const box = video.closest('.cam');
  if (box) {
    box.classList.toggle('back', back);
    const ph = box.querySelector('.ph'); if (ph) ph.hidden = true;
    if (!box.querySelector('.live')) { const l = document.createElement('div'); l.className = 'live'; l.textContent = 'LIVE'; box.appendChild(l); }
  }
  try { localStorage.setItem('fv-cam-ok', '1'); } catch (e) { /* optional */ }
  await fillCameraList(track);
}

function stopCamera(video) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; video.srcObject = null;
  const box = video.closest('.cam');
  if (box) { const ph = box.querySelector('.ph'); if (ph) ph.hidden = false; const l = box.querySelector('.live'); if (l) l.remove(); }
}

async function flipCamera(video) {
  if (cameraCount < 2) throw Object.assign(new Error('single'), { name: 'SingleCamera' });
  return startCamera(video, facing === 'user' ? 'environment' : 'user');
}

// Fills the optional <select id="camsel"> so a laptop with several cameras can pick one.
async function fillCameraList(track) {
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    cameraCount = cams.length;
    const sel = document.getElementById('camsel'); if (!sel) return;
    sel.innerHTML = cams.map((c, i) => `<option value="${esc(c.deviceId)}">${esc(c.label || 'Camera ' + (i + 1))}</option>`).join('');
    const cur = track.getSettings && track.getSettings().deviceId;
    if (cur) sel.value = cur;
    sel.hidden = cams.length < 2;
  } catch (e) { cameraCount = 2; /* cannot list cameras: allow the Switch button anyway */ }
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('camsel'), video = document.getElementById('video');
  if (sel && video) sel.onchange = async () => {
    try { await startCamera(video, facing, sel.value); } catch (e) { const s = document.getElementById('status'); if (s) setStatus(s, cameraError(e), 'bad'); }
  };
});

// privacy + battery: release the camera when the page is hidden or closed
document.addEventListener('visibilitychange', () => {
  if (document.hidden && stream) { const v = document.getElementById('video'); if (v) stopCamera(v); document.dispatchEvent(new Event('camerastopped')); }
});
window.addEventListener('pagehide', () => { if (stream) stream.getTracks().forEach(t => t.stop()); });


/* ---------- Camera permission notification (asks nicely BEFORE the browser prompt) ---------- */
async function cameraPermissionState() {
  try { if (navigator.permissions && navigator.permissions.query) return (await navigator.permissions.query({ name: 'camera' })).state; } catch (e) { /* Safari etc. */ }
  try { return localStorage.getItem('fv-cam-ok') ? 'granted' : 'prompt'; } catch (e) { return 'prompt'; }
}

function showCameraDialog(kind) {
  return new Promise(resolve => {
    document.getElementById('camdlg')?.remove();
    const denied = kind === 'denied';
    const wrap = document.createElement('div');
    wrap.id = 'camdlg'; wrap.className = 'dlg-back';
    wrap.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="camdlgT">
      <div class="dlg-ico" aria-hidden="true">${denied ? '&#128683;' : '&#128247;'}</div>
      <h2 id="camdlgT">${denied ? 'Camera access is blocked' : 'Allow camera access'}</h2>
      ${denied ? `<p>The browser is blocking the camera for this site. Turn it on, then press <b>Try again</b>:</p>
        <ul class="clean">
          <li><b>Chrome / Edge (laptop):</b> click the lock icon next to the address, set <b>Camera</b> to <b>Allow</b>.</li>
          <li><b>Chrome (Android):</b> lock icon &rarr; <b>Permissions</b> &rarr; <b>Camera</b> &rarr; Allow.</li>
          <li><b>Safari (iPhone):</b> <b>aA</b> menu &rarr; <b>Website Settings</b> &rarr; <b>Camera</b> &rarr; Allow.</li>
          <li><b>Firefox:</b> click the camera icon in the address bar and remove the block.</li>
        </ul>`
      : `<p>FaceVector needs your camera to see the face and mark attendance. Your browser will now ask for permission: please choose <b>Allow</b>.</p>
        <ul class="clean"><li>Video stays on this device and is never uploaded or recorded.</li><li>The camera turns off when you press stop or leave the page.</li><li>On a phone you can use the front or back camera.</li></ul>`}
      <div class="row"><button class="btn" id="camdlgOk">${denied ? 'Try again' : 'Allow camera'}</button><button class="btn alt" id="camdlgNo">${denied ? 'Close' : 'Not now'}</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const done = v => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    wrap.querySelector('#camdlgOk').onclick = () => done(true);
    wrap.querySelector('#camdlgNo').onclick = () => done(false);
    wrap.onclick = e => { if (e.target === wrap) done(false); };
    wrap.querySelector('#camdlgOk').focus();
  });
}

async function ensureCameraConsent() {
  const st = await cameraPermissionState();
  if (st === 'granted') return;
  if (st === 'denied') {
    // Let the user open site settings, enable the camera, and then retry.
    if (!(await showCameraDialog('denied'))) throw Object.assign(new Error('cancelled'), { name: 'Cancelled' });
    const afterSettings = await cameraPermissionState();
    if (afterSettings === 'denied') throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    return;
  }
  if (!(await showCameraDialog('ask'))) throw Object.assign(new Error('cancelled'), { name: 'Cancelled' });
}

function cameraError(e) {
  if (!window.isSecureContext || (e && e.name === 'Insecure')) return 'Camera needs a secure page. Open this site with https:// or localhost.';
  switch (e && e.name) {
    case 'Cancelled': return 'Camera not started. Press Start camera and choose Allow camera.';
    case 'Unsupported': return 'This browser does not support camera access. Use a current Chrome, Edge, Firefox or Safari.';
    case 'SingleCamera': return 'This device has only one camera.';
    case 'NotAllowedError': case 'SecurityError': return 'Camera permission was denied. Allow camera access in the browser address bar or site settings, then try again.';
    case 'NotFoundError': case 'OverconstrainedError': return 'No camera found on this device.';
    case 'NotReadableError': case 'AbortError': return 'The camera is being used by another app. Close it and try again.';
    default: return 'Could not open the camera. Try again.';
  }
}

/* ---------- Embedding ---------- */
// Returns {embedding:[128 numbers], box, score} or null when no face is found.
async function getEmbedding(video) {
  if (!video.videoWidth) return null;
  const r = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks().withFaceDescriptor();
  return r ? { embedding: Array.from(r.descriptor), box: r.detection.box, score: r.detection.score } : null;
}

// Rejects blurry / tiny / badly lit faces instead of guessing.
function faceQuality(r, video) {
  if (r.score < 0.6) return { ok: false, msg: 'Face not clear. Improve the light.' };
  if (r.box.width < video.videoWidth * 0.22) return { ok: false, msg: 'Move closer to the camera.' };
  return { ok: true, msg: 'Good quality' };
}

/* ---------- Distance and similarity ---------- */
function euclidean(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); }
function cosine(a, b) {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / (Math.sqrt(x) * Math.sqrt(y) || 1);
}

// Closest stored sample of every person, sorted nearest first.
function rankPeople(embedding) {
  return DB.people().map(p => {
    let best = null;
    for (const e of p.embeddings) { const d = euclidean(embedding, e); if (!best || d < best.distance) best = { distance: d, similarity: cosine(embedding, e) }; }
    return best && { person: p, distance: best.distance, similarity: best.similarity };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance);
}

// status: 'match' | 'uncertain' (two people too close) | 'unknown' (too far) | 'empty'
function findMatch(embedding) {
  const ranks = rankPeople(embedding), s = DB.settings();
  const best = ranks[0], second = ranks[1];
  if (!best) return { status: 'empty' };
  if (best.distance >= s.threshold) return { status: 'unknown', best, second };
  if (second && second.distance - best.distance < s.margin) return { status: 'uncertain', best, second };
  return { status: 'match', best, second };
}

/* ---------- 2D model: PCA squashes 128-D vectors to (x, y) ---------- */
function buildPCA(X) {
  const n = X.length, m = X[0].length;
  const mean = Array(m).fill(0);
  X.forEach(r => r.forEach((v, i) => mean[i] += v / n));
  const C = X.map(r => r.map((v, i) => v - mean[i]));
  const comps = [];
  for (let k = 0; k < 2; k++) {
    let v = Array.from({ length: m }, (_, i) => Math.sin(i * 12.9898 + k * 78.233)); // fixed start = same map every time
    for (let it = 0; it < 80; it++) {
      const w = Array(m).fill(0);
      C.forEach(r => { let s = 0; for (let i = 0; i < m; i++) s += r[i] * v[i]; for (let i = 0; i < m; i++) w[i] += s * r[i]; });
      if (k === 1) { let d = 0; for (let i = 0; i < m; i++) d += w[i] * comps[0][i]; for (let i = 0; i < m; i++) w[i] -= d * comps[0][i]; }
      const len = Math.hypot(...w);
      if (!len) break;
      v = w.map(x => x / len);
    }
    comps.push(v);
  }
  const project = r => comps.map(c => { let s = 0; for (let i = 0; i < m; i++) s += (r[i] - mean[i]) * c[i]; return s; });
  return { project, points: X.map(project) };
}
