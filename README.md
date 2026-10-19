# FaceVector Attendance

AI face-recognition attendance in the browser. Each face becomes a 128-number
vector (embedding). A new face is compared with saved vectors by Euclidean
distance; if it is close enough (and clearly better than the 2nd-best person),
the person is marked present.

Everything runs on the device. Students, face vectors, logs and settings are
stored in the browser's `localStorage`. Nothing is uploaded by this site.
The only network requests are to `cdn.jsdelivr.net` (face-api.js library and
model weights) and Google Fonts (Space Grotesk).

## Pages (8 tabs)
| Page | File | Purpose |
|---|---|---|
| Home | `index.html` | Intro, live stats, 4-step workflow, links |
| About | `about.html` | How face recognition / embeddings / distance work |
| Register | `register.html` | Name, roll, class, camera, 5 face samples |
| Attendance | `attendance.html` | Live scan, match, record, no same-day duplicates |
| Records | `records.html` | Filters, percentages, CSV export |
| 2D Lab | `lab.html` | PCA map of saved vectors + live test face |
| Admin | `admin.html` | Password, students, threshold/margin/session, backup/restore |
| Contact | `contact.html` | Project info and troubleshooting |

## Structure
```
index.html about.html register.html attendance.html
records.html lab.html admin.html contact.html
css/style.css
js/  theme.js main.js face.js register.js attendance.js records.js lab.js admin.js
```
`theme.js` = Auto/Light/Dark, presets, custom accent/background, synced across tabs.
`main.js` = nav, storage, input validation, defaults (threshold 0.5, margin 0.06).
`face.js` = camera, model loading, embeddings, distance, PCA.

## Run locally
The camera needs `https://` or `http://localhost`. Opening the files with
`file://` will not work.
```
npm start              # uses npx serve on http://localhost:8080
# or
python3 -m http.server 8080
```
Open http://localhost:8080. You need internet on first load for the CDN files.

## Face models
Loaded from `@vladmandic/face-api@1.7.13` on jsDelivr: `tinyFaceDetector`,
`faceLandmark68Net`, `faceRecognitionNet`. If they fail to load, the pages show
an error and registration or matching is refused (no fake results).

To self-host (offline): download `dist/face-api.js` and the `model/` folder of
that npm package into `./vendor/` and `./models/`, then in `face.js` change
`MODEL_URL` to `'models/'` and in the three HTML pages that load face-api change
the script `src` to `vendor/face-api.js`. The Content-Security-Policy already allows `'self'`.

## Deploy with HTTPS
Any static host works (Netlify, GitHub Pages, Cloudflare Pages, Vercel, nginx
with a TLS cert). Upload the folder as-is. Camera access requires HTTPS.

## Admin and data: honest limits
- The admin password is stored as a salted PBKDF2 hash in `localStorage`, with
  lock-out and 15-min auto logout. This only deters casual access on a shared
  device. Anyone with browser dev tools can read or wipe the data. Real security
  needs a server.
- Forgot password: the password cannot be recovered. The recovery option clears
  local data (export a backup regularly).
- Data is per browser and per device. It does not sync across devices; use
  Admin > Export/Import backup to move it.
- Face matching is probabilistic; lighting, pose, glasses and camera quality
  affect it. Do not rely on it as the only identity check.
- A 2D map is a PCA projection for visualisation only; recognition happens in
  the original 128-D space.

## Testing
Run `npm test` for dependency-free checks of all eight pages, local file references, shared navigation coverage, and JavaScript syntax. See `TESTING.md` for the manual camera, theme, records, admin, and cross-page checklist. Real camera/model behavior is not covered by the static test.
