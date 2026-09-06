const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function load(context, file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

function world(options = {}) {
  const context = vm.createContext({
    console,
    Math: Object.create(Math),
    Number,
    Object,
    Array,
    Map,
    Infinity,
    isFinite,
    isNaN,
    parseInt,
    turn: options.turn || 1,
    dynasty_decay_func: () => 1,
    popv2_get_totpop: (row, col) => context.data[row][col].pop || 0,
    popv2_apply_delta: (row, col, delta) => { context.data[row][col].pop = (context.data[row][col].pop || 0) + delta; },
    popv2_get_dominant_culture: () => options.culture || 'a',
    regions_taxEff: (_civ, _name, row, col) => typeof options.taxEfficiency === 'function'
      ? options.taxEfficiency(row, col)
      : (options.taxEfficiency == null ? 1 : options.taxEfficiency),
    regions_defBonus: () => options.regionBonus || 1,
    isAtWar: (civ, name) => !!(civ.war && civ.war[name] >= 0),
    isAlliance: (civ, name) => !!(civ.war && civ.war[name] <= -5 && civ.war[name] % 1 === 0)
  });
  load(context, 'data.js');
  context.civs = options.civs || {
    A: civ('#a00', 'a'),
    B: civ('#00a', 'b')
  };
  context.data = options.data || [
    [cell('A', context.types.land), cell('A', context.types.land), cell('B', context.types.land)],
    [cell('A', context.types.land), cell('A', context.types.city), cell('B', context.types.land)],
    [cell('A', context.types.land), cell('A', context.types.land), cell('B', context.types.land)]
  ];
  context.popv2 = {map: context.data.map(line => line.map(tile => tile ?
    {pop: {[options.culture || context.civs[tile.color]?.culture || 'a']: tile.pop || 10000}} : null))};
  context.regions_genCountryParts = function (_civ, name) {
    const map = {};
    let supplyCenter = null;
    for (let row = 0; row < context.data.length; row++) {
      for (let col = 0; col < context.data[row].length; col++) {
        if (context.data[row][col] && context.data[row][col].color === name) {
          map[row + ':' + col] = 0;
          if (!supplyCenter) supplyCenter = [row, col];
        }
      }
    }
    return { map, parts: [{ capital: true }], supplyCenter };
  };
  load(context, 'military/state.js');
  load(context, 'military/recruitment.js');
  load(context, 'military/combat.js');
  load(context, 'military/movement.js');
  context.Military.init({});
  return context;
}

function civ(color, culture) {
  return {
    color,
    fontColor: '#fff',
    culture,
    pop: 100000,
    ii: 0,
    money: 10000,
    income: 1000,
    incomesRA: 1000,
    expense: 0,
    govExp: 0,
    spentOnUrban: 0,
    politic: 100,
    technology: 1,
    happiness: 100,
    rchance: 0,
    military: 0,
    logistics: 0,
    urban: 20,
    war: {},
    gov: { cohesion: 1, mods: {} }
  };
}

function cell(owner, type, pop = 10000) {
  return { color: owner, type, pop };
}

test('legacy serialized types and military cells migrate to current objects', () => {
  const ctx = world();
  const savedMilitary = { futureSetting: { enabled: true } };
  ctx.data[0][0].type = { val: 10, oVal: 20, draw() {} };
  ctx.data[0][1].type = { defend: 25, draw() {}, income() {} };
  ctx.civs.A.ii = 100;

  ctx.Military.init(savedMilitary);
  assert.equal(ctx.Military.migrateLegacyCells(), 1);
  ctx.normalizeCellTypes();

  const division = ctx.Military.getDivisions('A')[0];
  assert.equal(division.manpower, 11000);
  assert.equal(division.maxManpower, 22000);
  assert.equal(ctx.data[0][0].type, ctx.types.land);
  assert.equal(ctx.data[0][1].type, ctx.types.city);
  assert.deepEqual(ctx.military.futureSetting, { enabled: true });
});

test('division army ribbons accept all palette colors and survive saved state', () => {
  const ctx = world();
  const division = ctx.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 1000
  });

  assert.equal(ctx.Military.setDivisionArmy(division.id, 'red').ok, true);
  assert.equal(ctx.Military.getDivision(division.id).armyColor, 'red');
  assert.equal(ctx.Military.setDivisionArmy(division.id, null).ok, true);
  assert.equal(ctx.Military.getDivision(division.id).armyColor, undefined);
  for (const color of Object.keys(ctx.Military.armyColors)) {
    assert.equal(ctx.Military.setDivisionArmy(division.id, color).ok, true);
    ctx.Military.init(JSON.parse(JSON.stringify(ctx.military)));
    assert.equal(ctx.Military.getDivision(division.id).armyColor, color);
  }
  assert.equal(ctx.Military.setDivisionArmy(division.id, 'invalid').ok, false);
});

test('all bundled saves load with canonical building types and migrated divisions', () => {
  const saves = fs.readdirSync(root).filter(file => file.endsWith('.json'));
  saves.forEach(file => {
    const saved = vm.runInNewContext('(' + fs.readFileSync(path.join(root, file), 'utf8') + ')');
    if (!saved.data || !saved.civs) return;
    const ctx = world({ data: saved.data, civs: saved.civs });
    ctx.Military.init(saved.military || {});
    let legacyCount = 0;
    ctx.data.forEach(row => row.forEach(tile => {
      if (tile && tile.type && tile.type.val != null) legacyCount++;
    }));
    assert.equal(ctx.Military.migrateLegacyCells(), legacyCount, file);
    ctx.normalizeCellTypes();
    ctx.data.forEach(row => row.forEach(tile => {
      if (!tile || !tile.type) return;
      assert.equal(tile.type, ctx.types[tile.type.id], file + ' contains a stale serialized type');
    }));
  });
});

test('partition calculation safely represents a civilization with no territory', () => {
  const ctx = world();
  load(ctx, 'regions.js');
  ctx.data.forEach(row => row.forEach(tile => {
    if (tile && tile.color === 'A') tile.color = 'B';
  }));
  delete ctx.civs.A._parts;

  const parts = ctx.regions_genCountryParts(ctx.civs.A, 'A');
  assert.deepEqual(Array.from(parts.parts), []);
  assert.equal(parts.supplyCenter, null);
});

test('recruit queues apply the current training yield and cost upkeep', () => {
  const ctx = world();
  ctx.Math.random = () => 0.5;
  const result = ctx.Military.createRecruitQueue('A', 2000, { name: 'First' });
  assert.equal(result.ok, true);
  assert.equal(ctx.Military.offerGrowth('A', 0, 0, 100).diverted, 50);
  assert.equal(result.queue.manpower, 70);
  assert.equal(ctx.Military.getUpkeep('A'), 70 / 100 / 4);

  const deployed = ctx.Military.deployQueue(result.queue.id);
  assert.equal(deployed.ok, true);
  assert.equal(deployed.division.manpower, 70);
  assert.equal(deployed.division.maxManpower, 2000);
  assert.equal(ctx.Military.getQueues('A').length, 0);
});

test('completed recovery remains visible for one turn instead of being cleared before display', () => {
  const ctx = world();
  ctx.Math.random = () => 0.5;
  const division = ctx.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 2000
  });

  ctx.Military.offerGrowth('A', 0, 0, 100);
  assert.equal(division.recoveredLastTurn, 0);
  assert.equal(division.recoveredThisTurn, 70);

  ctx.Military.beginTurn('A');
  assert.equal(division.recoveredLastTurn, 70);
  assert.equal(division.recoveredThisTurn, 0);

  ctx.Military.beginTurn('A');
  assert.equal(division.recoveredLastTurn, 0);
});

