# FaceVector AI assistant

A floating, website-aware assistant added to all 8 pages. **It is a local, rule-based assistant: no external AI service is connected and it makes no network requests.** Everything is computed in the browser from this project's own pages and help text.

## Why local (architecture decision)
The project is a static, browser-only site: HTML/CSS/JS, data in `localStorage`, no Node/Express, no database, no server. Students, face vectors (128-number embeddings), attendance logs and settings live in the browser's `localStorage`; the admin password is a salted PBKDF2 hash in `localStorage`; face images are never stored (only embeddings). With no server there is nothing to keep an API key on, so an external AI call from this site would have to expose the key. I therefore did **not** add one. No data is sent anywhere by the assistant.

## Where it is integrated
- `css/assistant.css` is linked in `<head>` and `js/assistant-core.js` + `js/assistant.js` load at the end of `<body>` on `index, about, register, attendance, records, lab, admin, contact`.
- The widget is one `<div class="fvai">` appended to `<body>`: a button fixed bottom-right (`right/bottom: 16px` plus safe-area insets) that opens a panel above it. The header, nav, Colours panel and all page content are untouched; the footer gets extra bottom padding (`body.fvai-on footer`) so the button never covers footer text. The site's CSP did not need loosening (`script-src 'self'`, `style-src 'self'`, no inline styles/handlers).
- It uses the existing theme CSS variables, so Auto/Light/Dark and every colour scheme apply.

## Files
| File | Status | Purpose |
|---|---|---|
| `js/assistant-core.js` | new | Knowledge base written from the real pages, fuzzy search (partial words, typos, Bengali aliases), command parser. No DOM, no network. |
| `js/assistant.js` | new | UI, voice, action allowlist + executor, confirmation, audit log, security panel. |
| `css/assistant.css` | new | Styling (responsive, theme-aware, reduced-motion aware, hidden when printing). |
| `*.html` (8 pages) | modified | One `<link>` and one `<script>` pair added each. Nothing else changed. |
| `js/admin.js` | modified | 5 optional audit calls (`login_ok/failed/lockout/blocked`, `admin_action_denied`, `data_reset`). They carry no password or personal data and are no-ops if the assistant is absent. Login logic is unchanged. |
| `scripts/check-project.js` | modified | Also checks that every page loads the assistant files. |
| `scripts/security-check.js` | new | Dev-time lint: secrets, eval/new Function/document.write, inline handlers/scripts, CSP, and that the assistant uses no network or HTML-injection APIs. Warns about third-party scripts without SRI. |
| `tests/core.test.js` | new | 12 Node unit tests for parser/search. |
| `tests/e2e-assistant.py` | new | 65 real-browser (Chromium/Playwright) checks. |
| `.env.example` | new | States that no variables are needed; lists what a future server proxy would use (all commented out). |
| `package.json` | modified | `npm test` now runs all static + unit + security checks; `npm run test:e2e` runs the browser suite. |
| `ASSISTANT.md`, `README.md`, `TESTING.md` | new/modified | Docs. |

## What it can do
Ask in English or Bengali (voice or typing):
- Navigate: "Open Home", "Go to About", "Open Register", "Take me to the student registration page", "Find the attendance records", "হোম খুলো".
- Guide: "How do I register a student?", "How can I check today's attendance?", "Explain how face recognition attendance works", "Where is my data stored?", troubleshooting from the Contact page.
- Explain the current page or form from its real DOM (labels, buttons, sections, required/max length). It never reads field values.
- Records helpers: "Search for a student" (focuses the real search box), "search for student named X" (fills it), "show records for 2026-10-22", "clear filters", "download CSV" (asks first).
- Website search: press **Search site** or type `search: words`. Finds pages, buttons, guides, help items; tolerates typos ("atendance").
- Controls: "Stop speaking", "Close the AI assistant", minimize / maximize, "Clear chat", "dark mode", "light mode", "security status".
- Honest answers: "Open the settings page" explains there is no Settings page (settings live in Admin). Features that do not exist (manual attendance editing, user roles, cloud sync, PDF/email export, liveness check) are stated as absent.

## The action allowlist (the only things it can execute)
`navigate`, `fill_search`, `focus_field` (only `fsearch/fdate/fsession` on Records, `session` on Attendance, `name/roll/cls` on Register), `set_filter_date`, `set_filter_session`, `clear_filters`, `export_csv`*, `open_help`, `set_theme`, `reset_theme`*, `show_security`, `stop_speaking`, `close/minimize/maximize_assistant`, `clear_chat`.
\* always asks for confirmation. Navigation also asks when leaving Register with unsaved details or samples.

Each action has a validator (page names must be real files, dates must be real dates, text is stripped of control characters and `<>` and capped at 60 characters). Typed or spoken text is parsed into data only; it is never evaluated. Pending cross-page commands pass through the same validators and expire after 30 s. A client-side throttle (25 actions / 30 s) stops runaway loops.

