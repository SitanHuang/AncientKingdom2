var Military = (function (api) {
  var alliedAccess = function () { return false; };

  function setAlliedAccessResolver(resolver) {
    alliedAccess = resolver || function () { return false; };
  }

  function getAccess(civName, row, col) {
    var tile = data[row] && data[row][col];
    if (!tile || !tile.color) return "blocked";
    if (tile.color == civName) return "own";
    if (alliedAccess(civName, tile.color, row, col)) return "allied";
    if (civs[civName] && typeof isAtWar == "function" && isAtWar(civs[civName], tile.color)) return "enemy";
    return "blocked";
  }

  function getNeighbors(row, col) {
    return [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1]
    ].filter(function (point) {
      return data[point[0]] && data[point[0]][point[1]];
    });
  }

  function findPath(civName, from, to, maxMoves) {
    maxMoves = maxMoves == null ? Infinity : maxMoves;
    if (from[0] == to[0] && from[1] == to[1]) return [];
    if (["own", "allied"].indexOf(getAccess(civName, to[0], to[1])) < 0) return null;

    var startKey = from[0] + ":" + from[1];
    var targetKey = to[0] + ":" + to[1];
    var queue = [[from[0], from[1], 0]];
    var previous = {};
    previous[startKey] = null;

    for (var head = 0; head < queue.length; head++) {
      var current = queue[head];
      if (current[2] >= maxMoves) continue;
      var neighbors = getNeighbors(current[0], current[1]);
      for (var n = 0; n < neighbors.length; n++) {
        var next = neighbors[n];
        var key = next[0] + ":" + next[1];
        if (previous[key] !== undefined) continue;
        if (["own", "allied"].indexOf(getAccess(civName, next[0], next[1])) < 0) continue;
        previous[key] = current[0] + ":" + current[1];
        if (key == targetKey) return buildPath(previous, targetKey);
        queue.push([next[0], next[1], current[2] + 1]);
      }
    }
    return null;
  }

  function buildPath(previous, targetKey) {
    var path = [];
    var key = targetKey;
    while (previous[key] != null) {
      path.push(key.split(":").map(Number));
      key = previous[key];
    }
    return path.reverse();
  }

  function moveDivisions(ids, row, col, opts) {
    opts = opts || {};
    var divisions = api.resolveDivisions(ids);
    if (!divisions.length) return { ok: false, reason: "no-divisions", moved: [], skipped: [] };
    var civName = divisions[0].civ;
    divisions = divisions.filter(function (division) { return division.civ == civName; });
    var access = getAccess(civName, row, col);
    if (access == "enemy") return attack(ids, row, col, opts);
    if (access != "own" && access != "allied") return {
      ok: false,
      reason: "no-access",
      moved: [],
      skipped: divisions.map(function (division) { return division.id; })
    };

    var moved = [];
    var skipped = [];
    divisions.forEach(function (division) {
      var path = findPath(civName, [division.row, division.col], [row, col]);
      if (!path) {
        skipped.push(division.id);
        return;
      }
      var steps = Math.min(path.length, Math.max(0, Math.floor(division.movesRemaining)));
      if (path.length && !steps) {
        skipped.push(division.id);
        return;
      }
      if (steps) {
        var destination = path[steps - 1];
        division.movesRemaining -= steps;
        division.entrenchment = 1;
        division.movedThisTurn = true;
        api._moveDivision(division, destination[0], destination[1]);
      }
      moved.push(division.id);
    });
    if (api.resetGrowthRequests) api.resetGrowthRequests(civName);

    return {
      ok: moved.length > 0,
      reason: moved.length ? null : "out-of-range",
      moved: moved,
      skipped: skipped,
      row: row,
      col: col
    };
  }

  function attack(ids, row, col, opts) {
    opts = opts || {};
    var selected = api.resolveDivisions(ids);
    if (!selected.length) return { ok: false, reason: "no-divisions", moved: [], skipped: [] };
    var civName = selected[0].civ;
    var target = data[row] && data[row][col];
    if (!target || getAccess(civName, row, col) != "enemy") return {
      ok: false,
      reason: "not-at-war",
      moved: [],
      skipped: selected.map(function (division) { return division.id; })
    };
    var defenderName = target.color;

    var eligible = [];
    var skipped = [];
    selected.forEach(function (division) {
      if (division.civ == civName && division.movesRemaining >= 1 &&
        Math.abs(division.row - row) + Math.abs(division.col - col) == 1) eligible.push(division);
      else skipped.push(division.id);
    });
    if (!eligible.length) return { ok: false, reason: "no-eligible-divisions", moved: [], skipped: skipped };

    var cost = getAttackCost(civName, defenderName, eligible, row, col);
    var civ = civs[civName];
    if (!opts.ignoreCost && (civ.politic || 0) < cost.politic) return {
      ok: false,
      reason: "politic",
      cost: cost,
      moved: [],
      skipped: skipped
    };
    if (!opts.ignoreCost) chargeAttackCost(civName, defenderName, cost);

    eligible.forEach(function (division) {
      division.movesRemaining--;
      division.entrenchment = 1;
      division.movedThisTurn = true;
    });
    var result = api.resolveBattle(eligible, row, col, opts);
    if (api.resetGrowthRequests) {
      api.resetGrowthRequests(civName);
      api.resetGrowthRequests(defenderName);
    }
    result.cost = cost;
    result.moved = eligible.map(function (division) { return division.id; });
    result.skipped = skipped;
    return result;
  }

  function getAttackCost(civName, defenderName, divisions, row, col) {
    var attacker = civs[civName];
    var defender = civs[defenderName];
    var mods = (attacker.gov && attacker.gov.mods) || {};
    var omvpc = Math.max(0, 1 + (mods.OMVPC || 0));
    var mmvct = Math.max(0, 1 + (mods.MMVCT || 0));
    var manpower = divisions.reduce(function (sum, division) { return sum + division.manpower; }, 0);
    var legacy = api.legacyEquivalent(attacker, manpower);
    var politic = 0.7 * omvpc;
    var money = legacy / 4 * mmvct;
    var foreignCulture = false;
    var dominance = 1;

    if (typeof popv2_get_dominant_culture == "function") {
      foreignCulture = popv2_get_dominant_culture(row, col) != attacker.culture;
    }
    if (foreignCulture && defender) {
      var economicDominance = attacker.ii > defender.ii;
      var populationDominance = attacker.pop > defender.pop;
      dominance = (economicDominance ? 1.7 : 1) * (populationDominance ? 1.7 : 1);
      politic += 0.7 * omvpc * 0.25 * dominance;
      money += legacy / 25 * mmvct * 0.2 * dominance;
    }
    return {
      politic: politic,
      money: money,
      logistics: legacy / 4 * mmvct,
      foreignCulture: foreignCulture,
      dominance: dominance,
      manpower: manpower
    };
  }

  function chargeAttackCost(civName, defenderName, cost) {
    var attacker = civs[civName];
    var defender = civs[defenderName];
    attacker.politic -= cost.politic;
    attacker.money -= cost.money;
    attacker.logistics = (attacker.logistics || 0) + cost.logistics;

    if (cost.foreignCulture && defender) {
      var economicDominance = attacker.ii > defender.ii;
      var populationDominance = attacker.pop > defender.pop;
      defender.politic = (defender.politic || 0) + (economicDominance ? 0.35 : 0) +
        (populationDominance ? 0.35 : 0);
      defender.money = (defender.money || 0) +
        (economicDominance ? api.legacyEquivalent(attacker, cost.manpower) / 10 : 0) +
        (populationDominance ? api.legacyEquivalent(attacker, cost.manpower) / 10 : 0);
    }
  }

  api.setAlliedAccessResolver = setAlliedAccessResolver;
  api.getAccess = getAccess;
  api.getNeighbors = getNeighbors;
  api.findPath = findPath;
  api.moveDivisions = moveDivisions;
  api.attack = attack;
  api.getAttackCost = getAttackCost;
  api.chargeAttackCost = chargeAttackCost;

  return api;
})(Military);