test('local tax efficiency reduces recovery and training success chance', () => {
  const failed = world({ taxEfficiency: 0.25 });
  failed.Math.random = () => 0.5;
  const failedDivision = failed.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 2000
  });
  assert.equal(failed.Military.offerGrowth('A', 0, 0, 100).recovered, 0);
  assert.equal(failedDivision.manpower, 1000);

  const succeeded = world({ taxEfficiency: 0.25 });
  succeeded.Math.random = () => 0.1;
  const recoveredDivision = succeeded.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 2000
  });
  assert.equal(succeeded.Military.offerGrowth('A', 0, 0, 100).recovered, 70);
  assert.equal(recoveredDivision.manpower, 1070);
});

test('small-country recovery can exceed diverted growth and fades toward baseline', () => {
  const small = world();
  small.Math.random = () => 0.5;
  const smallDivision = small.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 2000
  });
  const smallResult = small.Military.offerGrowth('A', 0, 0, 100);

  const large = world();
  large.civs.A.ii = 100;
  large.Math.random = () => 0.4;
  const largeDivision = large.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 2000
  });
  const largeResult = large.Military.offerGrowth('A', 0, 0, 100);

  assert.equal(small.Military.getRecoveryMultiplier('A'), 2);
  assert.equal(smallResult.diverted, 50);
  assert.equal(smallResult.recovered, 70);
  assert.ok(smallResult.recovered > smallResult.diverted);
  assert.ok(large.Military.getRecoveryMultiplier('A') < 1.1);
  assert.ok(largeResult.recovered < smallResult.recovered);
  assert.equal(smallDivision.manpower, 1070);
  assert.ok(largeDivision.manpower > 1035 && largeDivision.manpower < 1040);
});

test('recovery chance declines below baseline as country size grows', () => {
  const small = world();
  small.civs.A.ii = 50;
  small.Math.random = () => 0.7;
  const smallDivision = small.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 2000
  });

  const large = world();
  large.civs.A.ii = 100;
  large.Math.random = () => 0.7;
  const largeDivision = large.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 2000
  });

  const largeTraining = world();
  largeTraining.civs.A.ii = 100;
  largeTraining.Math.random = () => 0.5;
  const queue = largeTraining.Military.createRecruitQueue('A', 2000).queue;
  largeTraining.Military.offerGrowth('A', 0, 0, 100);

  assert.equal(small.Military.getRecoveryChance('A', 0, 0), 0.75);
  assert.ok(large.Military.getRecoveryChance('A', 0, 0) < 0.75);
  const smallRecovery = small.Military.offerGrowth('A', 0, 0, 100).recovered;
  assert.ok(Math.abs(smallRecovery - 50 * (1 + 1 / 6) * 0.7) < 1e-12);
  assert.equal(large.Military.offerGrowth('A', 0, 0, 100).recovered, 0);
  assert.ok(Math.abs(smallDivision.manpower - (1000 + smallRecovery)) < 1e-12);
  assert.equal(largeDivision.manpower, 1000);
  assert.equal(queue.manpower, 70);
});

test('casualty reports combine the last completed turn with current actions', () => {
  const ctx = world();
  ctx.Military.recordCasualties('A', 10, 20);
  ctx.Military.beginTurn('A');
  ctx.Military.recordCasualties('A', 3, 4);

  const report = ctx.Military.getCasualtyReport('A');
  assert.equal(report.suffered, 13);
  assert.equal(report.inflicted, 24);
  assert.equal(report.sufferedLastTurn, 10);
  assert.equal(report.inflictedLastTurn, 20);
  assert.equal(report.sufferedThisTurn, 3);
  assert.equal(report.inflictedThisTurn, 4);

  ctx.Military.beginTurn('A');
  assert.equal(ctx.Military.getCasualtyReport('A').suffered, 3);
  assert.equal(ctx.Military.getCasualtyReport('A').inflicted, 4);
});

test('conscription uses the country conversion and cannot exceed ten percent per turn', () => {
  const ctx = world();
  const result = ctx.Military.conscript('A', 0, 0, 20000, { name: 'Levy' });
  assert.equal(result.ok, true);
  assert.equal(result.manpower, 10000);
  assert.equal(result.cost, 200);
  assert.equal(ctx.civs.A.nextDecline, 10000);
  assert.equal(ctx.Military.conscript('A', 0, 0, 1000, { name: 'Second' }).ok, false);
  ctx.Military.beginTurn('A');
  assert.equal(ctx.civs.A.conscriptedThisTurn, 0);
});

test('deployed reinforcements join with 0.5 experience', () => {
  const ctx = world();
  ctx.Math.random = () => 0.5;
  const division = ctx.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 2000, experience: 1.2
  });

  ctx.Military.offerGrowth('A', 0, 0, 100);

  const gained = 70;
  assert.equal(division.manpower, 1000 + gained);
  assert.equal(division.experience, (1000 * 1.2 + gained * 0.5) / (1000 + gained));
});

test('pooled upkeep includes queues and applies fixed desertion when underfunded', () => {
  const ctx = world();
  ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 10000, maxManpower: 10000 });
  const queue = ctx.Military._addQueue({ civ: 'A', row: 0, col: 0, manpower: 5000, maxManpower: 10000 });
  const needed = ctx.Military.getUpkeep('A');
  ctx.civs.A.money = needed / 2;
  const result = ctx.Military.processUpkeep('A');

  assert.equal(result.fundedRatio, 0.5);
  assert.equal(result.deserted, 2000);
  assert.equal(queue.manpower, 4000);
  assert.equal(ctx.civs.A.nextDecline, -2000);
});

test('upkeep is calculated per formation from its local tax efficiency', () => {
  const ctx = world({ taxEfficiency: (_row, col) => col === 0 ? 1 : 0.25 });
  const capital = ctx.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 1000
  });
  const frontier = ctx.Military._addDivision({
    civ: 'A', row: 0, col: 1, manpower: 1000, maxManpower: 1000
  });
  const queue = ctx.Military._addQueue({
    civ: 'A', row: 1, col: 1, manpower: 500, maxManpower: 1000
  });

  assert.equal(ctx.Military.getFormationUpkeep(capital), 2.5);
  assert.equal(ctx.Military.getFormationUpkeep(frontier), 10);
  assert.equal(ctx.Military.getFormationUpkeep(queue), 5);
  assert.equal(ctx.Military.getUpkeep('A'), 17.5);
  assert.equal(ctx.Military.getDivisionStats(frontier).upkeep, 10);
});

test('upkeep scales quadratically above 550000 total active and queued manpower', () => {
  const ctx = world();
  const division = ctx.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 550000, maxManpower: 550000
  });
  assert.equal(ctx.Military.getUpkeepScale('A'), 1);
  assert.equal(ctx.Military.getUpkeep('A'), 1375);

  const queue = ctx.Military._addQueue({
    civ: 'A', row: 0, col: 0, manpower: 550000, maxManpower: 550000
  });
  assert.equal(ctx.Military.getUpkeepScale('A'), 4);
  assert.equal(ctx.Military.getFormationUpkeep(division), 5500);
  assert.equal(ctx.Military.getFormationUpkeep(queue), 5500);
  assert.equal(ctx.Military.getUpkeep('A'), 11000);
});

