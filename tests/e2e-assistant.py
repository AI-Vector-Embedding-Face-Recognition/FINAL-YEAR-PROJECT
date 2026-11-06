#!/usr/bin/env python3
"""Browser end-to-end checks for the FaceVector AI assistant (real Chromium via Playwright).
Run:  pip install playwright && playwright install chromium && python3 tests/e2e-assistant.py
The CDN (face-api, fonts) is blocked on purpose so the suite works offline; camera/model behaviour is NOT covered."""
import http.server, socketserver, threading, os, sys, json, functools, re
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = 8765
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://localhost:{PORT}/'
PAGES = ['index', 'about', 'register', 'attendance', 'records', 'lab', 'admin', 'contact']
results = []
def check(name, ok, info=''):
    results.append((name, bool(ok), info)); print(('PASS ' if ok else 'FAIL ') + name + (' :: ' + str(info) if info and not ok else ''))

PEOPLE = [{'id': 1, 'name': 'Rahim Uddin', 'roll': 'R1', 'cls': '10', 'embeddings': [[0.01 * i for i in range(128)]], 'created': 'x'},
          {'id': 2, 'name': 'Karim Ali', 'roll': 'R2', 'cls': '10', 'embeddings': [[0.02 * i % 1 for i in range(128)]], 'created': 'x'}]
LOGS = [{'id': 1, 'name': 'Rahim Uddin', 'roll': 'R1', 'cls': '10', 'session': 'Maths', 'date': '2026-10-22', 'time': '9:00:00 AM', 'distance': 0.3, 'similarity': 0.9}]
SEED = "localStorage.setItem('people', %s); localStorage.setItem('logs', %s);" % (json.dumps(json.dumps(PEOPLE)), json.dumps(json.dumps(LOGS)))

def new_ctx(b, **kw):
    ctx = b.new_context(accept_downloads=True, reduced_motion='reduce', **kw)
    ctx.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)/.*'), lambda r: r.abort())
    return ctx

def ask(pg, text):
    pg.fill('.fvai textarea', text); pg.press('.fvai textarea', 'Enter'); pg.wait_for_timeout(450)
