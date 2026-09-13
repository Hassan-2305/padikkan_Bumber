/* Runs every suite in a fresh process and reports the totals. */
const { execFileSync } = require('child_process');
const path = require('path');
const suites = [
  ['background + economy', 'run.js'],
  ['block overlay',        'ui.js'],
  ['popup',                'popup-ui.js'],
  ['blocker content script', 'blocker-ui.js'],
  ['coin mine',            'earner-ui.js']
];
let total = 0, bad = 0;
for (const [label, file] of suites) {
  let out = '';
  try { out = execFileSync('node', [path.join(__dirname, file)], { encoding: 'utf8' }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); bad++; }
  const m = out.match(/(\d+) passed, (\d+) failed/);
  if (!m) { console.log(`✗ ${label}: no result\n${out}`); bad++; continue; }
  total += +m[1];
  if (+m[2]) { bad++; console.log(`✗ ${label}: ${m[2]} failing\n` + out.split('\n').filter(l => l.includes('✗')).join('\n')); }
  else console.log(`✓ ${label.padEnd(24)} ${m[1]} assertions`);
}
console.log(`\n${total} assertions across ${suites.length} suites, ${bad} suite(s) failing`);
process.exit(bad ? 1 : 0);