test('friendly path movement stops each division at its closest reachable point for free', () => {
  const ctx = world();
  const first = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000, maxManpower: 5000, movesRemaining: 5 });
  const second = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000, maxManpower: 5000, movesRemaining: 1 });
  const money = ctx.civs.A.money;
  const politic = ctx.civs.A.politic;
  const result = ctx.Military.moveDivisions([first.id, second.id], 2, 1, { human: true, partial: true });

  assert.deepEqual(Array.from(result.moved), [first.id, second.id]);
  assert.deepEqual(Array.from(result.skipped), []);
  assert.equal(first.row, 2);
  assert.equal(first.col, 1);
  assert.equal(second.row, 1);
  assert.equal(second.col, 0);
  assert.equal(second.movesRemaining, 0);
  assert.equal(ctx.civs.A.money, money);
  assert.equal(ctx.civs.A.politic, politic);
});

test('friendly path movement leaves only fully exhausted divisions behind', () => {
  const ctx = world();
  const division = ctx.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 5000, maxManpower: 5000, movesRemaining: 0
  });
  const result = ctx.Military.moveDivisions([division.id], 2, 1);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'out-of-range');
  assert.deepEqual(Array.from(result.skipped), [division.id]);
  assert.equal(division.row, 0);
  assert.equal(division.col, 0);
});

test('hostile stack attack is charged once and cannot annihilate a weak attacker', () => {
  const ctx = world();
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  ctx.civs.A.gov.mods.OMVPC = 0.25;
  ctx.civs.A.gov.mods.MMVCT = -0.2;
  const attacker = ctx.Military._addDivision({ civ: 'A', row: 1, col: 1, manpower: 500, maxManpower: 500 });
  const secondAttacker = ctx.Military._addDivision({ civ: 'A', row: 1, col: 1, manpower: 500, maxManpower: 500 });
  ctx.Military._addDivision({ civ: 'B', row: 1, col: 2, manpower: 100000, maxManpower: 100000 });
  const result = ctx.Military.attack([attacker.id, secondAttacker.id], 1, 2, { human: true });

  assert.equal(result.ok, true);
  assert.ok(result.attackerRemaining >= 1);
  assert.ok(result.defenderLosses <= 1000);
  assert.equal(result.cost.politic, 0.875);
  assert.equal(result.cost.money, 2);
  assert.equal(ctx.civs.A.politic, 99.125);
});

test('recapture, regional, culture, country scale, and government modifiers retain their effects', () => {
  const ctx = world({ regionBonus: 4 });
  ctx.civs.A.ii = 100;
  ctx.civs.A.gov.mods.MCCCT = 0.5;
  ctx.civs.A.gov.mods.MUKCT = -0.2;
  const division = ctx.Military._addDivision({ civ: 'A', row: 1, col: 1, manpower: 4400, maxManpower: 4400 });

  const hostile = ctx.Military.getPowerBreakdown([division], 1, 2, false).power;
  ctx.data[1][2]._oldcolor = 'A';
  const recapture = ctx.Military.getPowerBreakdown([division], 1, 2, false).power;
  const defense = ctx.Military.getPowerBreakdown([division], 1, 1, true);

  assert.ok(Math.abs(recapture / hostile - 2) < 1e-12);
  assert.equal(defense.location, 2.5);
  assert.ok(defense.civ.technology > 1);
  assert.ok(Math.abs(ctx.Military.getUpkeep('A') - 0.8) < 1e-12);
  assert.ok(Math.abs(ctx.Military.legacyEquivalent('A', 4400) - 4) < 1e-12);
});

test('retreating defenders disperse to least-filled tiles and may destroy their building', () => {
  const data = [[null, null, null], [null, null, null], [null, null, null]];
  const ctx = world({ data });
  ctx.data = [
    [null, cell('B', ctx.types.land), null],
    [cell('B', ctx.types.land), cell('B', ctx.types.city), cell('B', ctx.types.land)],
    [null, cell('A', ctx.types.land), null]
  ];
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  ctx.Math.random = () => 0.5;
  const attacker = ctx.Military._addDivision({ civ: 'A', row: 2, col: 1, manpower: 200000, maxManpower: 200000 });
  for (let n = 0; n < 3; n++) {
    ctx.Military._addDivision({ civ: 'B', row: 1, col: 1, manpower: 20000, maxManpower: 20000 });
  }
  const before = {
    attack: ctx.Military.getPowerBreakdown([attacker], 1, 1, false),
    defense: ctx.Military.getPowerBreakdown(ctx.Military.getDivisionsAt(1, 1, 'B'), 1, 1, true)
  };
  const result = ctx.Military.attack([attacker.id], 1, 1, { ignoreCost: true });

  assert.equal(result.retreated.defender, true, JSON.stringify({ before, result }));
  assert.equal(ctx.data[1][1].type, ctx.types.land);
  assert.deepEqual([
    ctx.Military.getDivisionsAt(0, 1, 'B').length,
    ctx.Military.getDivisionsAt(1, 0, 'B').length,
    ctx.Military.getDivisionsAt(1, 2, 'B').length
  ], [1, 1, 1]);
  ctx.Military.beginTurn('B');
  ctx.Military.getDivisions('B').forEach(division => assert.equal(division.moveLimit, 4));
});

test('retreat can preserve a defended building and an empty building has no inherent army', () => {
  const ctx = world();
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  ctx.Math.random = () => 0.9;
  const attacker = ctx.Military._addDivision({ civ: 'A', row: 1, col: 1, manpower: 200000, maxManpower: 200000 });
  ctx.data[1][2].type = ctx.types.fort;
  ctx.Military._addDivision({ civ: 'B', row: 1, col: 2, manpower: 1000, maxManpower: 1000, morale: 0.1 });

  const result = ctx.Military.attack([attacker.id], 1, 2, { ignoreCost: true });
  assert.equal(result.retreated.defender, true);
  assert.equal(ctx.data[1][2].type, ctx.types.fort);

  const next = ctx.Military._addDivision({ civ: 'A', row: 2, col: 1, manpower: 1000, maxManpower: 1000 });
  ctx.data[2][2].type = ctx.types.city;
  const walkIn = ctx.Military.attack([next.id], 2, 2, { ignoreCost: true });
  assert.equal(walkIn.attackerLosses, 0);
  assert.equal(walkIn.captured, true);
  assert.equal(ctx.data[2][2].type, ctx.types.city);
});

test('building defense and government combat modifiers affect division statistics', () => {
  const ctx = world();
  const division = ctx.Military._addDivision({ civ: 'A', row: 1, col: 1, manpower: 10000, maxManpower: 10000 });
  const before = ctx.Military.getDivisionStats(division.id);
  assert.equal(before.buildingBonus, 1.25);
  assert.ok(before.defense > before.attack);
  ctx.civs.A.gov.mods.MCCCT = 0.5;
  const after = ctx.Military.getDivisionStats(division.id);
  assert.ok(after.attack > before.attack);
});

test('undefended forts and headquarters inflict entry attrition', () => {
  const ctx = world();
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  ctx.Math.random = () => 0.9;
  ctx.data[1][2].type = ctx.types.fort;
  const attacker = ctx.Military._addDivision({
    civ: 'A', row: 1, col: 1, manpower: 10000, maxManpower: 10000
  });

  const fortResult = ctx.Military.attack([attacker.id], 1, 2, { ignoreCost: true });
  assert.ok(fortResult.attrition.building > 0);
  assert.equal(fortResult.attrition.culture, 0);
  assert.ok(fortResult.attritionLosses > 0);

  ctx.data[0][2].type = ctx.types.headquarter;
  assert.ok(ctx.Military.getAttackAttrition('A', 0, 2, false).building > 0);
  assert.equal(ctx.Military.getAttackAttrition('A', 0, 2, true).building, 0);
});