**Deliberately not possible:** registering or saving people, marking or editing attendance, deleting students/records/data, importing backups, changing recognition settings or passwords, logging in, reading passwords or face vectors. Requests for these are refused and the assistant points you to the right page so *you* perform them with the site's own confirmations.

## Voice
- Uses the browser's `SpeechRecognition` (English `en-US`, Bengali `bn-BD`, chosen in the panel) and `speechSynthesis` for spoken replies (toggle "Read aloud", and replies to voice commands are spoken).
- Nothing touches the microphone until you press the mic and accept an in-chat privacy notice (verified by test). A visible "Listening…" bar and a Stop button show while active. Unsupported browser, denied permission (with step-by-step instructions), no speech, no microphone, network and language errors each have a message. Typing is a complete alternative.
- **Privacy caveat:** this site never records or stores audio, but Chrome-class browsers send speech to the vendor's cloud for recognition. The notice says so.
- Replies and Bengali: spoken/typed *commands* may be Bengali; reply text is English (the knowledge base is English).

## Privacy and storage of the assistant
- Chat history is kept in memory only (lost on page change, reload or "Clear chat"). Voice transcripts are not saved.
- Stored in the browser: preferences (`fv-ai-prefs`: voice language, read-aloud toggle), and an audit log (`fv-audit`: time, action name, page, outcome; no typed text, names, passwords or face data; max 200 events / 30 days).
- `sessionStorage`: voice consent flag for the tab, and a pending cross-page command for ≤30 s (this can briefly contain a search term you asked it to fill).

## Security status panel (Security tab)
Visible only while a valid Admin session exists (the same `sessionStorage` session `admin.js` already uses; **this gate is client-side only**). It shows monitoring status, findings with severity (critical/high/medium/low/info), a "Confirmed" vs "Potential risk" label, timestamps, a recommended fix for each, and the audit events; plus Re-run, Copy report and Clear audit log.
Checks: admin password not set; lock-out / failed-login counters and audit history; admin actions without a session; local data reset; HTTP/file origin; missing or weak CSP; third-party scripts without SRI; external stylesheet (Google Fonts); stored records that fail validation (possible tampering); unencrypted face vectors at rest; voice-to-cloud note.
It explicitly lists what it cannot see (server logs, API traffic, file changes, secrets in a server, other apps). It is not real-time protection and does not mean the site is secure.

## Connecting an AI provider (not done; optional future work)
This would require adding a backend, which changes the project's architecture. If you decide to, the minimum safe design is: a small server (e.g. Node/Express) that authenticates the user server-side, applies rate limits, reads the key from environment variables (see `.env.example`), accepts only a short question plus the non-sensitive help text from `assistant-core.js`, never receives student data, face images, embeddings, passwords, tokens or attendance records, returns errors without internals, and is the only thing allowed in the CSP `connect-src`. Document the provider's retention/processing terms first. The assistant would call it only for free-form explanations and must still go through the same allowlist for any action. I have not built or tested this.

## Security report: implemented vs. not applicable vs. remaining risk
**Implemented**
- No `eval`/`new Function`/inline scripts; no `innerHTML` with any dynamic text (DOM `textContent` only); CSP unchanged and strict; enforced by `scripts/security-check.js`.
- Explicit allowlist with validators; confirmation for export/reset/leaving unsaved work; refusals for delete/mark/submit/bypass; throttle.
- No network access from the assistant; no secrets anywhere; `.env.example` has no real values.
- Audit log without sensitive content, with retention limit and admin-gated viewing.
- Mic only after consent + press; no recording; clear chat; no transcript storage.
- Accessible: dialog + labelled controls, `role=log` live region, keyboard (Enter / Shift+Enter / Esc / arrow keys between tabs), focus management, reduced-motion support, 16px inputs on mobile.

**Not applicable here (no backend exists), so not implemented and not claimed**
Server-side authentication/authorization and revalidation of actions, server rate limiting, CSRF, secure cookies, restrictive CORS, API-key custody, protection against insecure direct object references, server file-integrity and API-pattern monitoring, HTTPS enforcement (a host setting), HSTS/`frame-ancestors` headers (meta CSP cannot set them).

**Remaining risks (existing and new)**
- All data and the admin check are in the browser. Anyone with access to the browser profile or devtools can read/erase face vectors, forge the admin session flag, edit or delete the audit log, or bypass the assistant's confirmations. Face vectors are stored unencrypted.
- The face-api script is loaded from jsDelivr (version pinned) without Subresource Integrity; I could not compute the hash offline. Self-host it (README) or add `integrity`.
- Google Fonts leaks visitor IPs to Google.
- Voice recognition may use the browser vendor's cloud.
- Face matching is probabilistic and has no liveness check (pre-existing).
