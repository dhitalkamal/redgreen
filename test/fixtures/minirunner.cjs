// tiny test runner for fixture repos: runs *.test.cjs and *.check.cjs, writes reports/junit.xml
const fs = require('node:fs');
const path = require('node:path');

const SKIP = new Set(['node_modules', '.git', 'reports', '.tmp']);
function find(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return find(full);
    return /\.(test|check)\.cjs$/.test(entry.name) ? [full] : [];
  });
}
const esc = (s) => String(s).split('\n')[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const cases = [];
let failed = false;
for (const file of find('.').sort()) {
  const rel = file.split(path.sep).join('/');
  let tests;
  try {
    tests = require(path.resolve(file));
  } catch (e) {
    failed = true;
    cases.push(`<testcase classname="${esc(rel)}" name="load"><error message="${esc(e.message)}"/></testcase>`);
    continue;
  }
  for (const [name, fn] of Object.entries(tests)) {
    try {
      fn();
      cases.push(`<testcase classname="${esc(rel)}" name="${esc(name)}"/>`);
    } catch (e) {
      failed = true;
      cases.push(`<testcase classname="${esc(rel)}" name="${esc(name)}"><failure message="${esc(e.message)}"/></testcase>`);
    }
  }
}
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/junit.xml', `<testsuites><testsuite name="mini">${cases.join('')}</testsuite></testsuites>`);
process.exit(failed ? 1 : 0);