test('foreign-culture cells inflict attrition on invaders', () => {
  const ctx = world({ culture: 'b' });
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  ctx.Math.random = () => 0.9;
  const attacker = ctx.Military._addDivision({
    civ: 'A', row: 1, col: 1, manpower: 10000, maxManpower: 10000
  });

  const result = ctx.Military.attack([attacker.id], 1, 2, { ignoreCost: true });
  assert.equal(result.attrition.culture, 0.025);
  assert.equal(result.attrition.building, 0);
  assert.equal(result.attritionLosses, 250);
  assert.equal(ctx.Military.getCasualtyReport('A').sufferedThisTurn, result.attackerCasualties);
  assert.equal(ctx.Military.getCasualtyReport('B').inflictedThisTurn, result.attackerCasualties);
});

test('shared AI derives force size and switches military policy for peace and war', () => {
  const ctx = world();
  ctx.civs.A.ii = 10;
  ctx.civs.A.pop = 1000000;
  load(ctx, 'military/ai.js');
  const peace = ctx.MilitaryAI.think(ctx.civs.A, 'A');
  assert.equal(ctx.Military.getSettings('A').growthShare, 0.5);
  assert.equal(ctx.Military.getSettings('A').maxUpkeepShare, 0.5);
  assert.ok(peace.targetManpower >= 1000);
  assert.ok(ctx.Military.getQueues('A').length > 0);

  ctx.turn++;
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  ctx.MilitaryAI.think(ctx.civs.A, 'A');
  assert.equal(ctx.Military.getSettings('A').growthShare, 1);
  assert.equal(ctx.Military.getSettings('A').maxUpkeepShare, 0.75);
});

test('AI peacetime strength responds to neighbor size and expiring diplomacy', () => {
  const ctx = world();
  ctx.civs.A.ii = 20;
  ctx.civs.A.pop = 2000000;
  ctx.civs.A.income = ctx.civs.A.incomesRA = 125;
  ctx.civs.B.ii = 20;
  ctx.civs.B.pop = 2000000;
  ctx.civs.B.income = ctx.civs.B.incomesRA = 125;
  load(ctx, 'military/ai.js');

  const neutral = ctx.MilitaryAI.plan(ctx.civs.A, 'A').targetManpower;
  ctx.civs.A.war.B = -50;
  const longAlliance = ctx.MilitaryAI.plan(ctx.civs.A, 'A').targetManpower;
  ctx.civs.A.war.B = -6;
  const expiringAlliance = ctx.MilitaryAI.plan(ctx.civs.A, 'A').targetManpower;
  ctx.civs.A.war.B = -50.5;
  const longPact = ctx.MilitaryAI.plan(ctx.civs.A, 'A').targetManpower;
  ctx.civs.A.war.B = -6.5;
  const expiringPact = ctx.MilitaryAI.plan(ctx.civs.A, 'A').targetManpower;

  assert.ok(neutral > 9000);
  assert.ok(expiringAlliance > longAlliance);
  assert.ok(expiringPact > longPact);
});

test('persistent orders resume exhausted divisions, survive saves, and finish in later turns', () => {
  const ctx = world();
  ctx.data = [Array.from({ length: 13 }, () => cell('A', ctx.types.land))];
  const fast = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000 });
  const slow = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000, movesRemaining: 0 });
  assert.equal(ctx.Military.orderDivisions([fast.id, slow.id], 0, 12).ok, true);
  assert.equal(fast.col, 5);
  assert.equal(slow.col, 0);
  ctx.Military.init(JSON.parse(JSON.stringify(ctx.military)));
  ctx.Military.beginTurn('B');
  assert.equal(ctx.Military.getDivision(fast.id).col, 5);
  ctx.Military.beginTurn('A');
  assert.equal(ctx.Military.getDivision(fast.id).col, 10);
  assert.equal(ctx.Military.getDivision(slow.id).col, 5);
  ctx.Military.beginTurn('A');
  assert.equal(ctx.Military.getDivision(fast.id).col, 12);
  assert.equal(ctx.Military.getDivision(fast.id).moveTargets.length, 0);
  assert.equal(ctx.Military.getDivision(slow.id).col, 10);
});

test('orders append waypoints, replace routes, and cancel at current or queued locations', () => {
  const ctx = world();
  const unit = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000, movesRemaining: 0 });
  ctx.Military.orderDivisions([unit.id], 2, 0);
  ctx.Military.orderDivisions([unit.id], 2, 1, { append: true });
  assert.equal(unit.moveTargets.length, 2);
  ctx.Military.beginTurn('A');
  assert.deepEqual([unit.row, unit.col, unit.movesRemaining], [2, 1, 2]);
  assert.equal(unit.moveTargets.length, 0);
  unit.movesRemaining = 0;
  ctx.Military.orderDivisions([unit.id], 0, 0);
  ctx.Military.orderDivisions([unit.id], 0, 1);
  assert.equal(unit.moveTargets.length, 1);
  assert.equal(unit.moveTargets[0][1], 1);
  ctx.Military.orderDivisions([unit.id], 0, 1);
  assert.equal(unit.moveTargets.length, 0);
  ctx.Military.orderDivisions([unit.id], 0, 0);
  ctx.Military.orderDivisions([unit.id], 2, 1);
  ctx.Military.beginTurn('A');
  assert.deepEqual([unit.row, unit.col], [2, 1]);
});

test('enemy waypoints require a connected frontier and execute sequential captures', () => {
  const ctx = world();
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  ctx.data = [['A', 'A', 'B', 'B', 'B'].map(owner => cell(owner, ctx.types.land))];
  const unit = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000, movesRemaining: 0 });
  assert.equal(ctx.Military.orderDivisions([unit.id], 0, 3).ok, false);
  assert.equal(ctx.Military.orderDivisions([unit.id], 0, 2).ok, true);
  assert.equal(ctx.Military.orderDivisions([unit.id], 0, 4, { append: true }).ok, false);
  assert.equal(unit.moveTargets.length, 1);
  assert.equal(ctx.Military.orderDivisions([unit.id], 0, 3, { append: true }).ok, true);
  assert.equal(ctx.Military.orderDivisions([unit.id], 0, 4, { append: true }).ok, true);
  ctx.Military.beginTurn('A');
  assert.equal(unit.col, 4);
  assert.equal(unit.movesRemaining, 1);
  assert.equal(unit.moveTargets.length, 0);
  assert.ok(ctx.data[0].every(tile => tile.color === 'A'));
});

test('queued attacks approach through friendly territory and charge a stack once', () => {
  const ctx = world();
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  const units = [0, 1].map(() => ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000 }));
  ctx.Military.orderDivisions(units.map(unit => unit.id), 0, 2);
  assert.ok(units.every(unit => unit.col === 2 && unit.movesRemaining === 3));
  assert.equal(ctx.civs.A.politic, 99.3);
});

test('blocked routes wait without entering neutral territory and resume when access returns', () => {
  const ctx = world();
  ctx.data = [Array.from({ length: 4 }, () => cell('A', ctx.types.land))];
  const unit = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000, movesRemaining: 0 });
  ctx.Military.orderDivisions([unit.id], 0, 3);
  ctx.data[0][1].color = 'B';
  ctx.Military.beginTurn('A');
  assert.equal(unit.col, 0);
  assert.equal(unit.moveTargets.length, 1);
  ctx.data[0][1].color = 'A';
  ctx.Military.beginTurn('A');
  assert.equal(unit.col, 3);
  assert.equal(unit.moveTargets.length, 0);
});

