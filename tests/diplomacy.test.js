const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function view(timer) {
  const ctx = vm.createContext({
    window: {}, civs: { A: { war: { B: timer } }, B: {} },
    data: [[{ color: 'A' }, { color: 'B' }, null]]
  });
  for (const file of ['relationships.js', 'canvas.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
  }
  ctx.diplomacyViewCiv = 'A';
  return ctx;
}

test('diplomacy hover shows pact and war expiry in quarters, including boundary timers', () => {
  for (const [timer, label, quarters] of [
    [-15, 'Alliance', 5], [-15.5, 'Non-aggression pact', 6],
    [10.5, 'War', 5], [-5, 'Alliance', 1], [-5.5, 'Non-aggression pact', 1], [1.5, 'War', 1]
  ]) {
    assert.equal(view(timer).diplomacyTooltip(0, 1),
      `A / B — ${label}: ${quarters} quarter${quarters === 1 ? '' : 's'} until expiry`);
  }
});

test('diplomacy hover clears outside territory and mode, and identifies neutral and own territory', () => {
  const ctx = view(undefined);
  assert.equal(ctx.diplomacyTooltip(0, 0), 'A — own territory');
  assert.equal(ctx.diplomacyTooltip(0, 1), 'A / B — Neutral (no expiry)');
  ctx.canvas = { title: '', getBoundingClientRect: () => ({ left: 0, top: 0, width: 60, height: 20 }) };
  ctx.updateDiplomacyTooltip({ clientX: 30, clientY: 10 });
  assert.match(ctx.canvas.title, /Neutral/);
  ctx.updateDiplomacyTooltip({ clientX: 50, clientY: 10 });
  assert.equal(ctx.canvas.title, '');
  ctx.diplomacyViewCiv = null;
  ctx.updateDiplomacyTooltip({ clientX: 30, clientY: 10 });
  assert.equal(ctx.canvas.title, '');
});
