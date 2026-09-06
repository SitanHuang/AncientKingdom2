// Read-only factory affordability report from bundled scenario snapshots.
// Usage: node military/balance-report.cjs [--json]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console });
for (const file of ['data.js', 'military/state.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const rows = [];
for (const file of fs.readdirSync(root).filter(name => name.endsWith('.json'))) {
  // Scenario files use the game's legacy function-containing object format.
  const save = vm.runInNewContext('(' + fs.readFileSync(path.join(root, file), 'utf8') + ')', {}, { timeout: 3000 });
  if (!save.civs || !Array.isArray(save.data)) continue;
  context.data = save.data;
  const counts = {};
  for (const line of save.data) for (const tile of line || []) {
    if (tile?.color) counts[tile.color] = (counts[tile.color] || 0) + 1;
  }
  for (const [name, civ] of Object.entries(save.civs)) {
    if (!counts[name] || !Number.isFinite(civ.income)) continue;
    const costs = context.Military.getFactoryCosts(name);
    rows.push({ file, name, tiles: counts[name], income: civ.income, cash: civ.money || 0,
      expense: civ.expense || 0, governmentExpense: civ.govExp || 0,
      construction: costs.construction, operating: costs.upkeep });
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
else {
  const median = values => values.length ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)] : 0;
  const round = value => Math.round(value * 10) / 10;
  console.log(`${rows.length} state snapshots from ${new Set(rows.map(row => row.file)).size} scenarios; related saves are not independent samples.`);
  console.table([[1,25],[26,99],[100,199],[200,399],[400,699],[700,Infinity]].map(([lo,hi]) => {
    const group = rows.filter(row => row.tiles >= lo && row.tiles <= hi && row.income > 0);
    return { tiles: `${lo}–${hi}`, states: group.length,
      medianIncome: round(median(group.map(row => row.income))),
      medianCash: round(median(group.map(row => row.cash))),
      medianIncomeTurnsToBuild: round(median(group.map(row => row.construction / row.income))),
      canAffordConstructionNow: group.filter(row => row.cash >= row.construction).length,
      medianOperatingIncomePercent: round(100 * median(group.map(row => row.operating / row.income))) };
  }));
}