test('queued attacks wait for political power and retain unsuccessful battle targets', () => {
  const ctx = world();
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  ctx.civs.A.politic = 0;
  const unit = ctx.Military._addDivision({ civ: 'A', row: 0, col: 1, manpower: 5000 });
  ctx.Military.orderDivisions([unit.id], 0, 2);
  assert.equal(unit.movesRemaining, 5);
  assert.equal(unit.moveTargets.length, 1);
  let battles = 0;
  ctx.Military.resolveBattle = () => { battles++; return { ok: true, captured: false }; };
  ctx.civs.A.politic = 100;
  ctx.Military.beginTurn('A');
  assert.equal(battles, 1);
  assert.equal(unit.movesRemaining, 4);
  assert.equal(unit.moveTargets.length, 1);
});

test('right-click keeps units selected, passes Alt waypoints, draws arrows, and never opens showInfo', () => {
  const ctx = world();
  const element = () => ({
    children: [], insertBefore() {}, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {}, replaceChildren() {}, addEventListener() {}, setAttribute() {}, querySelector() { return null; }
  });
  ctx.document = { createElement: element, body: element(), addEventListener() {}, getElementById() { return null; } };
  ctx.window = ctx;
  ctx.showInfo = () => assert.fail('Attack must not open showInfo');
  load(ctx, 'military/ui.js');
  ctx.MilitaryUI.init({ military: ctx.Military, getActiveCiv: () => 'A', notify: message => assert.fail(message) });
  ctx.civs.A.war.B = 4;
  ctx.civs.B.war.A = 4;
  const unit = ctx.Military._addDivision({ civ: 'A', row: 0, col: 1, manpower: 5000 });
  ctx.Military._addDivision({ civ: 'B', row: 0, col: 2, manpower: 500 });
  ctx.MilitaryUI.selectTile(0, 1);
  ctx.MilitaryUI.onTileRightClick(0, 2);
  assert.deepEqual(Array.from(ctx.MilitaryUI.getSelection()), [unit.id]);
  unit.movesRemaining = 0;
  ctx.MilitaryUI.onTileRightClick(1, 2);
  ctx.MilitaryUI.onTileRightClick(2, 2, { altKey: true });
  assert.equal(unit.moveTargets.length, 2);
  let lines = 0;
  const canvas = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() { lines++; },
    stroke() {}, closePath() {}, fill() {}, fillText() {}, strokeRect() {} };
  ctx.MilitaryUI.setUnitMarkersVisible(false);
  ctx.MilitaryUI.drawOverlay(canvas, 20);
  assert.equal(lines, 6);
  ctx.MilitaryUI.onTileRightClick(1, 2);
  assert.equal(unit.moveTargets.length, 0);
  const other = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000 });
  ctx.MilitaryUI.selectTile(0, 0, { shiftKey: true });
  assert.deepEqual(Array.from(ctx.MilitaryUI.getSelection()), [unit.id, other.id]);
  ctx.MilitaryUI.selectTile(0, 0, { shiftKey: true });
  assert.equal(ctx.MilitaryUI.getSelection().length, 2);
  ctx.MilitaryUI.selectTile(1, 2, { shiftKey: true });
  assert.deepEqual(Array.from(ctx.MilitaryUI.getSelection()), [unit.id, other.id]);
  let selectedTiles = 0;
  canvas.strokeRect = () => selectedTiles++;
  ctx.MilitaryUI.drawOverlay(canvas, 20);
  assert.equal(selectedTiles, 2);
  ctx.MilitaryUI.selectTile(0, 0);
  assert.deepEqual(Array.from(ctx.MilitaryUI.getSelection()), [other.id]);

});


test('an initial Alt order waits through added waypoints and save/load until the next owner turn', () => {
  const ctx = world();
  const unit = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000 });
  ctx.Military.orderDivisions([unit.id], 2, 0, { append: true });
  ctx.Military.orderDivisions([unit.id], 2, 1, { append: true });
  assert.deepEqual([unit.row, unit.col, unit.movesRemaining], [0, 0, 5]);
  ctx.Military.init(JSON.parse(JSON.stringify(ctx.military)));
  ctx.Military.beginTurn('B');
  assert.equal(ctx.Military.getDivision(unit.id).row, 0);
  ctx.Military.beginTurn('A');
  const restored = ctx.Military.getDivision(unit.id);
  assert.deepEqual([restored.row, restored.col, restored.movesRemaining], [2, 1, 2]);
  assert.equal(restored.moveTargets.length, 0);
});

test('replacing an Alt-deferred plan with an ordinary order moves immediately', () => {
  const ctx = world();
  const unit = ctx.Military._addDivision({ civ: 'A', row: 0, col: 0, manpower: 5000 });
  ctx.Military.orderDivisions([unit.id], 2, 0, { append: true });
  ctx.Military.orderDivisions([unit.id], 2, 1);
  assert.deepEqual([unit.row, unit.col, unit.movesRemaining], [2, 1, 2]);
  assert.equal(unit.movePlanWaiting, undefined);
});

// Heavy equipment regressions exercise economics and combat through public APIs.
test('heavy resources use strict terrain thresholds and ruling-culture population share', () => {
  const ctx = world();
  ctx.res_pop_mod = () => 0.08;
  ctx.res_econ_mod = () => 2;
  assert.equal(ctx.Military.getHeavyResource(0, 0).output, 10);
  ctx.res_pop_mod = () => 0.4;
  assert.equal(ctx.Military.getHeavyResource(0, 0).potential, 0);
  ctx.res_pop_mod = () => 0.29;
  ctx.res_econ_mod = () => 0.8;
  assert.equal(ctx.Military.getHeavyResource(0, 0).potential, 0);
  ctx.res_econ_mod = () => 1.01;
  assert.ok(ctx.Military.getHeavyResource(0, 0).output >= 2);
  ctx.popv2.map[0][0].pop = {};
  assert.equal(ctx.Military.getHeavyResource(0, 0).output, 0);
  assert.ok(ctx.Military.getHeavyResource(0, 0).potential > 0);
  ctx.popv2.map[0][0].pop = {b:1000};
  assert.equal(ctx.Military.getHeavyResource(0, 0).output, 0);
  ctx.data[0][0].color = null;
  assert.equal(ctx.Military.getHeavyResource(0, 0).reason, 'Unowned');
});

test('factory funding controls cost and output, preserves free production, and runs once per turn', () => {
  const ctx = world();
  ctx.res_pop_mod = () => 0.08; ctx.res_econ_mod = () => 2;
  ctx.data[0][0].type = ctx.types.factory;
  ctx.civs.A.money = 1000;
  ctx.Military.setFactoryProductionShare('A', 0.5);
  const first = ctx.Military.processEquipment('A');
  assert.equal(first.free, 60);
  assert.equal(first.factory, 5);
  assert.equal(first.paid, ctx.Military.getFactoryCosts('A').upkeep * 0.5);
  assert.equal(ctx.Military.getEquipmentStock('A'), 65);
  const money = ctx.civs.A.money;
  assert.equal(ctx.Military.processEquipment('A').duplicate, true);
  assert.equal(ctx.civs.A.money, money);
  ctx.turn++;
  ctx.Military.setFactoryProductionShare('A', 0);
  const paused = ctx.Military.processEquipment('A');
  assert.equal(paused.factory, 0); assert.equal(paused.free, 60); assert.equal(paused.paid, 0);
  ctx.turn++; ctx.civs.A.money = 1; ctx.Military.setFactoryProductionShare('A', 1);
  const partial = ctx.Military.processEquipment('A');
  assert.equal(partial.paid, 1); assert.equal(ctx.civs.A.money, 0);
  assert.ok(partial.factory > 0 && partial.factory < 10);
});

