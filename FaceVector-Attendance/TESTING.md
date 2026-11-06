# Verification checklist

Run the dependency-free static checks from the project directory:

```bash
npm test
```

The check verifies that all eight HTML pages exist, local `href`/`src` references resolve, every page loads the shared navigation script, the navigation source includes all eight pages, and every JavaScript file passes `node --check`.

## Manual browser checks still required

These require a browser and, for face recognition, internet access and camera permission. They have **not** been verified in this packaging environment.

- [ ] Open each of the eight pages and follow navigation links in both directions.
- [ ] Change theme mode, preset and custom colours; confirm the selection is shared across pages and browser tabs.
- [ ] Register a person using five real camera samples; verify duplicate roll IDs are rejected.
- [ ] Take attendance for a registered face and confirm a single same-day record is stored.
- [ ] Test unknown and ambiguous faces; confirm they are not marked present.
- [ ] Test front/back camera selection, camera permission denial and retry, and stop-camera behavior.
- [ ] Filter records and export CSV; inspect the downloaded file.
- [ ] Use the 2D Lab with registered faces and confirm its map updates.
- [ ] Create an admin password, adjust matching settings, export a backup, and import it again.
- [ ] Test invalid backup import, password recovery, delete confirmations, and storage-full behavior.
- [ ] Test layout at desktop and mobile widths.

## Automated-check limitations

The static check does not emulate a real camera, download face-model weights, or validate biometric match accuracy. Those require the manual checks above. Face recognition is probabilistic and should not be the sole identity or attendance control in high-stakes settings.


## FaceVector AI assistant: results from the last run (Chromium 141 headless, localhost, CDN blocked)

| Check | Result |
|---|---|
| `npm test` (project check, 12 unit tests, security lint) | passed; security lint reports 3 warnings: face-api script without SRI on Register, Attendance, Lab |
| `npm run test:e2e` | 65 / 65 passed (run repeatedly, stable) |

What the browser suite covers: all 8 pages open with nav intact, FAB bottom-right, no JS/CSP errors; open/close/minimize/maximize/Escape/focus; Shift+Enter; real-route navigation incl. Bengali; student search/date filter/clear on the real Records controls; refusal of delete/mark/bypass/submit with data unchanged; HTML/script/eval text shown as text and never executed; tampered pending commands ignored; confirmation for CSV export (cancel, confirm, "yes", superseded) and for leaving Register with typed details; explain form/page from the real DOM; search with typos; theme commands; clear chat; security tab hidden from non-admin, visible after the real admin login, audit holds no password or typed text, SRI finding, relock when the session ends; voice (mocked recognition) for unsupported / denied / success and no microphone call before consent; mobile 375x667 emulation (FAB, panel fit, no horizontal scroll, footer not covered); existing Records filter, Home counters, Colours panel and admin password setup/login still work.

### Not verified (do these by hand)
- [ ] Real camera, face-model download and recognition (CDN blocked here). Confirm Register, Attendance and 2D Lab behave as before.
- [ ] Real microphone and real speech recognition, including Bengali accuracy. Only a mocked recognizer was exercised.
- [ ] Spoken replies (speechSynthesis) and Bengali voices; availability varies by OS/browser.
- [ ] Real phones (iOS Safari, Android Chrome), Firefox, and Safari desktop. Only Chromium with an emulated phone viewport was tested.
- [ ] Screen-reader pass (NVDA/VoiceOver). Labels and roles exist but were not tested with one.
- [ ] Keyboard-only walk-through on a real device.
- [ ] Backend checks (unauthorised requests rejected, rate limits): not applicable, there is no backend.
