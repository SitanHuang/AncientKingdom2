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

test('division army designation accepts red or none and survives state access', () => {
  const ctx = world();
  const division = ctx.Military._addDivision({
    civ: 'A', row: 0, col: 0, manpower: 1000, maxManpower: 1000
  });

  assert.equal(ctx.Military.setDivisionArmy(division.id, 'red').ok, true);
  assert.equal(ctx.Military.getDivision(division.id).armyColor, 'red');
  assert.equal(ctx.Military.setDivisionArmy(division.id, null).ok, true);
  assert.equal(ctx.Military.getDivision(division.id).armyColor, undefined);
  assert.equal(ctx.Military.setDivisionArmy(division.id, 'blue').ok, false);
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
  assert.equal(ctx.Military.getSettings('A').conscriptedThisTurn, 0);
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