test('factory prices scale with actual territory and placement preserves tile data', () => {
  const ctx = world(); ctx.civs.A.money = 100000;
  const small = ctx.Military.getFactoryCosts('A');
  const tile = ctx.data[0][0]; tile.custom = 12;
  assert.equal(ctx.Military.buildFactory('A', 0, 0).ok, true);
  assert.equal(tile.custom, 12); assert.equal(tile.type.id, 'factory');
  assert.equal(ctx.Military.buildFactory('A', 0, 0).ok, false);
  assert.equal(ctx.Military.buildFactory('A', 0, 2).ok, false);
  ctx.data[0][2].color = 'A';
  assert.ok(ctx.Military.getFactoryCosts('A').construction > small.construction);
  ctx.civs.A.money = 0;
  assert.equal(ctx.Military.buildFactory('A', 0, 1).reason, 'money');
});

test('supplied equipment requests share stock, obey refill limits, and return or lose equipment correctly', () => {
  const ctx = world();
  const a = ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:1000,maxHeavyEquipment:10});
  const b = ctx.Military._addDivision({civ:'A',row:0,col:1,manpower:1000,maxHeavyEquipment:10});
  ctx.civs.A.heavyEquipmentStock = 3;
  ctx.Military.refillEquipment('A');
  assert.equal(a.heavyEquipment, 1.5); assert.equal(b.heavyEquipment, 1.5);
  ctx.civs.A.heavyEquipmentStock = 100;
  ctx.Military.refillEquipment('A'); assert.equal(a.heavyEquipment, 4);
  ctx.Military.setEquipmentCap(a, 1);
  assert.equal(a.heavyEquipment, 1); assert.equal(ctx.Military.getEquipmentStock('A'), 98);
  ctx.data[0][1].color = 'B';
  ctx.Military.setEquipmentCap(b, 0);
  assert.equal(ctx.Military.getEquipmentStock('A'), 98);
  ctx.Military.setEquipmentCap(b, 10);
  ctx.Military.refillEquipment('A'); assert.equal(b.heavyEquipment, 0);
  ctx.Military.loseEquipment(a, 500); assert.equal(a.heavyEquipment, 0.5);
  ctx.Military.disbandDivision(a.id); assert.equal(ctx.Military.getEquipmentStock('A'), 98.5);
});

test('equipment survives queue deployment and saves, and scales upkeep and hardness', () => {
  const ctx = world();
  const q = ctx.Military.createRecruitQueue('A', 1000, {maxHeavyEquipment:100}).queue;
  assert.equal(q.maxHeavyEquipment, 10); q.manpower = 1000;
  const baseline = ctx.Military.getFormationUpkeep(q);
  q.heavyEquipment = 10;
  assert.equal(ctx.Military.getFormationUpkeep(q), baseline * 1.5);
  const d = ctx.Military.deployQueue(q.id).division;
  assert.equal(d.heavyEquipment, 10); assert.equal(ctx.Military.getHardness(d), 1);
  ctx.Military.init(JSON.parse(JSON.stringify(ctx.military)));
  assert.equal(ctx.Military.getDivision(d.id).heavyEquipment, 10);
  ctx.Military.getDivision(d.id).heavyEquipment = NaN;
  ctx.Military.init(ctx.military); assert.equal(ctx.Military.getDivision(d.id).heavyEquipment, 0);
});

test('hardness has symmetric bounded casualty effects and manpower-weighted mixed stacks', () => {
  const ctx = world();
  const hard = ctx.Military._addDivision({civ:'A',row:0,col:1,manpower:1000,maxHeavyEquipment:10,heavyEquipment:10});
  const soft = ctx.Military._addDivision({civ:'B',row:0,col:2,manpower:1000});
  let match = ctx.Military.getEquipmentMatchup([hard], [soft]);
  assert.equal(match.attackerLossMultiplier, 0.5); assert.equal(match.defenderLossMultiplier, 1.5);
  match = ctx.Military.getEquipmentMatchup([soft], [hard]);
  assert.equal(match.attackerLossMultiplier, 1.5); assert.equal(match.defenderLossMultiplier, 0.5);
  assert.equal(ctx.Military.getEquipmentMatchup([hard], [hard]).attackerLossMultiplier, 1);
  const other = ctx.Military._addDivision({civ:'A',row:0,col:1,manpower:9000});
  assert.equal(ctx.Military.getEquipmentMatchup([hard, other], [soft]).attackerHardness, 0.1);
  const result = ctx.Military.resolveBattle([hard], 0, 2);
  assert.equal(result.equipmentMatchup.defenderLossMultiplier, 1.5);
  assert.ok(result.defenderLosses <= 1000);
  assert.ok(Math.abs(hard.heavyEquipment - hard.manpower / 100) < 1e-9);
});

test('factory balance is affordable at 100 tiles and steep at 700 tiles', () => {
  const ctx = world();
  ctx.data = [Array.from({length:100}, () => cell('A',ctx.types.land))];
  assert.equal(ctx.Military.getFactoryCosts('A').construction, 312.5);
  assert.equal(ctx.Military.getFactoryCosts('A').upkeep, 4);
  ctx.data = [Array.from({length:700}, () => cell('A',ctx.types.land))];
  assert.equal(ctx.Military.getFactoryCosts('A').construction, 3312.5);
  assert.equal(ctx.Military.getFactoryCosts('A').upkeep, 100);
});

test('factory spending reserves refill upkeep and ownership changes transfer production', () => {
  const ctx = world();
  ctx.data[0][0].type = ctx.types.factory;
  const d = ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:1000,maxHeavyEquipment:10});
  ctx.civs.A.heavyEquipmentStock = 10;
  ctx.civs.A.money = ctx.Military.getUpkeep('A') * 1.125;
  assert.equal(ctx.Military.processEquipment('A').paid, 0);
  assert.equal(d.heavyEquipment, 2.5);
  assert.equal(ctx.Military.processUpkeep('A').fundedRatio, 1);
  ctx.data[0][0].color = 'B';
  assert.equal(ctx.Military.getEquipmentProduction('A').factories.length, 0);
  assert.equal(ctx.Military.getEquipmentProduction('B').factories.length, 1);
});

test('shared AI equips elites, funds and builds factories, and pauses excess production', () => {
  const ctx = world(); load(ctx,'military/ai.js'); ctx.civs.A.ii = 6;
  ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:10000,maxManpower:10000,experience:2});
  ctx.MilitaryAI.think(ctx.civs.A,'A');
  assert.ok(ctx.Military.getDivisions('A').some(d => d.maxHeavyEquipment > 0));
  assert.equal(ctx.Military.getEquipmentProduction('A').factories.length,1);
  assert.ok(ctx.Military.getSettings('A').factoryProductionShare > 0);
  ctx.turn++;
  ctx.civs.A.heavyEquipmentStock = 100000;
  ctx.MilitaryAI.think(ctx.civs.A,'A');
  assert.equal(ctx.Military.getSettings('A').factoryProductionShare,0);
});

test('a 700-tile AI with $2000 income and $5000 cash can build and fund a factory', () => {
  const ctx = world(); load(ctx,'military/ai.js');
  ctx.data = [Array.from({length:700}, () => cell('A',ctx.types.land))];
  Object.assign(ctx.civs.A,{ii:700,pop:10000000,income:2000,incomesRA:2000,money:5000});
  ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:500000,maxManpower:500000,experience:2});
  ctx.MilitaryAI.think(ctx.civs.A,'A');
  assert.equal(ctx.Military.getEquipmentProduction('A').factories.length,1);
  assert.ok(ctx.Military.getSettings('A').factoryProductionShare > 0);
  assert.ok(ctx.civs.A.money >= ctx.Military.getUpkeep('A'));
});

