/* FaceVector AI - floating, website-aware assistant (UI + safe action executor).
   Runs entirely in the browser. It sends NOTHING to any server or AI service.
   Typed or spoken text is only ever parsed into data by js/assistant-core.js and then matched against
   the explicit ACTIONS allowlist below. There is no eval(), no new Function(), no innerHTML with
   user text, and no generated code is ever run. */
(function () {
  'use strict';
  const Core = window.FVAssistantCore;
  if (!Core || !document.body) return;

  const NAME = 'FaceVector AI';
  const here = location.pathname.split('/').pop() || 'index.html';
  const PAGE_FILES = Object.keys(Core.PAGES);
  const gid = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clean = (v, n) => Core.cleanTerm(v, n);

  /* ================================================================== audit log (local, no content) */
  const AUDIT_KEY = 'fv-audit', AUDIT_MAX = 200, AUDIT_DAYS = 30; // retention: 200 events or 30 days
  const safeTxt = s => String(s == null ? '' : s).replace(/[^A-Za-z0-9 _.:\-\/>]/g, '').slice(0, 80);
  const Audit = {
    list() {
      try { const a = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); return Array.isArray(a) ? a.filter(e => e && typeof e.t === 'number' && typeof e.type === 'string' && Date.now() - e.t < AUDIT_DAYS * 864e5) : []; }
      catch (e) { return []; }
    },
    // never pass typed text, names, passwords or tokens here: only action names and outcomes
    log(type, detail, outcome) {
      try {
        const a = Audit.list(); a.push({ t: Date.now(), type: safeTxt(type), detail: safeTxt(detail), outcome: safeTxt(outcome || 'ok'), page: safeTxt(here) });
        localStorage.setItem(AUDIT_KEY, JSON.stringify(a.slice(-AUDIT_MAX)));
      } catch (e) { /* storage full/blocked: auditing is best effort */ }
    },
    clear() { try { localStorage.removeItem(AUDIT_KEY); } catch (e) { /* ignore */ } }
  };
  window.FVAudit = Audit;

  const isAdminSession = () => { try { return Number(sessionStorage.getItem('adminUntil') || 0) > Date.now(); } catch (e) { return false; } };

  /* ================================================================== preferences (non-personal) */
  const PREF_KEY = 'fv-ai-prefs', VOICE_OK = 'fv-ai-voice-ok', PEND = 'fv-ai-pending';
  const prefs = (() => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; return { lang: ['en-US', 'bn-BD'].includes(p.lang) ? p.lang : 'en-US', speak: p.speak === true }; } catch (e) { return { lang: 'en-US', speak: false }; } })();
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  /* ================================================================== tiny DOM helpers (no innerHTML for text) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const ICONS = {
    bot: '<path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M9 10h.01M15 10h.01M9.5 13.5c1.5 1 3.5 1 5 0"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    send: '<path d="M3 11l18-8-8 18-2-8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    min: '<path d="M5 12h14"/>', max: '<rect x="5" y="5" width="14" height="14" rx="1"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
  };
  function icon(name) {
    const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>', 'image/svg+xml').documentElement;
    return document.importNode(svg, true);
  }
  const iconBtn = (cls, name, label, extra) => { const b = h('button', Object.assign({ type: 'button', class: cls, 'aria-label': label, title: label }, extra || {})); b.append(icon(name)); return b; };

  /* ================================================================== listener bookkeeping (cleanup) */
  const cleanups = [];
  function on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); cleanups.push(() => target.removeEventListener(ev, fn, opts)); }

  /* ================================================================== build the widget */
  const root = h('div', { class: 'fvai', 'data-state': 'closed' });
  const fab = h('button', { type: 'button', class: 'fvai-fab', 'aria-label': 'Open ' + NAME + ' assistant', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: NAME }, h('span', { class: 'fvai-dot', 'aria-hidden': 'true' }));
  fab.prepend(icon('bot')); fab.append(h('span', { class: 'fvai-fablabel', text: NAME }));

  const btnMin = iconBtn('fvai-ib', 'min', 'Minimize assistant'), btnMax = iconBtn('fvai-ib', 'max', 'Maximize assistant', { 'aria-pressed': 'false' }), btnClose = iconBtn('fvai-ib', 'close', 'Close assistant');
  const head = h('div', { class: 'fvai-head' },
    h('h2', { id: 'fvai-title' }, h('span', {}, NAME, h('small', { text: 'Local assistant · no external AI' }))), btnMin, btnMax, btnClose);
  head.querySelector('h2').prepend(icon('bot'));

  const tabChat = h('button', { type: 'button', class: 'fvai-tab', role: 'tab', 'aria-selected': 'true', id: 'fvai-tab-chat', 'aria-controls': 'fvai-chatview', text: 'Chat' });
  const tabSec = h('button', { type: 'button', class: 'fvai-tab', role: 'tab', 'aria-selected': 'false', id: 'fvai-tab-sec', 'aria-controls': 'fvai-secview', text: 'Security' });
  const modeBadge = h('span', { class: 'fvai-badge', id: 'fvai-mode', text: 'Ask / command' });
  const tabs = h('div', { class: 'fvai-sub', role: 'tablist', 'aria-label': NAME + ' views' }, tabChat, tabSec, modeBadge);

  const btnSearch = h('button', { type: 'button', class: 'fvai-act', 'aria-pressed': 'false', title: 'Search the website content instead of asking the assistant' }, 'Search site');
  const btnSpeak = h('button', { type: 'button', class: 'fvai-act', 'aria-pressed': String(prefs.speak), title: 'Read replies aloud' }, 'Read aloud');
  const btnStopVoice = h('button', { type: 'button', class: 'fvai-act danger', hidden: true }, 'Stop speaking');
  const langSel = h('select', { 'aria-label': 'Voice input language' }, h('option', { value: 'en-US', text: 'English' }), h('option', { value: 'bn-BD', text: 'বাংলা' }));
  langSel.value = prefs.lang;
  const btnClear = h('button', { type: 'button', class: 'fvai-act', title: 'Clear the chat messages', 'aria-label': 'Clear chat' }, 'Clear');
  const tools = h('div', { class: 'fvai-sub fvai-tools' }, btnSearch, btnSpeak, btnStopVoice, langSel, btnClear);

  const log = h('div', { class: 'fvai-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', tabindex: '0', 'aria-label': 'Conversation' });
  const listenBar = h('div', { class: 'fvai-listen', role: 'status', hidden: true }, h('i'), h('span', { text: 'Listening… speak now' }));
  const btnStopListen = h('button', { type: 'button', class: 'fvai-act danger', text: 'Stop' }); listenBar.append(btnStopListen);
  const chips = h('div', { class: 'fvai-chips', role: 'group', 'aria-label': 'Suggested questions and commands' });
  const SUGGEST = ['What can I do here?', 'Open attendance', 'How do I register a student?', 'Explain face recognition', 'Search for a student', "Check today's attendance", 'Security status'];
  SUGGEST.forEach(s => chips.append(h('button', { type: 'button', class: 'fvai-chip', text: s })));
  const input = h('textarea', { rows: '1', maxlength: '300', placeholder: 'Ask or give a command…', 'aria-label': 'Message to ' + NAME, autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'true' });
  const btnMic = iconBtn('fvai-mic', 'mic', 'Start voice input', { 'aria-pressed': 'false' });
  const btnSend = iconBtn('fvai-send', 'send', 'Send message');
  const foot = h('div', { class: 'fvai-foot' }, input, btnMic, btnSend);
  const hint = h('div', { class: 'fvai-hint', text: 'Enter = send · Shift+Enter = new line · Mic asks permission only when you press it' });
  const chatView = h('div', { class: 'fvai-body', id: 'fvai-chatview', role: 'tabpanel', 'aria-labelledby': 'fvai-tab-chat' }, tools, log, listenBar, chips, hint, foot);
  const secBox = h('div', { class: 'fvai-sec', tabindex: '0', 'aria-label': 'Security status' });
  const secView = h('div', { class: 'fvai-body', id: 'fvai-secview', role: 'tabpanel', 'aria-labelledby': 'fvai-tab-sec', hidden: true }, secBox);
  const panel = h('section', { class: 'fvai-panel', role: 'dialog', 'aria-labelledby': 'fvai-title', 'aria-modal': 'false' }, head, tabs, chatView, secView);
  root.append(fab, panel);

  /* ================================================================== panel state */
  let state = 'closed', lastFocus = null;
  function setState(s) {
    if (!['closed', 'open', 'min', 'max'].includes(s)) return;
    const was = state; state = s; root.dataset.state = s;
    fab.setAttribute('aria-expanded', String(s !== 'closed'));
    btnMax.setAttribute('aria-pressed', String(s === 'max'));
    btnMax.setAttribute('aria-label', s === 'max' ? 'Restore assistant size' : 'Maximize assistant');
    btnMin.setAttribute('aria-label', s === 'min' ? 'Restore assistant' : 'Minimize assistant');
    if (s === 'closed') { stopListening(); stopSpeaking(); if (was !== 'closed') (lastFocus && document.contains(lastFocus) ? lastFocus : fab).focus(); }
    else if (was === 'closed') { lastFocus = document.activeElement; setTimeout(() => { if (view === 'chat') input.focus(); }, 30); }
  }
  on(fab, 'click', () => setState('open'));
  on(btnClose, 'click', () => setState('closed'));
  on(btnMin, 'click', () => setState(state === 'min' ? 'open' : 'min'));
  on(btnMax, 'click', () => setState(state === 'max' ? 'open' : 'max'));
  on(panel, 'keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); setState('closed'); } });

  /* ================================================================== views (chat / security) */
  let view = 'chat';
  function setView(v) {
    view = v;
    tabChat.setAttribute('aria-selected', String(v === 'chat')); tabSec.setAttribute('aria-selected', String(v === 'sec'));
    chatView.hidden = v !== 'chat'; secView.hidden = v !== 'sec';
    if (v === 'sec') renderSecurity(); else input.focus();
  }
  on(tabChat, 'click', () => setView('chat'));
  on(tabSec, 'click', () => { setView('sec'); });
  on(tabs, 'keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { setView(view === 'chat' ? 'sec' : 'chat'); (view === 'chat' ? tabChat : tabSec).focus(); } });

  /* ================================================================== messages */
  const history = [];
  function scrollEnd() { log.scrollTop = log.scrollHeight; }
  function addMsg(who, build, tone) {
    const el = h('div', { class: 'fvai-msg ' + who + (tone ? ' ' + tone : '') });
    build(el); log.append(el); history.push(el); scrollEnd(); return el;
  }
  const userMsg = text => { root.classList.add('fvai-talking'); return addMsg('user', el => { el.textContent = text; }); };
  function btn(label, fn, cls) { const b = h('button', { type: 'button', class: 'fvai-act' + (cls ? ' ' + cls : ''), text: label }); b.addEventListener('click', () => fn(b)); return b; }
  let lastBotText = '';
  /* opts: tone, steps[], note, acts[{label, fn, cls}], results[] */
  function bot(text, opts) {
    opts = opts || {};
    const el = addMsg('bot', m => {
      if (text) m.append(document.createTextNode(text));
      if (opts.steps) m.append(h('ol', {}, opts.steps.map(s => h('li', { text: s }))));
      if (opts.note) m.append(h('span', { class: 'fvai-note', text: opts.note }));
      if (opts.results) opts.results.forEach(r => m.append(r));
      if (opts.acts && opts.acts.length) m.append(h('div', { class: 'fvai-acts' }, opts.acts.map(a => btn(a.label, a.fn, a.cls))));
    }, opts.tone);
    lastBotText = [text, (opts.steps || []).join(' '), opts.note || ''].join(' ');
    if (opts.speak !== false) maybeSpeak(lastBotText);
    return el;
  }
  const openBtn = page => ({ label: 'Open ' + Core.PAGES[page].title, fn: () => run('navigate', { page }) });
  async function thinking() {
    if (reduceMotion()) return;
    const t = h('div', { class: 'fvai-typing', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')); log.append(t); scrollEnd();
    await sleep(160); t.remove();
  }

  /* ================================================================== speech output */
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let speakingVoiceInput = false;
  function maybeSpeak(text) { if (synth && (prefs.speak || speakingVoiceInput)) speak(text); }
  function speak(text) {
    if (!synth || !text) return;
    synth.cancel();
    const t = String(text).replace(/\s+/g, ' ').trim().slice(0, 600); if (!t) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = /[\u0980-\u09FF]/.test(t) ? 'bn-BD' : 'en-US';
    const v = (synth.getVoices() || []).find(x => x.lang && x.lang.toLowerCase().startsWith(u.lang.slice(0, 2)));
    if (v) u.voice = v;
    u.onstart = () => { btnStopVoice.hidden = false; };
    u.onend = u.onerror = () => { btnStopVoice.hidden = true; };
    synth.speak(u);
  }
  function stopSpeaking() { if (synth) synth.cancel(); btnStopVoice.hidden = true; }
  on(btnStopVoice, 'click', stopSpeaking);
  on(btnSpeak, 'click', () => {
    if (!synth) return bot('Spoken replies are not supported by this browser. Replies still appear as text.', { tone: 'warn', speak: false });
    prefs.speak = !prefs.speak; savePrefs(); btnSpeak.setAttribute('aria-pressed', String(prefs.speak));
    if (!prefs.speak) stopSpeaking();
    bot(prefs.speak ? 'Replies will be read aloud. Say or type "stop speaking" any time.' : 'Replies will no longer be read aloud.', { speak: false });
  });

  /* ================================================================== voice input */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  function setListening(v) {
    listening = v; listenBar.hidden = !v;
    btnMic.setAttribute('aria-pressed', String(v)); btnMic.setAttribute('aria-label', v ? 'Stop voice input' : 'Start voice input'); btnMic.title = btnMic.getAttribute('aria-label');
  }
  function stopListening() { if (rec) { try { rec.abort(); } catch (e) { /* ignore */ } rec = null; } if (listening) setListening(false); }
  function micHelp(kind) {
    const steps = ['Click the lock (or tune) icon left of the address bar, open Site settings, and set Microphone to Allow. Then reload the page.',
      'On a phone: open the browser\'s Settings > Site settings > Microphone, and allow this site. Also check the phone\'s own app permission for the browser.',
      'The microphone only turns on after you press the mic button, and turns off when you press it again, say nothing, or close the assistant.'];
    bot(kind === 'denied' ? 'Microphone access is blocked.' : 'How to allow the microphone:', { tone: kind === 'denied' ? 'err' : undefined, steps, note: 'You can always type the same commands instead.' });
  }
  function startVoice() {
    if (listening) { stopListening(); return; }
    if (!SR) { bot('Voice input is not supported by this browser. Chrome, Edge and Safari usually support it. Typing works for every command.', { tone: 'warn' }); return; }
    if (!window.isSecureContext) { bot('The microphone needs a secure page: open the site with https:// or http://localhost.', { tone: 'err' }); return; }
    let ok = false; try { ok = sessionStorage.getItem(VOICE_OK) === '1'; } catch (e) { /* ignore */ }
    if (!ok) {
      bot('Before using voice: this site does not record or store your voice. But your browser\'s speech recognition may send the audio to the browser vendor (for example Google in Chrome) to turn it into text. Continue only if that is acceptable.', {
        tone: 'warn', speak: false, acts: [{ label: 'Continue with voice', fn: () => { try { sessionStorage.setItem(VOICE_OK, '1'); } catch (e) { /* ignore */ } Audit.log('voice_consent', 'session', 'granted'); beginVoice(); } }, { label: 'Not now', fn: () => bot('OK. Voice stays off. You can type instead.', { speak: false }) }]
      });
      return;
    }
    beginVoice();
  }
  function beginVoice() {
    stopSpeaking();
    try {
      rec = new SR(); rec.lang = prefs.lang; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    } catch (e) { bot('Could not start voice input in this browser.', { tone: 'err' }); return; }
    let finalText = '', gotAny = false;
    rec.onstart = () => { setListening(true); Audit.log('voice_start', prefs.lang, 'ok'); };
    rec.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; gotAny = true; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
      input.value = clean(finalText + interim, 300); autosize();
    };
    rec.onerror = ev => {
      const e = ev && ev.error; setListening(false);
      if (e === 'not-allowed' || e === 'service-not-allowed') { Audit.log('voice_error', 'permission', 'denied'); micHelp('denied'); }
      else if (e === 'no-speech') bot('I did not hear anything. Press the mic and try again, or type your request.', { tone: 'warn', speak: false });
      else if (e === 'audio-capture') bot('No microphone was found. Check that one is connected and not used by another app.', { tone: 'err', speak: false });
      else if (e === 'network') bot('Speech recognition needs a network connection in this browser and could not reach its service. Try typing instead.', { tone: 'err', speak: false });
      else if (e === 'language-not-supported') bot('This browser does not support that voice language. Try the other language option or type.', { tone: 'err', speak: false });
      else if (e !== 'aborted') bot('Voice recognition stopped (' + safeTxt(e || 'unknown error') + '). You can type instead.', { tone: 'err', speak: false });
    };
    rec.onend = () => {
      const was = listening; setListening(false); rec = null;
      const text = clean(finalText || input.value, 300);
      if (was && gotAny && text) { speakingVoiceInput = true; submit(text).finally(() => { speakingVoiceInput = false; }); }
    };
    try { rec.start(); } catch (e) { setListening(false); bot('Could not start the microphone. Try again.', { tone: 'err' }); }
  }
  on(btnMic, 'click', startVoice);
  on(btnStopListen, 'click', stopListening);
  on(langSel, 'change', () => { prefs.lang = langSel.value; savePrefs(); if (listening) stopListening(); });

  /* ================================================================== pending (cross-page) commands */
  const PENDING_OK = ['arrived', 'fill_search', 'focus_field', 'set_filter_date', 'set_filter_session', 'clear_filters', 'export_csv', 'open_help'];
  function setPending(o) { try { sessionStorage.setItem(PEND, JSON.stringify(Object.assign({ t: Date.now() }, o))); } catch (e) { /* ignore */ } }
  function takePending() {
    try { const v = sessionStorage.getItem(PEND); sessionStorage.removeItem(PEND); if (!v) return null; const o = JSON.parse(v); if (o && PENDING_OK.includes(o.a) && Date.now() - Number(o.t || 0) < 30000) return o; } catch (e) { /* ignore */ }
    return null;
  }
  function go(page, pend) {
    if (!PAGE_FILES.includes(page)) return;
    setPending(pend || { a: 'arrived', p: page });
    setTimeout(() => { location.assign(page); }, reduceMotion() ? 0 : 350); // let the confirmation message render first
  }

  /* ================================================================== ACTION ALLOWLIST (the only things the assistant can do) */
  const FOCUSABLE = { 'records.html': ['fsearch', 'fdate', 'fsession'], 'attendance.html': ['session'], 'register.html': ['name', 'roll', 'cls'] };
  const validDate = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false; const d = new Date(s + 'T00:00:00'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
  function leavingRisk() {
    if (here !== 'register.html') return '';
    const n = gid('count') ? Number(gid('count').textContent) : 0;
    const typed = ['name', 'roll', 'cls'].some(i => gid(i) && gid(i).value.trim());
    return n > 0 || typed ? 'You have unsaved registration details or face samples on this page. Leaving the page discards them.' : '';
  }
  let focusInPage = false; // set when an action moves focus to a page field, so the chat box does not steal it back
  const onPage = (p, what) => here === p ? null : { ok: false, msg: what + ' is only available on the ' + Core.PAGES[p].title + ' page.' };

  const ACTIONS = {
    navigate: {
      label: p => 'Open the ' + Core.PAGES[p.page].title + ' page',
      validate: p => p && PAGE_FILES.includes(p.page) ? { page: p.page } : null,
      risk: p => p.page !== here ? leavingRisk() : '',
      run(p) {
        if (p.page === here) return { ok: true, msg: 'You are already on the ' + Core.PAGES[p.page].title + ' page.' };
        go(p.page); return { ok: true, msg: 'Opening the ' + Core.PAGES[p.page].title + ' page…' };
      }
    },
    fill_search: {
      label: p => 'Type a search term into the Records search box',
      validate: p => { const v = clean(p && p.value, 60); return v ? { value: v } : null; },
      run(p) {
        if (here !== 'records.html') { go('records.html', { a: 'fill_search', v: p.value }); return { ok: true, msg: 'Taking you to Records to search…' }; }
        const el = gid('fsearch'); if (!el) return { ok: false, msg: 'The search box was not found on this page.' };
        el.value = p.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); focusInPage = true;
        return { ok: true, msg: 'Searched the records for "' + p.value + '". Use Clear filters to reset.' };
      }
    },
    focus_field: {
      label: p => 'Move the cursor to a field',
      validate: p => p && FOCUSABLE[p.page] && FOCUSABLE[p.page].includes(p.id) ? { page: p.page, id: p.id } : null,
      run(p) {
        if (here !== p.page) { go(p.page, { a: 'focus_field', page: p.page, id: p.id }); return { ok: true, msg: 'Taking you to the ' + Core.PAGES[p.page].title + ' page…' }; }
        const el = gid(p.id); if (!el) return { ok: false, msg: 'That field was not found on this page.' };
        el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); el.focus(); focusInPage = true;
        const lab = document.querySelector('label[for="' + p.id + '"]');
        return { ok: true, msg: 'The "' + (lab ? lab.textContent.trim() : p.id) + '" field is ready.' + (p.id === 'fsearch' ? ' It filters records by name or roll number as you type.' : '') };
      }
    },
    set_filter_date: {
      label: p => 'Filter records by date ' + p.date,
      validate: p => p && validDate(p.date) ? { date: p.date } : null,
      run(p) {
        if (here !== 'records.html') { go('records.html', { a: 'set_filter_date', date: p.date }); return { ok: true, msg: 'Taking you to Records…' }; }
        const el = gid('fdate'); if (!el) return { ok: false, msg: 'The date filter was not found.' };
        el.value = p.date; el.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, msg: 'Showing records for ' + p.date + '.' };
      }
    },
    set_filter_session: {
      label: p => 'Filter records by session',
      validate: p => { const v = clean(p && p.session, 40); return v ? { session: v } : null; },
      run(p) {
        if (here !== 'records.html') { go('records.html', { a: 'set_filter_session', session: p.session }); return { ok: true, msg: 'Taking you to Records…' }; }
        const sel = gid('fsession'); if (!sel) return { ok: false, msg: 'The session filter was not found.' };
        const opt = [...sel.options].find(o => o.value && o.value.toLowerCase() === p.session.toLowerCase());
        if (!opt) return { ok: false, msg: 'No session called "' + p.session + '" exists in the records yet. Available: ' + ([...sel.options].map(o => o.value).filter(Boolean).join(', ') || 'none') + '.' };
        sel.value = opt.value; sel.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, msg: 'Showing records for session "' + opt.value + '".' };
      }
    },
    clear_filters: {
      label: () => 'Clear the Records filters',
      validate: () => ({}),
      run() {
        if (here !== 'records.html') { go('records.html', { a: 'clear_filters' }); return { ok: true, msg: 'Taking you to Records…' }; }
        const b = gid('fclear'); if (!b) return { ok: false, msg: 'The Clear filters button was not found.' };
        b.click(); return { ok: true, msg: 'Filters cleared.' };
      }
    },
    export_csv: {
      label: () => 'Download the currently filtered attendance records as a CSV file',
      validate: () => ({}),
      risk: () => 'The file contains names, roll numbers, classes and attendance times (personal data). Store and share it carefully.',
      run() {
        if (here !== 'records.html') { go('records.html', { a: 'export_csv' }); return { ok: true, msg: 'Taking you to Records first…' }; }
        const b = gid('csv'); if (!b) return { ok: false, msg: 'The Download CSV button was not found.' };
        b.click(); return { ok: true, msg: 'CSV download started (the browser may ask where to save it).' };
      }
    },
    open_help: {
      label: () => 'Open a troubleshooting answer on the Contact page',
      validate: p => p && Number.isInteger(p.index) && p.index >= 0 && p.index < Core.HELP_ITEMS.length ? { index: p.index } : null,
      run(p) {
        if (here !== 'contact.html') { go('contact.html', { a: 'open_help', index: p.index }); return { ok: true, msg: 'Opening the Contact page…' }; }
        const d = document.querySelectorAll('details')[p.index]; if (!d) return { ok: false, msg: 'That help section was not found.' };
        d.open = true; d.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); const s = d.querySelector('summary'); if (s) { s.focus(); focusInPage = true; }
        return { ok: true, msg: 'Opened: ' + Core.HELP_ITEMS[p.index].q };
      }
    },
    set_theme: {
      label: p => 'Change the colour ' + (p.mode ? 'mode to ' + p.mode : 'scheme to ' + p.preset),
      validate: p => { if (!p) return null; if (['auto', 'light', 'dark'].includes(p.mode)) return { mode: p.mode }; if (window.Theme && p.preset && Theme.PRESETS[p.preset]) return { preset: p.preset }; return null; },
      run(p) { if (!window.Theme) return { ok: false, msg: 'The theme system is not available on this page.' }; Theme.set(p.mode ? { mode: p.mode } : { preset: p.preset }); return { ok: true, msg: p.mode ? 'Colour mode set to ' + p.mode + '.' : 'Colour scheme changed to ' + Theme.PRESETS[p.preset].name + '.' }; }
    },
    reset_theme: {
      label: () => 'Reset ALL colour settings (mode, scheme and custom colours) to the defaults',
      validate: () => ({}), risk: () => 'Your custom colours will be lost.',
      run() { if (!window.Theme) return { ok: false, msg: 'The theme system is not available.' }; Theme.reset(); return { ok: true, msg: 'Colours reset to the defaults.' }; }
    },
    show_security: { label: () => 'Show the security status', validate: () => ({}), run() { setState('open'); setView('sec'); return { ok: true, msg: 'Security status is shown in the Security tab.', quiet: true }; } },
    stop_speaking: { label: () => 'Stop speaking', validate: () => ({}), run() { stopSpeaking(); stopListening(); return { ok: true, msg: 'Stopped.' }; } },
    close_assistant: { label: () => 'Close the assistant', validate: () => ({}), run() { setTimeout(() => setState('closed'), 50); return { ok: true, msg: 'Closing. Press the FaceVector AI button to reopen me.' }; } },
    minimize_assistant: { label: () => 'Minimize', validate: () => ({}), run() { setState('min'); return { ok: true, msg: 'Minimized. Press the restore button in the header to continue.', quiet: true }; } },
    maximize_assistant: { label: () => 'Maximize', validate: () => ({}), run() { setState('max'); return { ok: true, msg: 'Maximized.' }; } },
    clear_chat: { label: () => 'Clear chat', validate: () => ({}), run() { clearChat(); return { ok: true, msg: null }; } }
  };

  /* client-side throttle: stops runaway command loops (a UX safeguard, not server rate limiting) */
  const stamps = [];
  function throttled() { const now = Date.now(); while (stamps.length && now - stamps[0] > 30000) stamps.shift(); if (stamps.length >= 25) return true; stamps.push(now); return false; }

  let pending = null; // consequential action waiting for the person's confirmation
  function run(name, params, opts) {
    opts = opts || {};
    const def = Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : null;
    if (!def) { Audit.log('action_blocked', name, 'not_in_allowlist'); bot('I can only perform a fixed list of safe actions, and that one is not on it.', { tone: 'err' }); return; }
    const p = def.validate(params || {});
    if (!p) { Audit.log('action_rejected', name, 'invalid_params'); bot('That request had invalid details, so I did not do it.', { tone: 'err' }); return; }
    if (throttled()) { Audit.log('action_throttled', name, 'rate_limited'); bot('That is a lot of commands in a short time. Please wait a few seconds and try again.', { tone: 'warn' }); return; }
    const risk = def.risk ? def.risk(p) : '';
    if (risk && !opts.confirmed) {
      pending = { name, p, at: Date.now() };
      Audit.log('confirm_requested', name, 'waiting');
      bot('I am about to: ' + def.label(p) + '.', {
        tone: 'warn', note: risk + ' Nothing happens until you confirm.',
        acts: [{ label: 'Confirm', fn: b => confirmPending(b) }, { label: 'Cancel', cls: 'danger', fn: () => cancelPending() }]
      });
      return;
    }
    let r; try { r = def.run(p); } catch (e) { r = { ok: false, msg: 'Something went wrong while doing that. Nothing was changed.' }; }
    Audit.log(name, name === 'fill_search' ? 'search_term_len_' + (p.value || '').length : (p.page || p.mode || p.preset || p.date || ''), r.ok ? 'ok' : 'failed');
    if (r.msg) bot(r.msg, { tone: r.ok ? (r.quiet ? undefined : 'ok') : 'warn' });
  }
  function confirmPending() {
    if (!pending) return bot('There is nothing waiting for confirmation.', { speak: false });
    if (Date.now() - pending.at > 60000) { pending = null; return bot('That confirmation expired. Please ask again.', { tone: 'warn' }); }
    const { name, p } = pending; pending = null; Audit.log('confirmed', name, 'ok'); run(name, p, { confirmed: true });
  }
  function cancelPending() { if (pending) { Audit.log('cancelled', pending.name, 'ok'); pending = null; } bot('Cancelled. Nothing was changed.', { speak: false }); }

  function clearChat() {
    history.splice(0).forEach(el => el.remove()); root.classList.remove('fvai-talking'); pending = null; stopSpeaking(); lastBotText = '';
    Audit.log('clear_chat', 'local', 'ok');
    welcome(true);
  }
  on(btnClear, 'click', clearChat);

  /* ================================================================== page inspection (reads real DOM, never values) */
  function inspectPage() {
    const main = document.querySelector('main') || document.body;
    const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const heads = [...main.querySelectorAll('h1,h2,h3')].map(text).filter(Boolean).slice(0, 12);
    const fields = [...main.querySelectorAll('input,select,textarea')].filter(el => el.type !== 'hidden').map(el => {
      const lab = el.id ? main.querySelector('label[for="' + el.id + '"]') : null;
      return { id: el.id, type: el.type || el.tagName.toLowerCase(), label: lab ? text(lab).replace(/:.*$/, '') : (el.getAttribute('aria-label') || ''), required: el.required, max: el.maxLength > 0 && el.maxLength < 1e6 ? el.maxLength : 0, secret: el.type === 'password' };
    }).filter(f => f.label);
    const buttons = [...main.querySelectorAll('button')].filter(b => !b.closest('[hidden]')).map(text).filter(Boolean).slice(0, 14);
    return { heads, fields, buttons, lead: (main.querySelector('.lead') ? text(main.querySelector('.lead')) : '') };
  }
  function dynamicDocs() {
    const info = inspectPage(), docs = [];
    info.heads.slice(0, 10).forEach(t => docs.push({ page: here, title: t, desc: 'A section on the ' + Core.PAGES[here].title + ' page.' }));
    info.fields.slice(0, 12).forEach(f => docs.push({ page: here, title: f.label, desc: 'A field on the ' + Core.PAGES[here].title + ' page.' }));
    info.buttons.slice(0, 10).forEach(t => docs.push({ page: here, title: t, desc: 'A button on the ' + Core.PAGES[here].title + ' page.' }));
    return docs;
  }
  let index = null;
  const getIndex = () => index || (index = Core.buildIndex(dynamicDocs()));

  const PAGE_TOPICS = { 'index.html': ['register', 'attendance', 'records'], 'about.html': ['recognition', 'privacy'], 'register.html': ['register'], 'attendance.html': ['attendance', 'today'], 'records.html': ['records', 'csv'], 'lab.html': ['lab'], 'admin.html': ['login', 'settings', 'backup'], 'contact.html': [] };
  function explainPage(scope) {
    const pg = Core.PAGES[here] || { title: document.title, desc: '' }, info = inspectPage();
    const lines = [];
    if (scope === 'form') {
      if (!info.fields.length) return bot('I do not see any form fields on the ' + pg.title + ' page. Try "explain the current page" instead.', { tone: 'warn' });
      bot('Here are the fields on the ' + pg.title + ' page:', {
        steps: info.fields.map(f => f.label + (f.secret ? ' (password: I never read or store it)' : '') + ' — ' + (f.required ? 'required' : 'optional') + (f.max ? ', up to ' + f.max + ' characters' : '') + (f.type === 'range' ? ', slider' : f.type === 'date' ? ', date picker' : f.type === 'select-one' ? ', choose from the list' : '')),
        note: 'I do not fill in or submit forms with personal details. ' + (PAGE_TOPICS[here].length ? 'Ask me "how do I ' + (here === 'register.html' ? 'register a student' : 'use this page') + '?" for the full steps.' : ''),
        acts: PAGE_TOPICS[here].slice(0, 2).map(id => { const t = Core.TOPICS.find(x => x.id === id); return { label: t.title, fn: () => showTopic(id) }; })
      });
      return;
    }
    lines.push(pg.title + ' page: ' + pg.desc);
    const steps = [];
    if (info.fields.length) steps.push('Fields: ' + info.fields.slice(0, 8).map(f => f.label).join(', ') + '.');
    if (info.buttons.length) steps.push('Buttons: ' + info.buttons.slice(0, 8).join(', ') + '.');
    if (info.heads.length > 1) steps.push('Sections: ' + info.heads.slice(1, 7).join(' · ') + '.');
    bot(lines.join(' '), {
      steps: steps.length ? steps : null, note: 'This comes from the real page content, not a guess.',
      acts: PAGE_TOPICS[here].map(id => { const t = Core.TOPICS.find(x => x.id === id); return { label: t.title, fn: () => showTopic(id) }; })
    });
  }

  /* ================================================================== topics / overview / search results */
  function localTodayCount() {
    try { const logs = DB.logs().filter(l => l.date === DB.today()); return new Set(logs.map(l => l.id)).size + ' of ' + DB.people().length + ' registered people'; } catch (e) { return null; }
  }
  function showTopic(id) {
    const t = Core.TOPICS.find(x => x.id === id); if (!t) return;
    let note = t.note;
    if (id === 'today') { const c = localTodayCount(); if (c) note = 'Right now this browser shows ' + c + ' marked present today (counted locally; nothing is sent anywhere).'; }
    const acts = [];
    if (t.page && t.page !== here) acts.push(openBtn(t.page));
    if (id === 'records' && here !== 'records.html') acts.push({ label: 'Focus the search box', fn: () => run('focus_field', { page: 'records.html', id: 'fsearch' }) });
    if (id === 'today') acts.push({ label: 'Show today in Records', fn: () => run('set_filter_date', { date: DB.today() }) });
    bot(t.title + ':', { steps: t.steps, note, acts });
  }
  function overview() {
    bot('I am ' + NAME + ', a local assistant built from this site\'s own pages. FaceVector Attendance lets you register faces, take attendance by camera, review records, explore face vectors in the 2D Lab and manage data in Admin. Pick a page:', {
      acts: PAGE_FILES.map(p => ({ label: Core.PAGES[p].title, fn: () => run('navigate', { page: p }) })),
      steps: ['Say or type: "Open Records", "How do I register a student?", "Search for a student named …", "Explain this page", "Dark mode", "Download CSV" (asks first), "Security status", "Stop speaking", "Close the assistant".',
        'Toggle Search website to search page content instead of asking me.',
        'I never register people, change attendance, delete data, log in or change settings for you. I take you to the right place and you press the buttons.'],
      note: 'No external AI service is connected, so answers come from this project\'s own documentation and pages. Nothing you type leaves your browser.'
    });
  }
  function resultCard(r) {
    const d = r.doc, label = { page: 'Page', guide: 'How-to', help: 'Troubleshooting', content: 'On a page' }[d.kind] || 'Result';
    const b = h('button', { type: 'button', class: 'fvai-res' }, h('em', { text: label + ' · ' + Core.PAGES[d.page].title }), h('b', { text: d.title }), h('span', { text: String(d.desc || '').slice(0, 130) }));
    b.addEventListener('click', () => {
      if (d.kind === 'guide') showTopic(d.topic);
      else if (d.kind === 'help') { bot(Core.HELP_ITEMS[d.help].q, { note: Core.HELP_ITEMS[d.help].a, acts: [{ label: 'Show on Contact page', fn: () => run('open_help', { index: d.help }) }] }); }
      else run('navigate', { page: d.page });
    });
    return b;
  }
  function doSearch(q, fallback) {
    const res = Core.search(q, getIndex(), 6);
    if (!res.length) {
      bot('I could not find "' + clean(q, 60) + '" in this website\'s pages or help text' + (fallback ? ', and I do not have an answer for it' : '') + '. I will not guess. Try other words, or pick a page:', {
        tone: 'warn', acts: PAGE_FILES.slice(0, 8).map(p => ({ label: Core.PAGES[p].title, fn: () => run('navigate', { page: p }) })),
        note: 'No external AI is connected, so I only know what this project contains.'
      });
      return;
    }
    bot('Website search results for "' + clean(q, 60) + '":', { results: res.map(resultCard), speak: false });
    if (prefs.speak || speakingVoiceInput) maybeSpeak('I found ' + res.length + ' results. The best match is ' + res[0].doc.title + '.');
  }

  /* ================================================================== main submit */
  let searchMode = false, busy = false;
  function setSearchMode(v) {
    searchMode = v; btnSearch.setAttribute('aria-pressed', String(v)); modeBadge.textContent = v ? 'Website search' : 'Ask / command';
    input.placeholder = v ? 'Search pages, buttons, help…' : 'Ask or give a command…';
  }
  on(btnSearch, 'click', () => { setSearchMode(!searchMode); input.focus(); bot(searchMode ? 'Website search is on: whatever you type searches the pages, buttons and help text. Press the button again for questions and commands.' : 'Back to questions and commands.', { speak: false }); });

  async function submit(text) {
    text = clean(text, 300); if (!text || busy) return;
    busy = true; btnSend.disabled = true; focusInPage = false;
    try {
      userMsg(text); input.value = ''; autosize();
      await thinking();
      if (pending && Date.now() - pending.at > 60000) pending = null;
      const r = Core.parse(text, { pendingConfirm: !!pending, searchMode, now: new Date() });
      if (pending && r.intent !== 'confirm' && r.intent !== 'cancel') { Audit.log('cancelled', pending.name, 'superseded'); pending = null; }
      switch (r.intent) {
        case 'confirm': confirmPending(); break;
        case 'cancel': cancelPending(); break;
        case 'action':
          if (r.name === 'navigate' && r.via === 'settings') bot('There is no page named "Settings". The recognition settings (threshold and margin) live inside the Admin page, behind the admin password.', { tone: 'warn', speak: true });
          run(r.name, r.params); break;
        case 'overview': overview(); break;
        case 'explain_page': explainPage(r.scope); break;
        case 'topic': showTopic(r.topic); break;
        case 'help_item': { const it = Core.HELP_ITEMS[r.index]; bot(it.q, { note: it.a, acts: [{ label: 'Show on Contact page', fn: () => run('open_help', { index: r.index }) }] }); break; }
        case 'choose': bot('Which page do you mean?', { acts: r.pages.map(p => ({ label: Core.PAGES[p].title, fn: () => run('navigate', { page: p }) })) }); break;
        case 'refuse': Audit.log('refused', r.reason, 'blocked'); bot(r.msg, { tone: 'warn', acts: r.page ? [openBtn(r.page)] : [] }); break;
        case 'absent': bot(r.msg, { tone: 'warn' }); break;
        case 'search': doSearch(r.query, r.fallback); break;
        default: break;
      }
    } catch (e) {
      bot('Sorry, something went wrong and nothing was changed. You can try again or rephrase.', { tone: 'err' });
    } finally { busy = false; btnSend.disabled = false; if (view === 'chat' && state !== 'closed' && !focusInPage) input.focus(); }
  }

  function autosize() { input.rows = 1; input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 110) + 'px'; }
  on(input, 'input', autosize);
  on(input, 'keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(input.value); } });
  on(btnSend, 'click', () => submit(input.value));
  on(chips, 'click', e => { const c = e.target.closest('.fvai-chip'); if (c) submit(c.textContent); });

  /* ================================================================== security status panel */
  const SEV = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  function collectIssues() {
    const now = Date.now(), out = [], ev = Audit.list(), day = ev.filter(e => now - e.t < 864e5);
    const add = (sev, kind, title, detail, fix, t) => out.push({ sev, kind, title, detail, fix, t: t || now });
    const last = type => { const a = ev.filter(e => e.type === type); return a.length ? a[a.length - 1].t : 0; };
    const hasStore = typeof store !== 'undefined' && typeof DB !== 'undefined';
    try {
      if (hasStore && !store.get('auth', null)) add('high', 'confirmed', 'Admin password is not set', 'Until a password exists, anyone using this browser can create it and then manage students, settings and backups.', 'Open Admin and create a password (8+ characters, letters and numbers).');
      const lock = hasStore ? store.get('authlock', { fails: 0, until: 0 }) : { fails: 0, until: 0 };
      if (lock && lock.until > now) add('high', 'confirmed', 'Admin login is locked after repeated wrong passwords', 'The lock ends at ' + new Date(lock.until).toLocaleTimeString() + '.', 'If this was not you, someone tried to guess the password on this device. Consider changing it after the lock ends.', last('login_lockout') || null);
      else if (lock && lock.fails > 0) add('medium', 'confirmed', lock.fails + ' recent wrong admin password attempt(s)', 'The counter resets after a correct login or a lock-out.', 'Check whether these were you. Use a strong, unique password.', last('login_failed') || null);
    } catch (e) { /* ignore */ }
    const failed = day.filter(e => e.type === 'login_failed').length, locks = ev.filter(e => e.type === 'login_lockout').length;
    if (failed >= 3) add('medium', 'confirmed', failed + ' failed admin logins in the last 24 hours', 'Logged by this browser since the monitoring hooks were installed.', 'Review who has access to this device.', last('login_failed'));
    if (locks) add('high', 'confirmed', 'Admin lock-out triggered ' + locks + ' time(s) in the audit log', 'Five wrong passwords in a row locks the login for 5 minutes.', 'Investigate possible password guessing. Change the password.', last('login_lockout'));
    const denied = ev.filter(e => e.type === 'admin_action_denied').length;
    if (denied) add('medium', 'confirmed', denied + ' admin action(s) attempted without a valid admin session', 'The Admin page refused them and asked for a login.', 'Usually a session timeout (15 minutes). If unexpected, check device access.', last('admin_action_denied'));
    const resets = ev.filter(e => e.type === 'data_reset').length;
    if (resets) add('high', 'confirmed', 'Local data was reset via "Forgot password" ' + resets + ' time(s)', 'That action deletes all students, face vectors and records on this device.', 'Confirm it was intentional. Restore from a backup if needed.', last('data_reset'));
    const blocked = ev.filter(e => e.type === 'action_blocked' || e.type === 'refused').length;
    if (blocked) add('info', 'confirmed', 'The assistant refused ' + blocked + ' request(s)', 'Examples: deleting data, bypassing login, or actions outside its allowlist.', 'No action needed.', last('refused') || last('action_blocked'));
    const host = location.hostname, local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
    if (location.protocol === 'file:') add('high', 'confirmed', 'Opened from a file, not a web server', 'Camera and secure crypto (needed for the Admin password) do not work from file://.', 'Serve the folder with npm start or a static host over HTTPS.');
    else if (location.protocol === 'http:' && !local) add('high', 'confirmed', 'Page is served over HTTP, not HTTPS', 'Traffic can be read or changed in transit, and the camera/crypto APIs may be blocked.', 'Deploy behind HTTPS (e.g. Netlify, GitHub Pages, Cloudflare Pages, or nginx with a certificate).');
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (!csp) add('medium', 'confirmed', 'This page has no Content-Security-Policy', 'A CSP limits what scripts can run if an XSS bug appears.', 'Add the same CSP meta tag the other pages use, or send it as an HTTP header.');
    else if (/unsafe-eval|unsafe-inline/.test(csp.content)) add('medium', 'confirmed', 'CSP allows unsafe-inline or unsafe-eval', csp.content.slice(0, 120), 'Remove those keywords from script-src.');
    const ext = [...document.scripts].filter(s => s.src && new URL(s.src, location.href).origin !== location.origin);
    ext.forEach(s => { if (!s.integrity) add('medium', 'potential', 'Third-party script without Subresource Integrity', new URL(s.src).host + new URL(s.src).pathname.replace(/(.{40}).*/, '$1…') + ' (version is pinned, but its content is not verified).', 'Self-host the file (see README) or add integrity="sha384-…" and crossorigin attributes.'); });
    if ([...document.querySelectorAll('link[rel=stylesheet]')].some(l => new URL(l.href, location.href).origin !== location.origin)) add('low', 'potential', 'External stylesheet (Google Fonts)', 'Loading it tells Google the visitor\'s IP address.', 'Self-host the Space Grotesk font if that matters for your privacy policy.');
    try {
      if (hasStore) {
        const rp = store.get('people', []), rl = store.get('logs', []);
        const badP = (Array.isArray(rp) ? rp.length : (rp && Object.keys(rp).length ? 1 : 0)) - DB.people().length, badL = (Array.isArray(rl) ? rl.length : (rl && Object.keys(rl).length ? 1 : 0)) - DB.logs().length;
        if (badP > 0 || badL > 0) add('medium', 'potential', 'Stored records failed validation', (badP > 0 ? badP + ' student record(s) ' : '') + (badL > 0 ? badL + ' attendance record(s) ' : '') + 'are ignored by the app. Possible corruption or manual editing of browser storage.', 'Restore a recent backup from Admin, and check who can open developer tools on this device.');
        const n = DB.people().length;
        if (n) add('medium', 'potential', n + ' face-vector profile(s) stored unencrypted in this browser', 'localStorage is readable by anyone with access to this browser profile (and by any script that runs on this origin).', 'Use a device lock, a separate browser profile, remove people who no longer need to be stored, and keep backup files private.');
      }
    } catch (e) { /* ignore */ }
    if (SR) add('info', 'potential', 'Voice input may send audio to the browser vendor', 'This site never records or stores audio, but the browser\'s speech recognition can use a cloud service.', 'Use typing for sensitive environments. Voice only starts after you consent and press the mic.');
    add('info', 'confirmed', 'Not covered by this panel', 'It cannot see server logs, API traffic, file changes on a server, or other apps. This project has no backend, so there is no server-side authentication or API to monitor.', 'Use host logs, git history, `npm test` (static + security checks) and, if you add a server, server-side monitoring.');
    return out.sort((a, b) => SEV[b.sev] - SEV[a.sev]);
  }
  const fmt = t => new Date(t).toLocaleString();
  function reportText(issues, ev) {
    return ['FaceVector security status (' + fmt(Date.now()) + ')', 'Scope: this browser only. Not a guarantee of security.', ''].concat(
      issues.map(i => '[' + i.sev.toUpperCase() + '/' + i.kind + '] ' + i.title + ' - ' + i.detail + ' Fix: ' + i.fix),
      ['', 'Audit events (latest 25, newest first):'], ev.slice(-25).reverse().map(e => fmt(e.t) + ' ' + e.type + ' ' + e.detail + ' ' + e.outcome)).join('\n');
  }
  function renderSecurity() {
    secBox.textContent = '';
    if (!isAdminSession()) {
      Audit.log('security_view', 'panel', 'denied_not_admin');
      secBox.append(h('p', { text: 'Security reports are limited to a logged-in admin. Log in on the Admin page, then come back to this tab.' }),
        h('p', { class: 'fvai-note', text: 'Honest limit: this gate is enforced in the browser only, because this project has no server. It keeps casual users out; it is not a substitute for server-side access control.' }),
        h('div', { class: 'fvai-acts' }, btn('Open Admin', () => run('navigate', { page: 'admin.html' }))));
      return;
    }
    Audit.log('security_view', 'panel', 'ok');
    const issues = collectIssues(), ev = Audit.list();
    secBox.append(
      h('div', { class: 'fvai-issue info' }, h('div', { class: 'fvai-ih' }, h('span', { class: 'badge ok', text: 'Active' }), 'Monitoring status'),
        h('p', { text: 'Client-side checks ran at ' + new Date().toLocaleTimeString() + ' for this browser and this page. Events are recorded while pages are open. This is not real-time protection against every attack and does not prove the site is secure.' })),
      h('h3', { text: 'Findings (' + issues.length + ')' }));
    issues.forEach(i => {
      const sevCls = i.sev === 'critical' || i.sev === 'high' ? 'bad' : i.sev === 'medium' ? 'warn' : '';
      secBox.append(h('div', { class: 'fvai-issue ' + i.sev }, h('div', { class: 'fvai-ih' }, h('span', { class: 'badge ' + sevCls, text: i.sev }), h('span', { class: 'badge', text: i.kind === 'confirmed' ? 'Confirmed' : 'Potential risk' }), i.title, h('time', { text: fmt(i.t) })),
        h('p', { text: i.detail }), h('span', { class: 'fix', text: 'Recommended: ' + i.fix })));
    });
    secBox.append(h('h3', { text: 'Audit events (latest 25, no message content stored)' }));
    const recent = ev.slice(-25).reverse();
    if (!recent.length) secBox.append(h('p', { text: 'No events yet.' }));
    recent.forEach(e => secBox.append(h('div', { class: 'fvai-audit', text: fmt(e.t) + ' · ' + e.type + (e.detail ? ' · ' + e.detail : '') + ' · ' + e.outcome + ' · ' + e.page })));
    secBox.append(h('p', { class: 'fvai-note', text: 'Retention: up to 200 events or 30 days, stored only in this browser. Passwords, names, face data and typed text are never logged.' }),
      h('div', { class: 'fvai-acts' },
        btn('Re-run checks', () => renderSecurity()),
        btn('Copy report', async () => { try { await navigator.clipboard.writeText(reportText(issues, ev)); typeof toast === 'function' && toast('Report copied'); } catch (e) { typeof toast === 'function' && toast('Could not copy. Select the text manually.'); } }),
        btn('Clear audit log', () => { if (isAdminSession() && confirm('Clear the assistant audit log on this device?')) { Audit.clear(); Audit.log('audit_cleared', 'by_admin', 'ok'); renderSecurity(); } }, 'danger')));
  }

  /* ================================================================== welcome + init */
  function welcome(again) {
    bot('Hi! I am ' + NAME + '. I know this website\'s ' + PAGE_FILES.length + ' pages and can open them, search them, explain forms and guide you step by step. Type or use the mic (Bengali and English).', {
      speak: false, note: 'I am a local, rule-based assistant: no external AI is connected and nothing you type is sent anywhere. I never register people, change attendance, delete data or log in for you.'
    });
  }
  function init() {
    document.body.append(root); document.body.classList.add('fvai-on');
    welcome();
    const p = takePending();
    if (p) {
      setState('open');
      if (p.a === 'arrived') bot('You are now on the ' + Core.PAGES[here].title + ' page. Ask me to explain it any time.', { speak: false });
      else {
        const params = {}; ['v', 'page', 'id', 'date', 'session', 'index'].forEach(k => { if (p[k] !== undefined) params[k === 'v' ? 'value' : k] = p[k]; });
        run(p.a, params);
      }
    }
  }
  if (document.readyState === 'loading') on(document, 'DOMContentLoaded', init); else init();

  on(window, 'pagehide', e => { stopListening(); stopSpeaking(); if (!e.persisted) cleanups.splice(0).forEach(f => { try { f(); } catch (err) { /* ignore */ } }); }); // keep listeners if the page may be restored from the back/forward cache
  window.FVAssistant = Object.freeze({ open: () => setState('open'), close: () => setState('closed') });
})();
