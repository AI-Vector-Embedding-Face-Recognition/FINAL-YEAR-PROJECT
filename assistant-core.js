/* FaceVector AI - core logic (no DOM access, no network, no eval).
   Contains: the website knowledge base (written from the real pages and scripts of this project),
   fuzzy website search, and the command parser. The parser only ever returns plain data
   describing an intent; js/assistant.js maps that data onto an explicit allowlist of actions.
   Nothing typed or spoken here is ever executed as code. */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ knowledge base */
  const PAGES = {
    'index.html': { title: 'Home', aliases: ['home', 'home page', 'main page', 'start', 'start page', 'index', 'dashboard', 'হোম', 'প্রথম পাতা'],
      desc: 'Intro, live counters (registered people, present today, total records), the 4-step workflow and links to the other pages.',
      keys: 'overview intro stats statistics counters workflow capture embed match record explore project' },
    'about.html': { title: 'About', aliases: ['about', 'about page', 'about us', 'about this project', 'how it works', 'সম্পর্কে', 'আমাদের সম্পর্কে'],
      desc: 'Explains vector embeddings, Euclidean distance, cosine similarity, the attendance flow, the technology used and privacy notes.',
      keys: 'embedding vector euclidean cosine distance threshold margin flow technology privacy liveness pca explanation face recognition' },
    'register.html': { title: 'Register', aliases: ['register', 'registration', 'register page', 'register face', 'register a face', 'student registration', 'enroll', 'enrol', 'enrollment', 'add student', 'new student', 'sign up', 'নিবন্ধন', 'রেজিস্টার', 'রেজিস্ট্রেশন'],
      desc: 'Add a person: full name, roll/ID, optional class, then capture 5 face samples with the camera and save.',
      keys: 'name roll id class camera samples capture save person face new student recently registered' },
    'attendance.html': { title: 'Attendance', aliases: ['attendance', 'attendance page', 'take attendance', 'mark attendance', 'scan', 'scanning', 'live scan', 'উপস্থিতি', 'হাজিরা'],
      desc: 'Live camera scan that matches a face against saved vectors and marks the person present once per day and session. Shows who was marked today.',
      keys: 'scan camera session class marked today present recognise match verified switch camera' },
    'records.html': { title: 'Records', aliases: ['records', 'record', 'attendance records', 'attendance record', 'attendance log', 'logs', 'history', 'report', 'reports', 'csv', 'percentage', 'রেকর্ড', 'উপস্থিতির রেকর্ড'],
      desc: 'Every attendance mark with filters (date, session, name or roll), attendance percentage per student, and CSV download.',
      keys: 'filter date session search name roll percentage progress csv download export total days present today' },
    'lab.html': { title: '2D Lab', aliases: ['lab', '2d lab', 'two d lab', '2d', 'map', '2d map', 'pca', 'pca map', 'graph', 'visualisation', 'visualization', 'ল্যাব'],
      desc: 'PCA map of saved face vectors in 2D plus a live face test that shows the closest people and distances.',
      keys: 'pca map dots clusters plot my face vector euclidean cosine closest people camera visualise' },
    'admin.html': { title: 'Admin', aliases: ['admin', 'admin page', 'administrator', 'settings', 'setting', 'settings page', 'preferences', 'threshold', 'password', 'backup', 'manage students', 'অ্যাডমিন', 'এডমিন', 'সেটিংস', 'সেটিং'],
      desc: 'Password-protected area: manage students, recognition settings (threshold and margin), change password, backup and restore, delete data.',
      keys: 'login password threshold margin settings students edit remove backup export import restore danger delete records everything lock logout' },
    'contact.html': { title: 'Contact', aliases: ['contact', 'contact page', 'contact us', 'help', 'help page', 'support', 'troubleshooting', 'faq', 'যোগাযোগ', 'সাহায্য'],
      desc: 'Project information and a troubleshooting guide (camera, models, recognition problems, forgotten password, missing data).',
      keys: 'troubleshoot camera does not open models recognise wrong person phone camera forgot password data disappeared project team' }
  };

  const HELP_ITEMS = [ // the real <details> entries on contact.html
    { q: 'The camera does not open', a: 'Allow camera access in the browser address bar. Open the site with https:// or localhost (not by double-clicking the file) and close other apps that use the camera.', keys: 'camera open permission blocked not working webcam' },
    { q: 'Could not load the face models', a: 'The face models download from the internet the first time. Check your connection and reload the page.', keys: 'models load error internet offline download' },
    { q: 'It does not recognise me', a: 'Use good front light, face the camera and stay close. Register again with 5 clear samples. You can raise the threshold slightly in Admin.', keys: 'recognise recognize not recognised not recognized unknown face lighting' },
    { q: 'It marks the wrong person', a: 'Lower the threshold or raise the margin in Admin, and register each person with more varied samples.', keys: 'wrong person false match incorrect mismatch' },
    { q: 'The camera opens the wrong side on my phone', a: 'Press Switch camera to toggle between front and back camera. On a laptop with several cameras use the camera list next to the button.', keys: 'phone front back camera switch flip side' },
    { q: 'I forgot the admin password', a: 'On the Admin page press Forgot password. This clears ALL data on this device (the password cannot be recovered), so export a backup regularly.', keys: 'forgot password reset recover admin' },
    { q: 'My data disappeared', a: 'Data is saved in this browser only. Clearing browser data or using another browser or device removes it. Use Admin > Export backup regularly.', keys: 'data lost disappeared missing gone cleared' }
  ];

  const TOPICS = [
    { id: 'register', title: 'Register a student', page: 'register.html',
      keys: 'register registration enroll enrol add student new person sign up face samples নিবন্ধন রেজিস্টার',
      steps: ['Open the Register page.',
        'Type the Full name and the Roll / ID number (required). Class is optional. Roll numbers may only use letters, numbers and - . / (max 30 characters).',
        'Press Start camera and allow camera access when the browser asks. The face models must finish loading first (needs internet the first time).',
        'Press Capture sample 5 times. Wait for the quality badge to say the face is OK, and turn your head slightly between samples. Only one person may be in view.',
        'Press Save person. A roll number that already exists is rejected, and if the face looks like someone already registered you are asked to confirm.'],
      note: 'I never fill in or submit this form for you. You press Save person yourself.' },
    { id: 'attendance', title: 'Take attendance', page: 'attendance.html',
      keys: 'take attendance mark present scan scanning start scanning how attendance works hajira উপস্থিতি হাজিরা',
      steps: ['Register at least one person first (scanning refuses to start with nobody registered).',
        'Open the Attendance page and optionally type a Class / session (it is remembered).',
        'Press Start scanning, allow the camera, and look at it.',
        'The same person must be matched on 2 scans in a row. They are then saved once per day and session, and appear in Marked today.',
        'Press Stop scanning when finished.'],
      note: 'If two people look equally close the page says "Not sure" instead of guessing.' },
    { id: 'today', title: "Check today's attendance", page: 'attendance.html',
      keys: 'today todays today\'s present now who is present check today attendance today marked today',
      steps: ['Attendance page: the Marked today card on the right lists everyone marked today and shows a count like 3 / 20.',
        'Records page: the Present today card gives the count; set the Date filter to today for the full list.',
        'Home page: the Present today counter.'],
      note: '' },
    { id: 'records', title: 'Search and filter records', page: 'records.html',
      keys: 'records filter search find student name roll date session percentage clear filters',
      steps: ['Open the Records page.',
        'Use Date, Session, and Search name or roll. The table updates as you type.',
        'Press Clear filters to reset.',
        'The lower table shows days present / days attendance was taken per student. A red bar means below 75%.'],
      note: '' },
    { id: 'csv', title: 'Download records as CSV', page: 'records.html',
      keys: 'csv download export records spreadsheet excel save file',
      steps: ['Open the Records page and apply any filters you want (the CSV contains exactly the filtered rows).',
        'Press Download CSV.'],
      note: 'The file contains names, roll numbers and attendance times. Store and share it carefully. There is no PDF export in this project.' },
    { id: 'login', title: 'Log in to Admin', page: 'admin.html',
      keys: 'admin login log in password create password first time lock locked logout',
      steps: ['Open the Admin page.',
        'First time on this device: create a password (at least 8 characters with letters and numbers).',
        'Afterwards: enter the password and press Log in. After 5 wrong tries the login locks for 5 minutes, and you are logged out after 15 minutes of inactivity.'],
      note: 'I cannot log in for you and I cannot bypass the Admin password.' },
    { id: 'settings', title: 'Change recognition settings', page: 'admin.html',
      keys: 'settings setting threshold margin strict loose recognition sensitivity change settings',
      steps: ['Log in on the Admin page.',
        'In Recognition settings move the Distance threshold slider (0.30 to 0.80; lower = stricter) and the Margin slider (0 to 0.20).',
        'Press Save settings.'],
      note: 'There is no page called "Settings": these controls live inside Admin.' },
    { id: 'students', title: 'Edit or remove a student', page: 'admin.html',
      keys: 'edit student remove student delete student manage students update name roll',
      steps: ['Log in on the Admin page.', 'Find the person in Manage students and press Edit (name, roll, class) or Remove.', 'Removing a student keeps their past attendance records.'],
      note: 'Removal asks for confirmation in the browser. I will not do it for you.' },
    { id: 'backup', title: 'Backup and restore', page: 'admin.html',
      keys: 'backup restore export import json save data transfer move device',
      steps: ['Log in on the Admin page.', 'Export backup downloads one JSON file with students, face vectors, records and settings.', 'Import backup (.json, up to 20 MB) replaces ALL current data after you confirm.'],
      note: 'The backup file contains biometric face vectors. Keep it private.' },
    { id: 'password', title: 'Change the admin password', page: 'admin.html',
      keys: 'change password new password update password admin password',
      steps: ['Log in on the Admin page.', 'In Change password enter the current and a new password (8+ characters, letters and numbers).', 'Press Change.'],
      note: '' },
    { id: 'forgot', title: 'Forgot the admin password', page: 'admin.html',
      keys: 'forgot password reset password recover lost password',
      steps: ['On the Admin login card press Forgot password.', 'Confirm, then type RESET.'],
      note: 'The password cannot be recovered. This DELETES all students, face data and records on this device, so export backups regularly.' },
    { id: 'deleteall', title: 'Delete all records or all data', page: 'admin.html',
      keys: 'delete all records delete everything danger zone wipe clear data erase',
      steps: ['Log in on the Admin page.', 'In Danger zone choose Delete all records or Delete everything and confirm.'],
      note: 'There is no way to delete a single attendance record in this project. I will never delete data for you.' },
    { id: 'lab', title: 'Use the 2D Lab', page: 'lab.html',
      keys: 'lab 2d map pca plot my face closest people vector how to use lab',
      steps: ['Open the 2D Lab. Each dot is one saved face sample, coloured per person.', 'Hover or tap a dot to see whose sample it is.', 'To test a live face press Start camera, then Plot my face. You see the first 8 of 128 numbers and the closest people.'],
      note: 'The 2D map is a PCA projection for viewing only. Recognition happens in the original 128 dimensions.' },
    { id: 'theme', title: 'Change colours or dark mode', page: null,
      keys: 'theme colour color colors dark mode light mode appearance accent background',
      steps: ['Press Colours in the header.', 'Choose Auto, Light or Dark, pick a colour scheme, or choose custom colours.', 'The choice is remembered and shared across tabs.'],
      note: 'You can also tell me "dark mode" or "light mode".' },
    { id: 'recognition', title: 'How face recognition attendance works', page: 'about.html',
      keys: 'face recognition work works explain embedding vector euclidean distance threshold how does',
      steps: ['The camera finds a face and a quality check rejects faces that are blurry, tiny or dim.',
        'A model turns the face into a vector of 128 numbers (an embedding).',
        'The vector is compared with every saved vector using Euclidean distance. Smaller means more similar.',
        'The best match counts only if its distance is below the threshold (default 0.50) and it beats the second-best person by the margin (default 0.06).',
        'The same person must match on 2 scans in a row. Then name, session, date and time are saved once per day.'],
      note: 'It is probabilistic: lighting, pose and camera quality matter, and a printed photo or phone screen can fool simple face recognition.' },
    { id: 'privacy', title: 'Where is my data stored?', page: 'about.html',
      keys: 'privacy data stored storage where localstorage upload private biometric safe security',
      steps: ['Students, face vectors, records and settings are stored in this browser\'s localStorage and are not uploaded by this site.',
        'The only network requests are to cdn.jsdelivr.net (face-api library and model files) and Google Fonts.',
        'This assistant runs locally. It sends nothing to an AI service. Voice input uses your browser\'s speech recognition, which in some browsers (for example Chrome) sends the audio to the browser vendor\'s servers.'],
      note: 'Anyone with access to this browser profile and its developer tools can read or erase the data.' }
  ];

  const ABSENT = [ // things people ask for that this project does NOT have
    { re: /(manual(ly)?|add|enter|edit|change|modify|correct).{0,25}(attendance|record)|(attendance|record).{0,25}(manual|edit|modify)/i,
      msg: 'This project has no manual attendance entry or editing. Attendance is only recorded by the face scan on the Attendance page. I also cannot change attendance records for you.' },
    { re: /(delete|remove|erase).{0,20}(one|single|a|an|specific|that|this)\s+(attendance|record|log)/i,
      msg: 'There is no way to delete a single attendance record. Admin only offers Delete all records and Delete everything (and Remove for a student, which keeps their past records).' },
    { re: /\b(user accounts?|roles?|multiple admins?|teacher login|student login|permissions?)\b/i,
      msg: 'There are no user accounts or roles. There is one admin password per browser, used only for the Admin page.' },
    { re: /\b(cloud|sync|server|database|mongo|online backup)\b/i,
      msg: 'There is no server or cloud sync. Data lives in this browser only. Use Admin > Export backup to move it.' },
    { re: /\b(pdf|email|e-mail|sms|whatsapp|notification)s?\b/i,
      msg: 'There is no PDF export, email or SMS feature. Records can be downloaded as CSV from the Records page.' },
    { re: /\b(liveness|anti.?spoof|spoofing)\b/i,
      msg: 'There is no liveness or anti-spoofing check. The About page warns that a printed photo or phone screen can fool simple face recognition.' },
    { re: /\b(site.?wide search|global search|search box)\b/i,
      msg: 'The only search box on the site is on the Records page (Search name or roll). This assistant also offers website search: press the magnifier button or type "search: your words".' }
  ];

  /* ------------------------------------------------------------------ text helpers */
  const STOP = new Set(('a an the to of for me my i please can could would you do does how what is are on in this that and with show take go ' +
    'open find search page tab want like need help get where there it be at into about some any tell give let us').split(' '));

  const norm = s => String(s == null ? '' : s).normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s\-\/']/gu, ' ').replace(/\s+/g, ' ').trim();
  const tok = s => norm(s).split(' ').map(t => t.replace(/^[-'\/]+|[-'\/]+$/g, '')).filter(Boolean);
  const keyTok = s => tok(s).filter(t => !STOP.has(t));

  // edit distance with adjacent transpositions counting as 1 ("recrods" ~ "records")
  function lev(a, b, max) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }

  // 3 exact, 2 prefix (partial word), 1.5 close spelling (typo), 0 none
  function tokenScore(q, d) {
    if (q === d) return 3;
    if (q.length >= 3 && (d.startsWith(q) || (q.length >= 4 && d.includes(q)))) return 2;
    if (d.length >= 3 && q.length >= 4 && q.startsWith(d)) return 1.5; // "records" vs "record"
    const max = q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0;
    if (max && lev(q, d, max) <= max) return 1.5;
    return 0;
  }

  const hasPhrase = (tokens, phrase) => {
    const p = tok(phrase); if (!p.length) return false;
    for (let i = 0; i + p.length <= tokens.length; i++) { let ok = true; for (let j = 0; j < p.length; j++) if (tokens[i + j] !== p[j]) { ok = false; break; } if (ok) return true; }
    return false;
  };

  function cleanTerm(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }

  /* ------------------------------------------------------------------ search index */
  function buildIndex(extra) {
    const docs = [];
    for (const [file, p] of Object.entries(PAGES)) docs.push({ kind: 'page', page: file, title: p.title, desc: p.desc, head: p.aliases.join(' ') + ' ' + p.title, body: p.desc + ' ' + p.keys });
    for (const t of TOPICS) docs.push({ kind: 'guide', page: t.page, topic: t.id, title: t.title, desc: t.steps[0], head: t.title + ' ' + t.keys, body: t.steps.join(' ') });
    HELP_ITEMS.forEach((h, i) => docs.push({ kind: 'help', page: 'contact.html', help: i, title: h.q, desc: h.a, head: h.q + ' ' + h.keys, body: h.a }));
    if (Array.isArray(extra)) for (const d of extra) if (d && d.page && PAGES[d.page]) docs.push({ kind: 'content', page: d.page, title: cleanTerm(d.title, 80), desc: cleanTerm(d.desc || '', 160), head: cleanTerm(d.title, 80), body: cleanTerm(d.desc || '', 300) });
    for (const d of docs) { d.headT = keyTok(d.head); d.bodyT = keyTok(d.body); }
    return docs;
  }

  function search(query, docs, limit) {
    const qs = keyTok(query);
    if (!qs.length) return [];
    const out = [];
    for (const d of docs) {
      let score = 0, matched = 0;
      for (const q of qs) {
        let best = 0, w = 1;
        for (const t of d.headT) { const s = tokenScore(q, t) * 2; if (s > best) { best = s; w = 2; } }
        for (const t of d.bodyT) { const s = tokenScore(q, t); if (s > best) best = s; }
        if (best) matched++;
        score += best;
      }
      if (!matched) continue;
      score *= 0.5 + 0.5 * (matched / qs.length);          // reward covering every query word
      if (d.kind === 'page') score *= 1.15;
      out.push({ doc: d, score, matched });
    }
    out.sort((a, b) => b.score - a.score);
    const need = qs.length > 1 ? 2 : 0; // for 2+ words, ignore weak single-word coincidences if better ones exist
    const top = out.length ? out[0].matched : 0;
    return out.filter(r => !need || r.matched >= Math.min(need, top)).slice(0, limit || 6);
  }

  /* ------------------------------------------------------------------ page resolver */
  function resolvePages(text) {
    const tokens = tok(text), ks = keyTok(text), res = [];
    for (const [file, p] of Object.entries(PAGES)) {
      let score = 0;
      for (const a of p.aliases) {
        const at = tok(a);
        if (hasPhrase(tokens, a)) score = Math.max(score, 10 + at.length * 2);
        else if (at.length === 1) for (const q of ks) { const s = tokenScore(q, at[0]); if (s >= 1.5 && q.length >= 4) score = Math.max(score, 4 + s); }
      }
      if (score) res.push({ page: file, score });
    }
    return res.sort((a, b) => b.score - a.score);
  }

  /* ------------------------------------------------------------------ command parser */
  const THEME_PRESETS = ['sea', 'ocean', 'sunset', 'violet', 'rose', 'forest', 'slate', 'teal', 'indigo', 'crimson', 'gold', 'lime', 'pink', 'sky', 'coffee', 'mono'];
  const NAV_VERB = /\b(open|go to|goto|take me|navigate|visit|launch|bring me|switch to|jump to|find the|show me the)\b|খুলো|খুলুন|যাও|নিয়ে যাও|দেখাও/;
  const isoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  function parse(input, ctx) {
    ctx = ctx || {};
    const raw = cleanTerm(input, 300);
    const t = norm(raw), tokens = tok(raw);
    if (!t) return { intent: 'empty' };
    const has = re => re.test(t) || re.test(raw);

    // 0. confirmation of a pending consequential action
    if (ctx.pendingConfirm) {
      if (/^(yes|y|ok|okay|confirm|confirmed|proceed|go ahead|do it|sure|হ্যাঁ|হ্যা|ঠিক আছে)$/.test(t)) return { intent: 'confirm' };
      if (/^(no|n|cancel|stop|abort|nope|never mind|nevermind|না|বাতিল)$/.test(t)) return { intent: 'cancel' };
    }

    // explicit website-search prefix or mode
    const prefix = raw.match(/^\s*(?:search|website search|site search)\s*:\s*(.+)$/i);
    if (prefix) return { intent: 'search', query: cleanTerm(prefix[1], 80) };
    if (ctx.searchMode) return { intent: 'search', query: cleanTerm(raw, 80) };

    // 1. assistant controls
    if (has(/\b(stop|quiet|silence|pause|cancel)\b.{0,12}\b(speaking|talking|reading|voice|audio)\b|^stop$|^shut up$|থামো|থামুন|কথা বন্ধ/)) return { intent: 'action', name: 'stop_speaking' };
    if (has(/\b(close|hide|dismiss|exit|quit)\b.{0,15}\b(ai|assistant|chat|panel|facevector ai|bot)\b|বন্ধ করো|বন্ধ করুন/)) return { intent: 'action', name: 'close_assistant' };
    if (has(/\b(minimi[sz]e|collapse|shrink)\b/)) return { intent: 'action', name: 'minimize_assistant' };
    if (has(/\b(maximi[sz]e|enlarge|expand|full ?screen)\b.{0,15}\b(ai|assistant|chat|panel|window)?\b/) && !has(/\bpage\b/)) return { intent: 'action', name: 'maximize_assistant' };
    if (has(/\b(clear|reset|delete|erase|wipe)\b.{0,12}\b(chat|conversation|history|messages)\b/)) return { intent: 'action', name: 'clear_chat' };
    if (has(/\b(security|audit|privacy)\b.{0,15}\b(status|panel|report|log|events?|monitor|check|dashboard)\b|\bsecurity\b$/)) return { intent: 'action', name: 'show_security' };

    // 2. theme
    const themeWord = has(/\b(theme|colou?rs?|mode|appearance)\b/);
    if (has(/\b(reset)\b.{0,12}\b(colou?rs?|theme)\b/)) return { intent: 'action', name: 'reset_theme' };
    const modeM = t.match(/\b(dark|light|auto|automatic)\b/);
    if (modeM && (themeWord || /\b(switch|turn|change|set|enable|use)\b/.test(t)) && !/\b(records?|attendance|register)\b/.test(t)) return { intent: 'action', name: 'set_theme', params: { mode: modeM[1] === 'automatic' ? 'auto' : modeM[1] } };
    if (themeWord || /\b(switch|change|set|use)\b/.test(t)) for (const p of THEME_PRESETS) if (tokens.includes(p) && /\b(theme|colou?r|scheme)\b/.test(t)) return { intent: 'action', name: 'set_theme', params: { preset: p === 'coffee' ? 'brown' : p } };

    // 3. things this project cannot / must not do
    if (has(/\b(delete|remove|erase|wipe|clear)\b.{0,25}\b(student|students|record|records|attendance|data|everything|face|faces|all)\b/) && !has(/\b(filters?|chat|history|conversation|search)\b/))
      return { intent: 'refuse', reason: 'delete', page: 'admin.html', msg: 'I do not delete students, records or data. That is a consequential change, so you do it yourself on the Admin page (after logging in), where the site asks you to confirm.' };
    if (has(/\b(mark|set|record|put)\b.{0,20}\b(present|absent|attendance)\b/) && !has(/\b(how|where|check|see|view|show|today)\b/))
      return { intent: 'refuse', reason: 'mark', page: 'attendance.html', msg: 'I cannot mark or change attendance. Attendance is only recorded when the face scan on the Attendance page verifies a registered person.' };
    if (has(/\b(submit|save|finish|complete)\b.{0,15}\b(form|registration|person|student)\b|\bregister\b.{1,40}\b(roll|id)\b\s*\w+|\bregister\s+[a-z]{2,}\s+(roll|with)/))
      return { intent: 'refuse', reason: 'submit', page: 'register.html', msg: 'I will not fill in or submit the registration form for you. I can take you to the Register page and explain each field; you press Save person yourself.' };
    if (has(/\b(log ?in|sign ?in|enter)\b.{0,15}\b(admin|as admin)\b.{0,15}\b(for me|password)\b|\b(bypass|skip|hack|crack|disable)\b.{0,20}\b(password|login|auth|security|admin)\b|\b(tell|show|reveal|give)\b.{0,15}\b(password|embeddings?|vectors?)\b/))
      return { intent: 'refuse', reason: 'auth', page: 'admin.html', msg: 'I cannot log in for you, bypass the Admin password, or reveal passwords or face vectors. The password is stored only as a salted hash.' };
    for (const a of ABSENT) if (a.re.test(raw)) return { intent: 'absent', msg: a.msg };

    // 4. records: date / session / student search / export
    const dm = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const recordsish = has(/\b(records?|attendance|log|logs|history|filter)\b/);
    if (dm && recordsish) return { intent: 'action', name: 'set_filter_date', params: { date: dm[0] } };
    if (recordsish && /\b(today|today's|todays)\b/.test(t) && /\b(filter|records?|log|logs|history|apply)\b/.test(t) && !/\b(how|check)\b/.test(t))
      return { intent: 'action', name: 'set_filter_date', params: { date: isoDate(ctx.now || new Date()) } };
    if (recordsish && /\byesterday\b/.test(t)) { const y = new Date(ctx.now || new Date()); y.setDate(y.getDate() - 1); return { intent: 'action', name: 'set_filter_date', params: { date: isoDate(y) } }; }
    const sess = raw.match(/\bsession\s*(?:named|called|is|=|:)?\s+["“']?([^"”'\n]{1,40})["”']?$/i);
    if (sess && /\b(filter|show|records?|apply|only)\b/.test(t)) return { intent: 'action', name: 'set_filter_session', params: { session: cleanTerm(sess[1], 40) } };
    if (has(/\b(clear|reset|remove)\b.{0,10}\bfilters?\b/)) return { intent: 'action', name: 'clear_filters' };
    if (has(/\b(download|export|save)\b.{0,15}\b(csv|spreadsheet|records?|attendance)\b|\bcsv\b.{0,10}\b(download|export)\b/) && !has(/\b(how|where|what)\b/)) return { intent: 'action', name: 'export_csv' };

    const studentWord = /\b(student|students|roll|ছাত্র|শিক্ষার্থী)\b/.test(t) || /ছাত্র|শিক্ষার্থী/.test(raw);
    const searchVerb = /\b(search|find|look ?up|lookup|locate|filter|show)\b|খুঁজ/.test(t) || /খুঁজ/.test(raw);
    if (searchVerb && (studentWord || /\b(records?|attendance)\s+(for|of)\b/.test(t))) {
      let term = '';
      let m = raw.match(/(?:students?|roll(?:\s*(?:number|no\.?|id))?|name)\s*(?:named|called|with(?:\s+name)?|number|no\.?|id|is|:|-)?\s*[:\-]?\s*(.+)$/i);
      if (m) term = m[1];
      if (!term) { m = raw.match(/(?:records?|attendance)\s+(?:for|of)\s+(.+)$/i); if (m) term = m[1]; }
      term = cleanTerm(term.replace(/^(named|called|a|an|the|for|of|with|name|roll|number)\s+/i, '').replace(/\s+(in|on|from)\s+(the\s+)?(records?|attendance|list).*$/i, ''), 60);
      if (/^(named|called|a|an|the|student|students)$/i.test(term)) term = '';
      if (term) return { intent: 'action', name: 'fill_search', params: { value: term } };
      return { intent: 'action', name: 'focus_field', params: { page: 'records.html', id: 'fsearch' } };
    }
    if (has(/\b(focus|go to|jump to|find|where is)\b.{0,25}\b(search (box|field|bar|option)|filter)\b|\bfind\b.{0,20}\bsearch option\b/)) return { intent: 'action', name: 'focus_field', params: { page: 'records.html', id: 'fsearch' } };


    // 6. overview / explain page / capability questions
    if (has(/\b(what can (i|you) do|what (does|can) this (website|site|app|system) do|available options|show (me )?(the )?options|list (the )?(commands|options|features|pages)|what are (the )?(features|commands|options)|what can i say|commands|capabilities|features)\b|কী করতে পারি|কি করতে পারি/))
      return { intent: 'overview' };
    if (has(/\b(explain|describe|summari[sz]e|tell me about|help me (understand|with)|understand|how (do i|to|can i) use)\b.{0,25}\b(this|current|the)\b.{0,15}\b(page|form|screen|tab|section|table)\b|\b(show me how to use|how do i use) this page\b|\bwhat is this page\b|\bhelp me understand this\b|এই পাতা/))
      return { intent: 'explain_page', scope: has(/\bform\b/) ? 'form' : 'page' };

    // 7. guided how-to / explanation topics
    const wantsHow = has(/\b(how|steps?|guide|instructions?|explain|walk me|teach|tutorial|what is|what does|where is|where do|where can|why)\b|কিভাবে|কীভাবে/);
    const ks = keyTok(raw);
    let bestTopic = null, bestScore = 0;
    for (const tp of TOPICS) {
      const toks = keyTok(tp.title + ' ' + tp.keys); let s = 0, m = 0;
      for (const q of ks) { let b = 0; for (const x of toks) b = Math.max(b, tokenScore(q, x)); if (b >= 1.5) { s += b; m++; } }
      if (hasPhrase(tokens, tp.title)) s += 6;
      if (s > bestScore && m >= 1) { bestScore = s; bestTopic = tp; }
    }
    if (bestTopic && (wantsHow ? bestScore >= 3 : bestScore >= 7) && !(NAV_VERB.test(t) && !wantsHow && resolvePages(raw).length)) {
      return { intent: 'topic', topic: bestTopic.id };
    }
    // troubleshooting items
    if (wantsHow || /\b(not|cannot|can't|doesn't|does not|won't|error|problem|wrong|lost|forgot)\b/.test(t)) {
      let hi = -1, hs = 0;
      HELP_ITEMS.forEach((h, i) => { let s = 0; const toks = keyTok(h.q + ' ' + h.keys); for (const q of ks) { let b = 0; for (const x of toks) b = Math.max(b, tokenScore(q, x)); if (b >= 1.5) s += b; } if (s > hs) { hs = s; hi = i; } });
      if (hi >= 0 && hs >= 4.5) return { intent: 'help_item', index: hi };
    }

    // 8. navigation
    const pages = resolvePages(raw);
    const navVerb = NAV_VERB.test(t) || NAV_VERB.test(raw);
    if (pages.length && (navVerb || ks.length <= 2 || /\bpage|tab\b/.test(t))) {
      const top = pages[0], second = pages[1];
      if (!second || top.score - second.score >= 2 || top.score >= second.score * 1.3) return { intent: 'action', name: 'navigate', params: { page: top.page }, via: top.page === 'admin.html' && /\bsettings?\b/.test(t) ? 'settings' : '' };
      return { intent: 'choose', pages: pages.slice(0, 3).map(p => p.page) };
    }

    // 9. fallback: website search
    return { intent: 'search', query: raw, fallback: true };
  }

  /* ------------------------------------------------------------------ exports */
  const api = { PAGES, HELP_ITEMS, TOPICS, ABSENT, THEME_PRESETS, parse, search, buildIndex, resolvePages, norm, tok, lev, cleanTerm, tokenScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FVAssistantCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