test('C3 resource production and twenty-turn accumulation match the actual terrain and culture', () => {
  const saved = vm.runInNewContext('(' + fs.readFileSync(path.join(root,'chunQiuMod.C3.json'),'utf8') + ')');
  const ctx = world({data:saved.data,civs:saved.civs});
  ctx.popv2=saved.popv2;
  load(ctx,'map.js'); load(ctx,'resources.js');
  ctx.popv2_get_dominant_culture=(row,col)=>{
    const populations=ctx.popv2.map[row]?.[col]?.pop||{};
    return Object.entries(populations).sort((a,b)=>b[1]-a[1])[0]?.[0];
  };
  const eligible=[];
  ctx.data.forEach((line,row)=>line.forEach((tile,col)=>{
    const r=ctx.Military.getHeavyResource(row,col);
    if(r.output)eligible.push({owner:tile.color,output:r.output});
  }));
  assert.equal(eligible.length,1); assert.equal(eligible[0].owner,'Brown');
  assert.ok(eligible[0].output>2.18&&eligible[0].output<2.19);
  for(let n=0;n<20;n++){ctx.turn++;ctx.Military.processEquipment('Brown');}
  assert.ok(Math.abs(ctx.Military.getEquipmentStock('Brown')-eligible[0].output*20)<1e-8);
});

test('rhombus markers and heavy unit classification require strictly more than 50% hardness', () => {
  const ctx=world();
  const element=()=>({children:[],style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},
    appendChild(){},replaceChildren(){},addEventListener(){},setAttribute(){},querySelector(){return null;}});
  ctx.document={createElement:element,body:element(),addEventListener(){}};ctx.window=ctx;
  load(ctx,'military/ui.js');
  ctx.MilitaryUI.init({military:ctx.Military,getActiveCiv:()=> 'A'});
  const d=ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:1000,maxHeavyEquipment:10,heavyEquipment:1});
  let rectangles=0,edges=0;
  const canvas={save(){},restore(){},beginPath(){},closePath(){},moveTo(){},lineTo(){edges++;},
    fill(){},stroke(){},fillRect(){rectangles++;},strokeRect(){},fillText(){},strokeText(){}};
  for (const equipment of [0, 1, 5, 5.01, 10, 5, 0]) {
    d.heavyEquipment=equipment;rectangles=0;edges=0;
    const heavy=equipment>5;
    ctx.MilitaryUI.drawOverlay(canvas,20);
    assert.equal(ctx.Military.isHeavyUnit(d),heavy);
    assert.equal(ctx.Military.getDivisionStats(d).unitType,heavy?'Heavy':'Light');
    assert.equal(rectangles,heavy?0:1);
    assert.equal(edges,heavy?3:0);
  }
});

test('factory types and funding restore canonically without repeating saved production', () => {
  const ctx=world();ctx.data[0][0].type=ctx.types.factory;
  ctx.Military.setFactoryProductionShare('A',0.4);
  ctx.Military.processEquipment('A');
  const stock=ctx.Military.getEquipmentStock('A');
  ctx.data=JSON.parse(JSON.stringify(ctx.data));
  ctx.normalizeCellTypes();
  ctx.Military.init(JSON.parse(JSON.stringify(ctx.military)));
  assert.equal(ctx.data[0][0].type,ctx.types.factory);
  assert.equal(ctx.Military.getSettings('A').factoryProductionShare,0.4);
  assert.equal(ctx.Military.processEquipment('A').duplicate,true);
  assert.equal(ctx.Military.getEquipmentStock('A'),stock);
});

test('free production and surplus stocks increase AI recruitment and assign equipment without instant delivery', () => {
  function setup(source) {
    const ctx=world();load(ctx,'military/ai.js');ctx.civs.A.ii=6;
    if(source==='stock')ctx.civs.A.heavyEquipmentStock=1000;
    if(source==='terrain'){ctx.res_pop_mod=()=>0.08;ctx.res_econ_mod=()=>2;}
    return ctx;
  }
  const plain=setup(); const baseline=plain.MilitaryAI.plan(plain.civs.A,'A');
  plain.MilitaryAI.think(plain.civs.A,'A');
  for(const source of ['stock','terrain']) {
    const ctx=setup(source); const plan=ctx.MilitaryAI.plan(ctx.civs.A,'A');
    assert.ok(plan.rawTargetManpower>baseline.rawTargetManpower);
    assert.ok(plan.upkeepPerMan>baseline.upkeepPerMan, 'budget must anticipate heavy upkeep');
    ctx.MilitaryAI.think(ctx.civs.A,'A');
    const queues=ctx.Military.getQueues('A');
    assert.ok(queues.length>=plain.Military.getQueues('A').length);
    assert.ok(queues.some(q=>q.maxHeavyEquipment>0));
    assert.ok(queues.every(q=>q.heavyEquipment===0));
    const requested=queues.reduce((sum,q)=>sum+q.maxHeavyEquipment,0);
    assert.ok(requested<=(source==='stock'?1000:480));
    assert.ok(ctx.Military.getSettings('A').growthShare>0.5);
  }
});

test('equipment-rich AI expands beyond the elite fifth and equips emergency conscription requests', () => {
  const ctx=world();load(ctx,'military/ai.js');ctx.civs.A.ii=6;
  ctx.civs.A.heavyEquipmentStock=10000;
  for(let n=0;n<5;n++)ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:1000,maxManpower:1000});
  ctx.civs.A.war.B=4;ctx.civs.B.war.A=4;
  ctx.Military._addDivision({civ:'B',row:0,col:2,manpower:30000,maxManpower:30000});
  ctx.Military._addDivision({civ:'B',row:1,col:2,manpower:30000,maxManpower:30000});
  ctx.MilitaryAI.think(ctx.civs.A,'A');
  assert.ok(ctx.Military.getDivisions('A').filter(d=>d.maxHeavyEquipment>0).length>1);
  const drafted=ctx.civs.A._militaryAI.actions.filter(a=>a.action==='conscript');
  assert.ok(drafted.length>0);
  assert.ok(drafted.some(a=>ctx.Military.getDivision(a.detail)?.maxHeavyEquipment>0));
  assert.ok(ctx.civs.A.conscriptedThisTurn<=ctx.civs.A.pop*0.1);
});

test('factory cash reservation respects the player military upkeep spending percentage', () => {
  const ctx=world();ctx.data[0][0].type=ctx.types.factory;
  ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:1000});
  ctx.Military.setMaxUpkeepShare('A',0.5);
  ctx.civs.A.money=ctx.Military.getUpkeep('A')/0.5+1;
  assert.equal(ctx.Military.processEquipment('A').paid,1);
  assert.equal(ctx.Military.processUpkeep('A').fundedRatio,1);
});

