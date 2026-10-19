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
