/* Camera + 128-D face embeddings (face-api.js, runs fully in the browser)
   + distance/similarity maths + 2D projection (PCA) for the map. */

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
let stream = null, facing = 'user', modelsPromise = null;

function loadModels() {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]).catch(e => { modelsPromise = null; throw e; });
  }
  return modelsPromise;
}

/* ---------- Camera (laptop webcam or phone front/back camera) ---------- */
async function startCamera(video, mode = facing) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('unsupported');
  stopCamera(video);
  facing = mode;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch (e) {
    if (e.name === 'OverconstrainedError') stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    else throw e;
  }
  video.srcObject = stream;
  await video.play();
  const box = video.closest('.cam');
  if (box) { box.classList.toggle('back', mode === 'environment'); const ph = box.querySelector('.ph'); if (ph) ph.hidden = true; }
}

function stopCamera(video) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; video.srcObject = null;
  const box = video.closest('.cam'); const ph = box && box.querySelector('.ph'); if (ph) ph.hidden = false;
}

const flipCamera = video => startCamera(video, facing === 'user' ? 'environment' : 'user');

function cameraError(e) {
  if (!window.isSecureContext) return 'Camera needs a secure page. Open this site with https:// or localhost.';
  switch (e && e.name) {
    case 'NotAllowedError': return 'Camera permission was denied. Allow camera access in the browser address bar, then try again.';
    case 'NotFoundError': return 'No camera found on this device.';
    case 'NotReadableError': return 'The camera is being used by another app. Close it and try again.';
    default: return 'Could not open the camera. ' + (e && e.message ? e.message : '');
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