test('civ-level military statistics migrate from settings without duplicating stock or overwriting newer values', () => {
  const ctx=world();
  delete ctx.civs.A.heavyEquipmentStock;
  delete ctx.civs.A.conscriptedThisTurn;
  const report={free:2,factory:5,paid:1};
  ctx.Military.init({civSettings:{A:{heavyEquipmentStock:12.5,conscriptedThisTurn:100,
    casualtiesSufferedThisTurn:20,equipmentProduction:report,equipmentProductionTurn:ctx.turn,
    factoryProductionShare:0.25,customSetting:'kept'}}});
  assert.equal(ctx.civs.A.heavyEquipmentStock,12.5);
  assert.equal(ctx.civs.A.conscriptedThisTurn,100);
  assert.equal(ctx.civs.A.equipmentProduction,report);
  assert.equal(ctx.Military.getSettings('A').heavyEquipmentStock,undefined);
  assert.equal(ctx.Military.getSettings('A').conscriptedThisTurn,undefined);
  assert.equal(ctx.Military.getSettings('A').factoryProductionShare,0.25);
  assert.equal(ctx.Military.getSettings('A').customSetting,'kept');
  assert.equal(ctx.Military.processEquipment('A').duplicate,true);
  ctx.civs.A.heavyEquipmentStock=0;
  ctx.Military.init({civSettings:{A:{heavyEquipmentStock:100}}});
  assert.equal(ctx.civs.A.heavyEquipmentStock,0);
});

test('deployed equipment totals exclude national stock and queues and track cap changes and deployment', () => {
  const ctx=world();ctx.civs.A.heavyEquipmentStock=100;
  const d=ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:1000,maxHeavyEquipment:10,heavyEquipment:4});
  const q=ctx.Military._addQueue({civ:'A',row:0,col:0,manpower:1000,maxHeavyEquipment:10,heavyEquipment:3});
  assert.equal(ctx.civs.A.deployedHeavyEquipment,4);
  assert.equal(ctx.civs.A.queuedHeavyEquipment,3);
  ctx.Military.setEquipmentCap(d,2);
  assert.equal(ctx.civs.A.deployedHeavyEquipment,2);
  assert.equal(ctx.civs.A.heavyEquipmentStock,102);
  ctx.Military.deployQueue(q.id);
  assert.equal(ctx.civs.A.deployedHeavyEquipment,5);
  assert.equal(ctx.civs.A.queuedHeavyEquipment,0);
  ctx.Military.disbandDivision(d.id);
  assert.equal(ctx.civs.A.deployedHeavyEquipment,3);
  const civSave=JSON.parse(JSON.stringify(ctx.civs));
  const militarySave=JSON.parse(JSON.stringify(ctx.military));
  ctx.civs=civSave;ctx.Military.init(militarySave);
  assert.equal(ctx.civs.A.deployedHeavyEquipment,3);
  assert.equal(ctx.civs.A.heavyEquipmentStock,104);
});

test('AI retains equipped formations despite a low cash cushion instead of returning their equipment to stock', () => {
  const ctx=world();load(ctx,'military/ai.js');
  ctx.data=[Array.from({length:100},()=>cell('A',ctx.types.land,50000))];
  Object.assign(ctx.civs.A,{ii:100,pop:5000000,income:125,incomesRA:125,money:200});
  ctx.civs.A.war.B=4;ctx.civs.B.war.A=4;
  ctx.res_pop_mod=()=>0.29;ctx.res_econ_mod=()=>1.01;
  for(let n=0;n<5;n++)ctx.Military._addDivision({civ:'A',row:0,col:n,manpower:50000,maxManpower:50000,
    maxHeavyEquipment:500,heavyEquipment:500,movesRemaining:0});
  assert.ok(ctx.Military.getUpkeep('A')<ctx.civs.A.income);
  ctx.MilitaryAI.think(ctx.civs.A,'A');
  assert.equal(ctx.civs.A.deployedHeavyEquipment,2500);
  assert.equal(ctx.civs.A.heavyEquipmentStock,0);
  assert.ok(ctx.Military.getDivisions('A').every(d=>d.maxHeavyEquipment===500));
});

test('free-producing AI can equip 100% of a standing army over time without zeroing deployed equipment', () => {
  const ctx=world();load(ctx,'military/ai.js');
  ctx.civs.A.ii=6;ctx.civs.A.war.B=4;ctx.civs.B.war.A=4;
  ctx.res_pop_mod=()=>0.08;ctx.res_econ_mod=()=>2;
  const troops=[];
  for(let n=0;n<5;n++)troops.push(ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:10000,maxManpower:10000,movesRemaining:0}));
  let previous=0;
  for(let n=0;n<20;n++) {
    ctx.turn++;ctx.civs.A.money=10000;
    ctx.MilitaryAI.think(ctx.civs.A,'A');
    ctx.Military.processEquipment('A');ctx.Military.processUpkeep('A');
    const deployed=troops.reduce((sum,d)=>sum+d.heavyEquipment,0);
    assert.ok(deployed>=previous-1e-8, 'existing equipped troops must not be stripped by replanning');
    previous=deployed;
  }
  assert.ok(troops.every(d=>d.maxHeavyEquipment===100));
  assert.ok(troops.every(d=>Math.abs(ctx.Military.getHardness(d)-1)<1e-8));
});

test('peacetime downsizing preserves the last funded equipped division', () => {
  const ctx=world();load(ctx,'military/ai.js');
  ctx.data=[Array.from({length:6},()=>cell('A',ctx.types.land))];ctx.civs.A.ii=6;
  const hard=ctx.Military._addDivision({civ:'A',row:0,col:0,manpower:50000,maxManpower:50000,maxHeavyEquipment:500,heavyEquipment:500});
  ctx.Military._addDivision({civ:'A',row:0,col:1,manpower:10000,maxManpower:10000,experience:4});
  for(let n=0;n<8;n++){ctx.turn++;ctx.MilitaryAI.think(ctx.civs.A,'A');}
  assert.ok(ctx.Military.getDivision(hard.id));
  assert.equal(ctx.Military.getDivision(hard.id).heavyEquipment,500);
});

test('ruling-culture minorities contribute proportionally and share changes refresh immediately', () => {
  const ctx=world();ctx.res_pop_mod=()=>0.08;ctx.res_econ_mod=()=>2;
  ctx.popv2_get_dominant_culture=()=> 'b';
  for(const share of [0,0.1,0.25,0.5,0.75,1]) {
    ctx.popv2.map[0][0].pop={a:1000*share,b:1000*(1-share)};
    const resource=ctx.Military.getHeavyResource(0,0);
    assert.equal(resource.potential,10);
    assert.equal(resource.cultureShare,share);
    assert.equal(resource.output,10*share);
  }
  ctx.popv2.map[0][0].pop={a:100,b:300};
  ctx.civs.A.culture='b';
  assert.equal(ctx.Military.getHeavyResource(0,0).output,7.5);
  ctx.popv2.map[0][0].pop={a:0,b:0};
  assert.equal(ctx.Military.getHeavyResource(0,0).output,0);
  delete ctx.popv2.map[0][0];
  assert.equal(ctx.Military.getHeavyResource(0,0).output,0);
  delete ctx.popv2;
  assert.equal(ctx.Military.getHeavyResource(0,0).output,0);
});

test('culture-weighted fractional production reaches the stockpile without scaling factory output', () => {
  const ctx=world();ctx.res_pop_mod=(row,col)=>row===0&&col===0?0.08:0.8;ctx.res_econ_mod=()=>2;
  ctx.popv2.map[0][0].pop={a:250,b:750};
  ctx.data[0][0].type=ctx.types.factory;
  const production=ctx.Military.processEquipment('A');
  assert.equal(production.free,2.5);
  assert.equal(production.factory,10);
  assert.equal(ctx.civs.A.heavyEquipmentStock,12.5);
  ctx.turn++;ctx.popv2.map[0][0].pop={a:750,b:250};
  assert.equal(ctx.Military.processEquipment('A').free,7.5);
  assert.equal(ctx.civs.A.heavyEquipmentStock,30);
});
