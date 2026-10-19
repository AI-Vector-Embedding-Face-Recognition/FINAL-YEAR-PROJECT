#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'about.html', 'register.html', 'attendance.html', 'records.html', 'lab.html', 'admin.html', 'contact.html'];
const errors = [];
function fail(message) { errors.push(message); }
for (const page of pages) {
  const file = path.join(root, page);
  if (!fs.existsSync(file)) { fail(`Missing page: ${page}`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  if (!/<h1\b/i.test(html)) fail(`${page}: missing H1`);
  const nav = html.match(/\[['"]index\.html['"]/g);
  // The shared navigation is rendered by js/main.js; verify all expected page names are present there.
  if (!html.includes('js/main.js')) fail(`${page}: missing shared js/main.js`);
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const url = match[1];
    if (/^(?:https?:|data:|#|mailto:|tel:|javascript:)/i.test(url)) continue;
    const local = url.split(/[?#]/)[0];
    if (!local) continue;
    if (!fs.existsSync(path.resolve(root, local))) fail(`${page}: broken local reference ${url}`);
  }
}
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
for (const page of pages) if (!main.includes(`'${page}'`) && !main.includes(`"${page}"`)) fail(`Shared navigation missing ${page}`);
const jsDir = path.join(root, 'js');
for (const file of fs.readdirSync(jsDir).filter(f => f.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(jsDir, file)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${file}: JavaScript syntax check failed\n${result.stderr}`);
}
if (errors.length) {
  console.error(`Project check failed (${errors.length} issue(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Project check passed: ${pages.length} HTML pages, local references, shared navigation and JavaScript syntax.`);
