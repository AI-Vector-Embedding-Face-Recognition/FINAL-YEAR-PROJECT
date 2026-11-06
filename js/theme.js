/* Dynamic colour system.
   - Mode: Auto (follows the phone / laptop setting live), Light or Dark
   - Preset colour schemes + a custom accent colour picker
   - Every page colour is recalculated from the accent, with contrast kept readable
   - Choice is remembered in this browser and shared between open tabs
   Loaded in <head> so the right colours are painted from the first frame (no flash). */
(function () {
  'use strict';
  const KEY = 'fv-theme';
  const PRESETS = {
    sea:    { name: 'Sea',    accent: '#2f54d6', paper: '#a8e0c9' },
    ocean:  { name: 'Ocean',  accent: '#0b6fb8', paper: '#b9dcf3' },
    sunset: { name: 'Sunset', accent: '#c2410c', paper: '#f8d4b4' },
    violet: { name: 'Violet', accent: '#6d3fd1', paper: '#d9ccf5' },
    rose:   { name: 'Rose',   accent: '#c0245f', paper: '#f6c9da' },
    forest: { name: 'Forest', accent: '#1f7a3d', paper: '#c4e6c3' },
    slate:  { name: 'Slate',  accent: '#374a6b', paper: '#d3d9e3' },
    teal:   { name: 'Teal',   accent: '#0f766e', paper: '#b7e4df' },
    indigo: { name: 'Indigo', accent: '#4338ca', paper: '#cfd0f5' },
    crimson:{ name: 'Crimson',accent: '#b91c1c', paper: '#f6c4c4' },
    gold:   { name: 'Gold',   accent: '#a16207', paper: '#f5e3a6' },
    lime:   { name: 'Lime',   accent: '#4d7c0f', paper: '#d9edb0' },
    pink:   { name: 'Pink',   accent: '#be185d', paper: '#fbcfe8' },
    sky:    { name: 'Sky',    accent: '#0369a1', paper: '#c8e6fa' },
    brown:  { name: 'Coffee', accent: '#7c4a21', paper: '#e8d3bd' },
    mono:   { name: 'Mono',   accent: '#1f2937', paper: '#e5e7eb' }
  };
  const HEX = /^#[0-9a-f]{6}$/i;
  const root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  /* ---------- colour maths ---------- */
  const toRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = toRgb(a), y = toRgb(b); return toHex(x.map((v, i) => v * t + y[i] * (1 - t))); }; // t = share of a
  function toHsl(h) {
    const [r, g, b] = toRgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let hh = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh *= 60; if (hh < 0) hh += 360;
    }
    return [hh, s, l];
  }
  function fromHsl(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
  }
  const lum = h => { const [r, g, b] = toRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const clampL = (h, lo, hi) => { const [a, s, l] = toHsl(h); return fromHsl(a, s, Math.max(lo, Math.min(hi, l))); };

  /* ---------- palette: every variable used by style.css ---------- */
  function palette(mode, accent0, paper0, customPaper) {
    const dark = mode === 'dark';
    const accent = dark ? clampL(accent0, 0.68, 0.84) : clampL(accent0, 0.12, 0.44);
    const card = dark ? mix(accent, '#141a2e', 0.06) : mix(accent, '#ffffff', 0.025);
    const paper = dark ? (customPaper ? mix(customPaper, '#0b1020', 0.2) : mix(accent0, '#0b1020', 0.15)) : paper0;
    const ink = dark ? '#e8ecf8' : '#16213e';
    return {
      '--paper': paper, '--card': card, '--ink': ink,
      '--muted': dark ? '#aab5d3' : '#3b4660',
      '--line': dark ? mix(accent, card, 0.2) : mix(accent0, card, 0.2),
      '--accent': accent,
      '--on-accent': lum(accent) > 0.4 ? '#0b1020' : '#ffffff',
      '--accent-soft': mix(accent, card, dark ? 0.2 : 0.13),
      '--field': dark ? mix(accent, '#0e1324', 0.05) : '#ffffff',
      '--code-bg': mix(accent, card, dark ? 0.1 : 0.07),
      '--hover': mix(accent, card, 0.06),
      '--ok': dark ? '#4cc9a8' : '#14866d', '--ok-soft': dark ? mix('#4cc9a8', card, 0.16) : '#dcf3ec',
      '--bad': dark ? '#ff8a73' : '#c8432b', '--bad-soft': dark ? mix('#ff8a73', card, 0.16) : '#fbe5e0',
      '--warn': dark ? '#e6b450' : '#9a6a14', '--warn-soft': dark ? mix('#e6b450', card, 0.16) : '#fdf0d5',
      '--warn-line': '#d99a2b',
      '--shadow': dark ? '0 8px 28px rgba(0,0,0,.5)' : '0 6px 24px rgba(10,20,50,.12)'
    };
  }

  /* ---------- state ---------- */
  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
    return {
      mode: ['auto', 'light', 'dark'].includes(s.mode) ? s.mode : 'auto',
      preset: PRESETS[s.preset] || s.preset === 'custom' ? s.preset : 'sea',
      custom: HEX.test(s.custom || '') ? s.custom : '#2f54d6',
      paper: HEX.test(s.paper || '') ? s.paper : ''   // custom page background ('' = from colour scheme)
    };
  }
  let state = load();
  const resolve = () => state.mode === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : state.mode;

  function apply() {
    const mode = resolve();
    const base = state.preset === 'custom' ? { accent: state.custom, paper: mix(state.custom, '#ffffff', 0.24) } : PRESETS[state.preset];
    const p = palette(mode, base.accent, state.paper || base.paper, state.paper);
    for (const k in p) root.style.setProperty(k, p[k]);
    root.style.colorScheme = mode;
    root.setAttribute('data-theme', mode);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = p['--card'];
    window.dispatchEvent(new CustomEvent('themechange', { detail: { mode, state } }));
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked: theme still works for this visit */ } }

  const Theme = {
    PRESETS,
    get: () => ({ ...state, resolved: resolve() }),
    set(part) {
      if (part.mode && ['auto', 'light', 'dark'].includes(part.mode)) state.mode = part.mode;
      if (part.preset && (PRESETS[part.preset] || part.preset === 'custom')) { state.preset = part.preset; if (PRESETS[part.preset] && part.paper === undefined) state.paper = ''; }
      if (part.custom && HEX.test(part.custom)) { state.custom = part.custom; state.preset = 'custom'; }
      if (part.paper === '' || (part.paper && HEX.test(part.paper))) state.paper = part.paper;
      save(); apply();
    },
    reset() { state = { mode: 'auto', preset: 'sea', custom: '#2f54d6', paper: '' }; save(); apply(); },
    /* read the live colour of a CSS variable (used by the canvas map) */
    css: name => getComputedStyle(root).getPropertyValue(name).trim()
  };
  window.Theme = Theme;

  apply();
  if (mq) (mq.addEventListener ? mq.addEventListener('change', () => { if (state.mode === 'auto') apply(); }) : mq.addListener(() => { if (state.mode === 'auto') apply(); }));
  window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); apply(); } });
})();
