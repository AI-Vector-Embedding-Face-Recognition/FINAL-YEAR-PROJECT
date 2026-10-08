/* Camera + face embedding (128-D) using face-api.js, all in the browser. */
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
let stream = null;

async function loadModels() {
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
}

async function startCamera(video) {
  // Works on phone and laptop. Needs https:// or localhost.
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
  video.srcObject = stream;
  await video.play();
}

function stopCamera(video) {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; video.srcObject = null;
}

// Returns {embedding:[128 numbers], box} or null if no face found.
async function getEmbedding(video) {
  const r = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
    .withFaceLandmarks().withFaceDescriptor();
  return r ? { embedding: Array.from(r.descriptor), box: r.detection.box } : null;
}

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// Compare one embedding with every stored one; return the closest person.
function findMatch(embedding) {
  let best = null;
  for (const p of DB.people())
    for (const e of p.embeddings) {
      const d = euclidean(embedding, e);
      if (!best || d < best.distance) best = { person: p, distance: d };
    }
  return best && best.distance < THRESHOLD ? best : null;
}

// 2D method: project 128-D embeddings to 2D with PCA (power iteration).
function pca2D(X) {
  const n = X.length, m = X[0].length;
  const mean = Array(m).fill(0);
  X.forEach(r => r.forEach((v, i) => mean[i] += v / n));
  const C = X.map(r => r.map((v, i) => v - mean[i]));
  const comps = [];
  for (let k = 0; k < 2; k++) {
    let v = Array.from({ length: m }, () => Math.random() - 0.5);
    for (let it = 0; it < 60; it++) {
      const w = Array(m).fill(0);
      C.forEach(r => { const s = r.reduce((a, x, i) => a + x * v[i], 0); r.forEach((x, i) => w[i] += s * x); });
      if (k === 1) { const d = w.reduce((a, x, i) => a + x * comps[0][i], 0); w.forEach((x, i) => w[i] = x - d * comps[0][i]); }
      const len = Math.hypot(...w) || 1; v = w.map(x => x / len);
    }
    comps.push(v);
  }
  return C.map(r => comps.map(c => r.reduce((a, x, i) => a + x * c[i], 0)));
}