def last_bot(pg): return pg.locator('.fvai-msg.bot').last.inner_text()
def open_panel(pg):
    if pg.locator('.fvai-fab').is_visible(): pg.click('.fvai-fab')
    pg.wait_for_selector('.fvai[data-state=open] .fvai-panel, .fvai[data-state=max] .fvai-panel')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = new_ctx(b, viewport={'width': 1280, 'height': 800}); pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'ERR_FAILED' not in m.text else None)
    pg.on('dialog', lambda d: d.accept())
    pg.goto(BASE + 'index.html'); pg.evaluate(SEED)

    # 1/3 every original page opens, has the FAB bottom-right, nav intact
    for n in PAGES:
        pg.goto(BASE + n + '.html'); pg.wait_for_selector('.fvai-fab')
        box = pg.locator('.fvai-fab').bounding_box(); vp = pg.viewport_size
        ok = box and box['x'] + box['width'] > vp['width'] - 40 and box['y'] + box['height'] > vp['height'] - 40 and box['x'] + box['width'] <= vp['width'] and box['y'] + box['height'] <= vp['height']
        check(f'{n}.html: opens, FAB bottom-right, 8 nav links kept', ok and pg.locator('nav[aria-label=Main] a').count() == 8 and pg.locator('h1').count() >= 1, box)
    check('no JS errors / CSP violations on any page', not errors, errors[:3])

    # 4 open / close / minimize / maximize / reopen, keyboard
    pg.goto(BASE + 'index.html'); open_panel(pg)
    check('panel opens with welcome, input, send, mic, clear, search toggle, suggestions',
          pg.locator('.fvai-msg.bot').count() >= 1 and pg.locator('.fvai textarea').is_visible() and pg.locator('.fvai-send').is_visible() and pg.locator('.fvai-mic').is_visible()
          and pg.get_by_role('button', name='Clear chat').is_visible() and pg.get_by_role('button', name='Search site').is_visible() and pg.locator('.fvai-chip').count() >= 5)
    check('input receives focus on open', pg.evaluate("document.activeElement && document.activeElement.tagName") == 'TEXTAREA')
    pg.click('[aria-label="Minimize assistant"]'); check('minimize', pg.get_attribute('.fvai', 'data-state') == 'min' and not pg.locator('.fvai textarea').is_visible())
    pg.click('[aria-label="Restore assistant"]'); check('restore from minimized', pg.get_attribute('.fvai', 'data-state') == 'open')
    pg.click('[aria-label="Maximize assistant"]'); check('maximize', pg.get_attribute('.fvai', 'data-state') == 'max')
    pg.click('[aria-label="Restore assistant size"]')
    pg.click('[aria-label="Close assistant"]'); check('close, FAB visible again, focus returns to FAB', pg.locator('.fvai-fab').is_visible() and pg.evaluate("document.activeElement.className").startswith('fvai-fab'))
    pg.click('.fvai-fab'); pg.wait_for_timeout(150); pg.keyboard.press('Escape'); check('Escape closes', pg.get_attribute('.fvai', 'data-state') == 'closed')
    pg.click('.fvai-fab')
    pg.fill('.fvai textarea', 'line1'); pg.keyboard.press('Shift+Enter'); pg.keyboard.type('line2')
    check('Shift+Enter inserts a new line (no send)', pg.input_value('.fvai textarea') == 'line1\nline2' and pg.locator('.fvai-msg.user').count() == 0)
    pg.fill('.fvai textarea', '')

    # 5-8 typed commands on real routes
    ask(pg, 'Open the attendance page.'); pg.wait_for_url('**/attendance.html'); pg.wait_for_selector('.fvai[data-state=open] .fvai-panel')
    check('"Open the attendance page" navigates and assistant stays open', 'attendance.html' in pg.url and 'attendance page' in last_bot(pg).lower())
    ask(pg, 'Go to About.'); pg.wait_for_url('**/about.html')
    ask(pg, 'Open Register.'); pg.wait_for_url('**/register.html')
    ask(pg, 'Take me to the student registration page'); pg.wait_for_timeout(400)
    check('already-there is reported, not re-navigated', 'already' in last_bot(pg).lower())
    ask(pg, 'Open Home.'); pg.wait_for_url('**/index.html')
    ask(pg, 'Open the settings page'); pg.wait_for_url('**/admin.html')
    ask(pg, 'Open the settings page'); pg.wait_for_timeout(300)
    check('"settings page" says there is no Settings page and points to Admin', 'no page named "Settings"' in pg.inner_text('.fvai-log') and 'Admin' in pg.inner_text('.fvai-log'))
    ask(pg, 'হোম খুলো'); pg.wait_for_url('**/index.html'); check('Bengali "হোম খুলো" opens Home', True)

    # search for student on Records
    pg.goto(BASE + 'index.html'); open_panel(pg)
    ask(pg, 'search for student named Rahim'); pg.wait_for_url('**/records.html'); pg.wait_for_timeout(500)
    check('student search fills Records search box and filters table', pg.input_value('#fsearch') == 'Rahim' and 'Rahim' in pg.inner_text('#logs') and 'Karim' not in pg.inner_text('#logs'))
    ask(pg, 'clear filters'); check('clear filters works', pg.input_value('#fsearch') == '')
    ask(pg, 'show records for 2026-10-22'); check('date filter applied', pg.input_value('#fdate') == '2026-10-22')
    ask(pg, 'Search for a student'); check('"Search for a student" focuses the real search box', pg.evaluate("document.activeElement.id") == 'fsearch')

    # 9 unsafe / unsupported input fails safely
    pg.goto(BASE + 'records.html'); open_panel(pg)
    before = pg.evaluate("[localStorage.getItem('people'), localStorage.getItem('logs')]")
    for q in ['delete all records', 'wipe everything', 'mark Rahim present', 'bypass the admin password', 'submit the registration form']:
        ask(pg, q)
    after = pg.evaluate("[localStorage.getItem('people'), localStorage.getItem('logs')]")
    check('delete/mark/bypass/submit requests are refused and data is untouched', before == after and pg.locator('.fvai-msg.warn').count() >= 5)
    pg.evaluate("window.__x = 0")
    ask(pg, '<img src=x onerror="window.__x=1"><script>window.__x=2</script>')
    check('HTML/script in input is shown as text, never executed', pg.evaluate("window.__x") == 0 and pg.locator('.fvai-msg.user img, .fvai-msg.user script').count() == 0)
    ask(pg, 'run eval("window.__x=3")'); check('eval-style text is just text', pg.evaluate("window.__x") == 0)
    ask(pg, 'what is the weather in Dhaka'); check('unknown topic: honest "could not find", no invention', 'could not find' in last_bot(pg).lower())
    pg.evaluate("sessionStorage.setItem('fv-ai-pending', JSON.stringify({a:'eval',v:'window.__x=9',t:Date.now()}))"); pg.reload(); pg.wait_for_selector('.fvai-fab')
    check('tampered pending command (not on allowlist) is ignored', pg.evaluate("window.__x") is None or pg.evaluate("window.__x") == 0)
    pg.evaluate("sessionStorage.setItem('fv-ai-pending', JSON.stringify({a:'fill_search',v:'x'.repeat(5000),t:Date.now()}))"); pg.reload(); pg.wait_for_timeout(300)
    check('oversized pending value is truncated to 60 chars', len(pg.input_value('#fsearch')) <= 60)

    # 10 confirmation for consequential action
    pg.goto(BASE + 'records.html'); open_panel(pg)
    dl = []; pg.on('download', lambda d: dl.append(d))
    ask(pg, 'download csv'); check('CSV export asks for confirmation first', 'about to' in last_bot(pg).lower() and not dl and pg.get_by_role('button', name='Confirm').count() >= 1)
    pg.get_by_role('button', name='Cancel').last.click(); pg.wait_for_timeout(300); check('cancel => no download', not dl)
    ask(pg, 'download csv'); pg.get_by_role('button', name='Confirm').last.click(); pg.wait_for_timeout(700)
    check('confirm => CSV download starts', len(dl) == 1 and dl[0].suggested_filename == 'attendance.csv')
    ask(pg, 'download csv'); ask(pg, 'yes'); pg.wait_for_timeout(500); check('typing "yes" also confirms', len(dl) == 2)
    ask(pg, 'download csv'); ask(pg, 'open about'); pg.wait_for_timeout(300); ask(pg, 'yes')
    check('a different command cancels a pending confirmation', len(dl) == 2)
    pg.goto(BASE + 'register.html'); open_panel(pg); pg.fill('#name', 'Typed Name')
    ask(pg, 'open home'); pg.wait_for_timeout(500)
    check('leaving Register with typed details asks first, does not navigate', 'register.html' in pg.url and 'unsaved' in pg.locator('.fvai-msg.warn').last.inner_text().lower())

    # explain page / form
    pg.goto(BASE + 'register.html'); open_panel(pg)
    ask(pg, 'Help me understand this form'); t = last_bot(pg) + pg.locator('.fvai-msg.bot').last.locator('li').all_inner_texts().__str__()
    check('explain form lists the real fields (Full name, Roll / ID number, Class)', all(x in t for x in ['Full name', 'Roll / ID number', 'Class']))
    ask(pg, 'How do I register a student?'); check('register how-to has 5 steps from the real flow', pg.locator('.fvai-msg.bot').last.locator('li').count() == 5)
    pg.goto(BASE + 'admin.html'); open_panel(pg); ask(pg, 'Explain the current page')
    check('explain page reads real Admin content', 'Admin' in last_bot(pg))
    ask(pg, 'what can I do on this website?'); check('overview offers all 8 pages', pg.locator('.fvai-msg.bot').last.locator('.fvai-act').count() >= 8)

    # website search mode
    pg.goto(BASE + 'index.html'); open_panel(pg); pg.get_by_role('button', name='Search site').click()
    ask(pg, 'recrods'); check('search mode finds Records despite typo', pg.locator('.fvai-res').count() >= 1 and 'Records' in pg.locator('.fvai-res').first.inner_text())
    pg.locator('.fvai-res').first.click(); pg.wait_for_timeout(300)
    # theme
    pg.goto(BASE + 'index.html'); open_panel(pg); ask(pg, 'dark mode'); check('"dark mode" uses the existing theme system', pg.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark')
    ask(pg, 'light mode'); check('"light mode" works', pg.evaluate("document.documentElement.getAttribute('data-theme')") == 'light')
    ask(pg, 'clear chat'); check('clear chat empties history (welcome only)', pg.locator('.fvai-msg.user').count() == 0 and pg.locator('.fvai-msg.bot').count() == 1)

    # 11 security panel gating + audit (real admin flow)
    pg.goto(BASE + 'admin.html'); open_panel(pg); pg.click('#fvai-tab-sec')
    check('security panel is hidden from non-admin', 'limited to a logged-in admin' in pg.inner_text('.fvai-sec'))
    pg.evaluate("localStorage.removeItem('auth'); localStorage.removeItem('authlock'); sessionStorage.removeItem('adminUntil');"); pg.goto(BASE + 'admin.html')
    pg.fill('#sp1', 'Passw0rdTest'); pg.fill('#sp2', 'Passw0rdTest'); pg.click('#setupForm button[type=submit]'); pg.wait_for_timeout(1200)
    check('existing admin password setup still works', pg.locator('#panel').is_visible())
    pg.click('#logout'); pg.wait_for_timeout(200)
    pg.fill('#pw', 'wrong1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(900)
    check('existing wrong-password message still shown', 'Wrong password' in pg.inner_text('#loginMsg'))
    pg.fill('#pw', 'Passw0rdTest'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(1200)
    open_panel(pg); pg.click('#fvai-tab-sec'); pg.wait_for_timeout(300); sec = pg.inner_text('.fvai-sec')
    check('security panel shows after admin login: status, severities, timestamps, fixes, audit', all(x in sec for x in ['Monitoring status', 'Recommended:', 'Audit events', 'not real-time protection']) and ('login_failed' in sec) and ('Confirmed' in sec) and ('Potential risk' in sec))
    pg.goto(BASE + 'attendance.html'); open_panel(pg); pg.click('#fvai-tab-sec'); pg.wait_for_timeout(300)
    check('security panel flags the third-party face-api script without SRI (Attendance page)', 'Third-party script without Subresource Integrity' in pg.inner_text('.fvai-sec'))
    pg.goto(BASE + 'admin.html'); open_panel(pg); pg.click('#fvai-tab-sec'); pg.wait_for_timeout(300)
    check('audit log holds no password/typed text', 'wrong1234' not in sec and 'Passw0rdTest' not in sec and 'wrong1234' not in pg.evaluate("localStorage.getItem('fv-audit')"))
    pg.evaluate("sessionStorage.removeItem('adminUntil')"); pg.click('#fvai-tab-chat'); pg.click('#fvai-tab-sec'); check('security panel locks again when admin session ends', 'limited to a logged-in admin' in pg.inner_text('.fvai-sec'))

    # 7 voice: unsupported / consent / errors / success (SpeechRecognition mocked)
    for label, script in [
        ('unsupported browser', "delete window.SpeechRecognition; delete window.webkitSpeechRecognition;"),
        ('mic permission denied', "window.SpeechRecognition = class { start(){ setTimeout(()=>{this.onstart&&this.onstart(); this.onerror&&this.onerror({error:'not-allowed'}); this.onend&&this.onend();},50);} abort(){} stop(){} };"),
        ('voice command success', "window.SpeechRecognition = class { start(){ setTimeout(()=>{this.onstart&&this.onstart(); this.onresult&&this.onresult({resultIndex:0,results:[Object.assign([{transcript:'open about'}],{isFinal:true})]}); this.onend&&this.onend();},50);} abort(){} stop(){} };")]:
        c2 = new_ctx(b, viewport={'width': 1280, 'height': 800}); c2.add_init_script(script); p2 = c2.new_page(); p2.goto(BASE + 'index.html'); open_panel(p2)
        p2.click('.fvai-mic'); p2.wait_for_timeout(300)
        if label == 'unsupported browser':
            check('voice: unsupported browser => clear message, no crash', 'not supported' in last_bot(p2).lower())
        else:
            consent = 'does not record or store your voice' in last_bot(p2)
            p2.get_by_role('button', name='Continue with voice').click(); p2.wait_for_timeout(900)
            if label == 'mic permission denied':
                check('voice: consent shown first, then permission-denied help with steps', consent and 'blocked' in p2.inner_text('.fvai-log').lower() and 'Site settings' in p2.inner_text('.fvai-log'))
            else:
                p2.wait_for_url('**/about.html', timeout=4000); check('voice: transcript "open about" executes navigation through the same allowlist', consent and 'about.html' in p2.url)
        c2.close()
    # microphone is only touched after consent + press (counted with instrumented SpeechRecognition / getUserMedia)
    c3 = new_ctx(b); c3.add_init_script("window.__mic = 0; window.SpeechRecognition = class { start(){ window.__mic++; } abort(){} stop(){} }; if (navigator.mediaDevices) { const g = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = function(){ window.__mic++; return g.apply(this, arguments); }; }")
    p3 = c3.new_page(); p3.goto(BASE + 'about.html'); open_panel(p3); n0 = p3.evaluate('window.__mic'); p3.click('.fvai-mic'); p3.wait_for_timeout(300); n1 = p3.evaluate('window.__mic')
    check('voice: no microphone/recognition call on page load, on opening the panel, or on pressing mic before consent', n0 == 0 and n1 == 0 and 'Continue with voice' in p3.inner_text('.fvai-log'), (n0, n1))
    p3.get_by_role('button', name='Continue with voice').click(); p3.wait_for_timeout(300)
    check('voice: recognition starts only after the user consents', p3.evaluate('window.__mic') == 1)
    p3.click('.fvai-mic'); p3.wait_for_timeout(200)
    c3.close()

    # 13 mobile
    cm = new_ctx(b, viewport={'width': 375, 'height': 667}, is_mobile=True, has_touch=True); pm = cm.new_page(); pm.goto(BASE + 'attendance.html'); pm.evaluate(SEED); pm.reload()
    box = pm.locator('.fvai-fab').bounding_box()
    check('mobile: FAB fully on screen bottom-right', box and box['x'] + box['width'] <= 375 and box['y'] + box['height'] <= 667 and box['x'] > 250)
    check('mobile: no horizontal scroll with assistant installed', pm.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
    pm.click('.fvai-fab'); pb = pm.locator('.fvai-panel').bounding_box()
    check('mobile: panel fits inside the viewport', pb and pb['x'] >= 0 and pb['x'] + pb['width'] <= 375 and pb['y'] >= 0 and pb['y'] + pb['height'] <= 667, pb)
    check('mobile: input, mic and send all reachable', all(pm.locator(s).is_visible() for s in ['.fvai textarea', '.fvai-mic', '.fvai-send']))
    pm.click('[aria-label="Close assistant"]'); pm.evaluate("window.scrollTo(0, document.body.scrollHeight)"); pm.wait_for_timeout(200)
    fb = pm.locator('footer').bounding_box(); fa = pm.locator('.fvai-fab').bounding_box()
    check('mobile: FAB does not cover the footer text at the bottom of the page', fa['y'] >= fb['y'] + fb['height'] - 80 + 0 and pm.evaluate("parseFloat(getComputedStyle(document.querySelector('footer')).paddingBottom) >= 90"))
    cm.close()

    # 15 existing functionality untouched
    pg.goto(BASE + 'records.html'); pg.fill('#fsearch', 'Karim')
    check('existing Records filter still works', 'Karim' in pg.inner_text('#logs') or 'No records match' in pg.inner_text('#logs'))
    pg.goto(BASE + 'index.html'); check('existing Home counters still render', pg.inner_text('#s1') == '2')
    pg.click('#themebtn'); check('existing Colours panel still opens', pg.locator('#themepanel').is_visible())
    b.close()
srv.shutdown()
bad = [r for r in results if not r[1]]
print(f'\n{len(results) - len(bad)}/{len(results)} checks passed')
sys.exit(1 if bad else 0)
