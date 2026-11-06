#!/usr/bin/env node
'use strict';
// Development-time security lint. Static text checks only: it cannot prove the site is secure.
// Fails (exit 1) on: secrets in source, eval/new Function/document.write, inline handlers,
// weak CSP, and any network/HTML-injection API inside the assistant. Warns on third-party scripts without SRI.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const js = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
const fails = [], warns = [];
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1'); // drop comments before scanning

for (const f of [...js, ...html, 'scripts/check-project.js']) {
  const raw = read(f), src = f.endsWith('.js') ? strip(raw) : raw;
  if (/\beval\s*\(/.test(src)) fails.push(`${f}: eval() found`);
  if (/\bnew\s+Function\s*\(/.test(src)) fails.push(`${f}: new Function() found`);
  if (/document\.write(ln)?\s*\(/.test(src)) fails.push(`${f}: document.write found`);
  if (/\bsetTimeout\s*\(\s*["'`]|\bsetInterval\s*\(\s*["'`]/.test(src)) fails.push(`${f}: string passed to setTimeout/setInterval`);
  if (/(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(api|secret|token)[_-]?key["']?\s*[:=]\s*["'][^"']{12,}["'])/i.test(raw)) fails.push(`${f}: possible hard-coded secret`);
}
for (const f of html) {
  const t = read(f);
  if (/\son[a-z]+\s*=\s*["']/i.test(t)) fails.push(`${f}: inline event handler attribute`);
  if (/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(t)) fails.push(`${f}: inline <script> block`);
  const csp = (t.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i) || [])[1];
  if (!csp) fails.push(`${f}: missing Content-Security-Policy`);
  else { if (/unsafe-(inline|eval)/.test(csp)) fails.push(`${f}: CSP allows unsafe-inline/unsafe-eval`); if (!/default-src 'none'/.test(csp)) warns.push(`${f}: CSP does not start from default-src 'none'`); }
  for (const m of t.matchAll(/<script[^>]+src="(https?:[^"]+)"[^>]*>/gi)) if (!/integrity=/.test(m[0])) warns.push(`${f}: third-party script without SRI: ${m[1]}`);
}
const asst = strip(read('js/assistant.js')) + strip(read('js/assistant-core.js'));
for (const [re, why] of [[/\.innerHTML\b|insertAdjacentHTML|\.outerHTML\s*=/, 'HTML injection API'], [/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/, 'network API (the assistant must stay local)'], [/\blocalStorage\.setItem\([^)]*(password|auth|embedding)/i, 'sensitive data written to storage'], [/console\.(log|debug|info)/, 'console logging']])
  if (re.test(asst)) fails.push(`assistant: ${why}`);
if (fs.existsSync(path.join(root, '.env'))) fails.push('.env file present in project (never ship real secrets)');
if (!fs.existsSync(path.join(root, '.env.example'))) warns.push('.env.example missing');

for (const w of warns) console.warn('WARN  ' + w);
if (fails.length) { console.error(`Security check FAILED (${fails.length}):`); fails.forEach(f => console.error('- ' + f)); process.exit(1); }
console.log(`Security check passed with ${warns.length} warning(s): ${js.length} JS files and ${html.length} pages scanned. (Static lint only; not a security guarantee.)`);
