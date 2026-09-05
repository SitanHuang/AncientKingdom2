const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function context() {
  const ctx = vm.createContext({
    i: 1, data: [], civs: { B: {}, A: {} }, military: {}, turn: 12, popv2: {},
    showYear: {}, MESSAGES: [], AGGRESSIVENESS: 1, RCHANCEMOD: 1, INCOMEMOD: 1,
    MANDATE_THRESHOLD: 1, localStorage: {},
    popv2_init() {}, normalizeCellTypes() {}, drawCanvas() {},
    Military: { init() {}, migrateLegacyCells() {} },
    MilitaryUI: { clearSelection() {}, refresh() { ctx.refreshedIndex = ctx.i; } },
    showInfo() { ctx.displayedIndex = ctx.i; },
    prompt: () => 'save', download: (_name, contents) => { ctx.exported = contents; }
  });
  ctx.window = ctx;
  for (const file of ['serializer.js', 'loaders.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
  }
  return ctx;
}

test('export and both localStorage slots restore the saved player before refreshing UI', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const handlers = [...html.matchAll(/onclick="([^"]*serialize\(\{data, civs,[^"]*)"/g)].map(match => match[1]);
  assert.equal(handlers.length, 3);
  for (const handler of handlers) {
    for (const index of [0, 1]) {
      const ctx = context();
      ctx.i = index;
      vm.runInContext(handler, ctx);
      const key = handler.includes('localStorage.back2') ? 'back2' : handler.includes('localStorage.back') ? 'back' : null;
      ctx.i = 1 - index;
      ctx.load_gamesave(key ? { localstorageKey: key } : { str: ctx.exported });
      assert.equal(ctx.i, index);
      assert.equal(ctx.refreshedIndex, index);
      assert.equal(ctx.displayedIndex, index);
      assert.equal(ctx.civOrders[index], index === 0 ? 'A' : 'B');
    }
  }
});

test('older saves and invalid saved indexes preserve the current player index', () => {
  for (const fields of [{}, { i: null }, { i: -1 }, { i: 2 }, { i: 0.5 }, { i: '0' }]) {
    const ctx = context();
    ctx.load_gamesave({ str: JSON.stringify({ data: [], civs: { A: {}, B: {} }, ...fields }) });
    assert.equal(ctx.i, 1);
  }
});
