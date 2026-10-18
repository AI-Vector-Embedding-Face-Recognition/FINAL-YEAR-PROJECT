# FaceVector Attendance (final year project)

Face-recognition attendance in the browser: 128-number face vectors, distance matching,
2D PCA map, records, admin. No server needed.

## Run it (the camera needs https:// or localhost)
Do NOT double-click index.html. Start a tiny local server in this folder:

    python -m http.server 8000      (or: npx serve)

Open http://localhost:8000 on your laptop.
For a phone: put the folder on any HTTPS host (GitHub Pages, Netlify, Vercel: all free) and open the link.
The first visit needs internet (face-api.js and its models load from jsDelivr).

## Files
index / about / register / attendance / records / lab / admin / contact .html
css/style.css
js/theme.js  (dynamic colours)   js/main.js (helpers, validation, nav)   js/face.js (camera + embeddings + maths)
js/register.js  attendance.js  records.js  lab.js  admin.js

## Dynamic colours
"Colours" button in the header: Auto (follows phone/laptop light or dark live), Light, Dark,
7 colour schemes and a custom accent colour. Text contrast is recalculated automatically.
The choice is remembered and the 2D map recolours instantly.

## Camera (laptop, phone front, phone back)
- Start camera / Switch camera toggles front and back on phones.
- Laptops with several cameras get a camera list.
- The front camera is mirrored, the back camera is not.
- The camera is released when you leave the tab, close the page or press stop.

## Security built in
- Strict Content-Security-Policy on every page (no inline scripts or styles, only jsDelivr for face-api).
- All output escaped; typed text, stored data and backup files are re-validated.
- Admin password: you create it on first use, stored only as a salted PBKDF2-SHA256 hash.
  5 wrong tries lock the login for 5 minutes; auto log-out after 15 minutes idle.
- CSV export blocks spreadsheet formula injection.
- Face data never leaves the device.

## Honest limits (write these in your report)
- Browser-only storage can be edited by anyone with access to that browser profile. For real use add a
  backend (Node + Express + MongoDB) and server-side login.
- A printed photo can fool basic face recognition; add liveness detection to harden it.
- For offline use, download face-api.js and the model files from @vladmandic/face-api and
  point MODEL_URL (js/face.js) and the script tags to your own copy.
- When hosting, also send these headers from the server: X-Content-Type-Options: nosniff,
  Referrer-Policy: no-referrer, Permissions-Policy: camera=(self), and frame-ancestors 'none' in the CSP.
