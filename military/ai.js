var MilitaryAI = (function () {
  var MAX_ACTIONS = 128;
  var MIN_DIVISION_MANPOWER = 1000;
  var MAX_DIVISION_MANPOWER = 20000;
  var MAX_DIVISIONS = 64;

  var ADJECTIVES = [
    "Ashen", "Bronze", "Crimson", "Dawn", "Emerald", "Golden",
    "Iron", "Ivory", "Jade", "Moonlit", "Silver", "Storm"
  ];
  var NOUNS = [
    "Banners", "Falcons", "Guard", "Lancers", "Legion", "Lions",
    "Sentinels", "Shields", "Spears", "Vanguard", "Wardens", "Wolves"
  ];

  var publicAPI = {
    think: think,
    plan: plan,
    debug: debug
  };

  function think(civ, civName) {
    if (!civ || !civName || typeof Military === "undefined" || (civ.ii || 0) < 1) {
      return null;
    }

    var state = civ._militaryAI || (civ._militaryAI = {});
    var turnKey = getTurnKey(civ);
    if (state.lastRun === turnKey) return state.plan || null;

    state.lastRun = turnKey;
    state.actions = [];
    state.conscripted = 0;

    var atWar = hasActiveWar(civ);
    Military.setGrowthShare(civName, atWar ? 1 : 0.5);
    Military.setMaxUpkeepShare(civName, atWar ? 0.75 : 0.5);

    var militaryPlan = plan(civ, civName);
    state.plan = militaryPlan;

    trimUnaffordableForces(civ, civName, militaryPlan, state);
    deployQueues(civ, civName, militaryPlan, state);
    createRecruitQueues(civ, civName, militaryPlan, state);
    stationDivisions(civ, civName, militaryPlan, state);

    // Movement changes both the friendly line and the enemy's exposed tiles.
    // Recalculate before raising emergency forces or selecting an attack.
    militaryPlan = plan(civ, civName);
    state.plan = militaryPlan;
    emergencyConscript(civ, civName, militaryPlan, state);
    attack(civ, civName, state);

    return state.plan;
  }

  function plan(civ, civName) {
    var divisions = Military.getDivisions(civName);
    var queues = Military.getQueues(civName);
    var fronts = buildFronts(civ, civName);
    var atWar = hasActiveWar(civ);
    var basePostManpower = clamp(Math.round((civ.pop || 0) * 0.00025), 1000, 5000);
    var neutralPosts = 0;
    var warPosts = 0;
    var rawTarget = 0;
    var highestPeacetimeRisk = 0;

    fronts.forEach(function (front) {
      front.postCount = Math.ceil(front.tiles.length / 4);
      front.posts = choosePosts(front, front.postCount, civName);
      front.enemyManpower = adjacentEnemyManpower(front, civName);
      front.diplomaticRisk = diplomaticRisk(civ, front.neighbor);
      front.neighborPotential = mobilizationPotential(civs[front.neighbor], front.neighbor);
      front.relativeStrength = relativeStrength(civ, civs[front.neighbor]);
      if (front.atWar) {
        warPosts += front.postCount;
        front.targetManpower = Math.max(
          front.postCount * basePostManpower * 2,
          front.enemyManpower * 1.25
        );
      } else {
        neutralPosts += front.postCount;
        highestPeacetimeRisk = Math.max(highestPeacetimeRisk, front.diplomaticRisk);
        var sizePressure = clamp(Math.sqrt(front.relativeStrength), 0.75, 2.5);
        front.targetManpower = Math.max(
          front.postCount * basePostManpower * (0.5 + front.diplomaticRisk),
          Math.max(front.enemyManpower, front.neighborPotential) *
            front.diplomaticRisk * 0.75 * sizePressure
        );
      }
      rawTarget += front.targetManpower;
    });

    var reservePosts = Math.ceil(neutralPosts * 0.25 + warPosts * 0.5);
    if (!fronts.length && ownedTileCount(civName)) reservePosts = 1;
    rawTarget += reservePosts * basePostManpower;
    if (!atWar) {
      rawTarget += Math.min(
        (civ.pop || 0) * 0.005 * (0.5 + highestPeacetimeRisk),
        Math.max(basePostManpower, (civ.pop || 0) * 0.015)
      );
    }

    var upkeepPerMan = getUpkeepPerMan(civ);
    var availableIncome = getAvailableIncome(civ);
    var settings = Military.getSettings(civName);
    var upkeepShare = settings.maxUpkeepShare;
    var incomeCeiling = availableIncome * (atWar ? 0.60 : 0.30) / upkeepPerMan;
    var cashCeiling = Math.max(0, civ.money || 0) * upkeepShare / upkeepPerMan;
    var populationCeiling = Math.max(0, civ.pop || 0) * (atWar ? 0.08 : 0.03);
    var targetManpower = Math.max(0, Math.min(
      rawTarget,
      incomeCeiling,
      cashCeiling,
      populationCeiling
    ));

    var frontlineCount = neutralPosts + warPosts;
    var desiredRawCount = frontlineCount + reservePosts;
    var desiredCount = Math.min(
      desiredRawCount,
      Math.floor(targetManpower / MIN_DIVISION_MANPOWER),
      MAX_DIVISIONS,
      Math.max(1, Math.ceil((civ.ii || 0) / 2))
    );
    var activeManpower = sum(divisions, "manpower");
    var activeCapacity = sum(divisions, "maxManpower");
    var queueManpower = sum(queues, "manpower");
    var queueCapacity = sum(queues, "maxManpower");

    return {
      atWar: atWar,
      fronts: fronts,
      capital: getCapital(civ, civName),
      basePostManpower: basePostManpower,
      neutralPosts: neutralPosts,
      warPosts: warPosts,
      reservePosts: reservePosts,
      rawTargetManpower: rawTarget,
      targetManpower: targetManpower,
      desiredCount: desiredCount,
      incomeCeiling: incomeCeiling,
      cashCeiling: cashCeiling,
      populationCeiling: populationCeiling,
      availableIncome: availableIncome,
      upkeepPerMan: upkeepPerMan,
      activeManpower: activeManpower,
      activeCapacity: activeCapacity,
      queueManpower: queueManpower,
      queueCapacity: queueCapacity,
      committedCapacity: activeCapacity + queueCapacity
    };
  }

  function buildFronts(civ, civName) {
    var parts = typeof regions_genCountryParts === "function" ?
      regions_genCountryParts(civ, civName) : civ._parts;
    var candidates = {};

    for (var row = 0; row < data.length; row++) {
      for (var col = 0; col < data[row].length; col++) {
        var cell = data[row][col];
        if (!cell || cell.color !== civName) continue;

        adjacent(row, col).forEach(function (pos) {
          var other = getCell(pos[0], pos[1]);
          if (!other || !other.color || other.color === civName) return;
          if (isAllied(civ, other.color) && diplomaticRisk(civ, other.color) < 0.20) return;

          var part = parts?.map?.[row + ":" + col];
          var groupKey = part + "|" + other.color;
          var group = candidates[groupKey] || (candidates[groupKey] = {});
          var key = row + ":" + col;
          var candidate = group[key] || (group[key] = {
            row: row,
            col: col,
            enemyTiles: [],
            enemyOccupied: false
          });
          candidate.enemyTiles.push(pos);
          if (Military.getDivisionsAt(pos[0], pos[1]).some(function (division) {
            return division.civ !== civName;
          })) {
            candidate.enemyOccupied = true;
          }
        });
      }
    }

    var fronts = [];
    Object.keys(candidates).forEach(function (groupKey) {
      var pieces = connectedComponents(candidates[groupKey]);
      var split = groupKey.split("|");
      pieces.forEach(function (tiles, component) {
        fronts.push({
          id: groupKey + "|" + component,
          partition: Number(split[0]),
          neighbor: split[1],
          atWar: isWarring(civ, split[1]),
          tiles: tiles
        });
      });
    });

    fronts.sort(function (a, b) {
      var aOccupied = a.tiles.some(function (tile) { return tile.enemyOccupied; });
      var bOccupied = b.tiles.some(function (tile) { return tile.enemyOccupied; });
      return Number(bOccupied) - Number(aOccupied) ||
        Number(b.atWar) - Number(a.atWar) ||
        b.tiles.length - a.tiles.length;
    });
    return fronts;
  }

  function connectedComponents(tileMap) {
    var remaining = {};
    Object.keys(tileMap).forEach(function (key) { remaining[key] = true; });
    var result = [];

    Object.keys(tileMap).forEach(function (start) {
      if (!remaining[start]) return;
      var stack = [start];
      var component = [];
      delete remaining[start];
      while (stack.length) {
        var key = stack.pop();
        var tile = tileMap[key];
        component.push(tile);
        adjacent(tile.row, tile.col).forEach(function (pos) {
          var next = pos[0] + ":" + pos[1];
          if (!remaining[next]) return;
          delete remaining[next];
          stack.push(next);
        });
      }
      result.push(component);
    });
    return result;
  }

  function choosePosts(front, count, civName) {
    var choices = front.tiles.slice();
    var posts = [];
    while (posts.length < count && choices.length) {
      choices.sort(function (a, b) {
        return postScore(b, posts, civName) - postScore(a, posts, civName);
      });
      posts.push(choices.shift());
    }
    return posts;
  }

  function postScore(tile, posts, civName) {
    var cell = getCell(tile.row, tile.col);
    var strategic = Number(cell?.type?.strategicValue) || 1;
    var population = typeof popv2_get_totpop === "function" ?
      popv2_get_totpop(tile.row, tile.col) : (cell?.pop || 0);
    var spacing = posts.length ? Math.min.apply(null, posts.map(function (post) {
      return distanceSquared(tile, post);
    })) : 0;
    var friendlyCount = Military.getDivisionsAt(tile.row, tile.col, civName).length;
    return (tile.enemyOccupied ? 100000 : 0) + spacing * 100 + strategic * 20 +
      Math.log(1 + Math.max(0, population)) - friendlyCount * 2;
  }

  function adjacentEnemyManpower(front, civName) {
    var seen = {};
    var total = 0;
    front.tiles.forEach(function (tile) {
      tile.enemyTiles.forEach(function (pos) {
        Military.getDivisionsAt(pos[0], pos[1]).forEach(function (division) {
          if (division.civ === civName || seen[division.id]) return;
          seen[division.id] = true;
          total += division.manpower || 0;
        });
      });
    });
    return total;
  }

  function trimUnaffordableForces(civ, civName, militaryPlan, state) {
    var queues = Military.getQueues(civName);
    var fundedRatio = getLastFundedRatio(civ);
    if (fundedRatio < 0.90) {
      var sustainableUpkeep = civ.militaryUpkeep ?
        (civ.militaryUpkeep.paid || 0) / 0.90 : affordableUpkeep(civName, civ);
      queues.sort(function (a, b) {
        return fillRatio(a) - fillRatio(b) || (a.manpower || 0) - (b.manpower || 0);
      });
      while (queues.length && actionAvailable(state)) {
        var queue = queues.shift();
        var cancelled = Military.cancelQueue(queue.id);
        if (!succeeded(cancelled)) continue;
        record(state, "cancel-queue", queue.id);
        if (currentUpkeep(civName, civ) <= sustainableUpkeep) break;
      }
    }

    if (militaryPlan.atWar || militaryPlan.committedCapacity <= militaryPlan.targetManpower * 1.25) {
      state.excessTurns = 0;
      return;
    }

    state.excessTurns = (state.excessTurns || 0) + 1;
    if (state.excessTurns < 4) return;

    var target = militaryPlan.targetManpower * 1.10;
    var divisions = Military.getDivisions(civName).slice().sort(function (a, b) {
      return Number(isBorderTile(a.row, a.col, civName)) - Number(isBorderTile(b.row, b.col, civName)) ||
        (a.experience || 1) - (b.experience || 1) ||
        (a.manpower || 0) - (b.manpower || 0);
    });
    var capacity = sum(divisions, "maxManpower") + sum(Military.getQueues(civName), "maxManpower");
    for (var i = 0; i < divisions.length && capacity > target && actionAvailable(state); i++) {
      var division = divisions[i];
      if (isBorderTile(division.row, division.col, civName)) continue;
      var disbanded = Military.disbandDivision(division.id);
      if (!succeeded(disbanded)) continue;
      capacity -= division.maxManpower || 0;
      record(state, "disband-division", division.id);
    }
    state.excessTurns = capacity > target ? state.excessTurns : 0;
  }

  function deployQueues(civ, civName, militaryPlan, state) {
    var queues = Military.getQueues(civName).slice().sort(function (a, b) {
      return fillRatio(b) - fillRatio(a);
    });
    var urgent = militaryPlan.fronts.some(frontNeedsImmediateUnit);

    queues.forEach(function (queue) {
      if (!actionAvailable(state)) return;
      var full = (queue.manpower || 0) >= (queue.maxManpower || 0);
      var emergencyReady = militaryPlan.atWar && urgent &&
        (queue.manpower || 0) >= Math.max(MIN_DIVISION_MANPOWER, (queue.maxManpower || 0) * 0.25);
      if (!full && !emergencyReady) return;

      var location = queueLocation(queue, militaryPlan.capital, civName);
      var result = Military.deployQueue(queue.id, {
        row: location[0],
        col: location[1],
        ai: true
      });
      if (succeeded(result)) record(state, "deploy", queue.id);
    });
  }

  function createRecruitQueues(civ, civName, militaryPlan, state) {
    var divisions = Military.getDivisions(civName);
    var queues = Military.getQueues(civName);
    var fundedRatio = getLastFundedRatio(civ);
    if (militaryPlan.targetManpower < MIN_DIVISION_MANPOWER ||
      (fundedRatio < 0.90 && divisions.length + queues.length)) return;

    var committed = sum(divisions, "maxManpower") + sum(queues, "maxManpower");
    var countGap = militaryPlan.desiredCount - divisions.length - queues.length;
    var capacityGap = militaryPlan.targetManpower - committed;
    if (capacityGap <= militaryPlan.targetManpower * 0.05 && countGap <= 0) return;

    var capacityNeeded = Math.ceil(Math.max(0, capacityGap) / MAX_DIVISION_MANPOWER);
    var needed = Math.max(capacityNeeded, Math.max(0, countGap));
    var outstandingLimit = Math.max(2, Math.ceil(militaryPlan.desiredCount / 2));
    needed = Math.min(needed, Math.max(0, outstandingLimit - queues.length), 2);

    for (var i = 0; i < needed && actionAvailable(state); i++) {
      var remainingNeeded = needed - i;
      var remainingGap = Math.max(MIN_DIVISION_MANPOWER, militaryPlan.targetManpower - committed);
      var cap = clamp(Math.round(remainingGap / remainingNeeded),
        MIN_DIVISION_MANPOWER, MAX_DIVISION_MANPOWER);
      if (committed + cap > militaryPlan.targetManpower * 1.10 + MIN_DIVISION_MANPOWER) break;

      var result = Military.createRecruitQueue(civName, cap, {
        name: nextName(civ, civName),
        row: militaryPlan.capital?.[0],
        col: militaryPlan.capital?.[1],
        ai: true
      });
      if (!succeeded(result)) break;
      committed += cap;
      record(state, "recruit", result.queue?.id || result.id);
    }
  }

  function stationDivisions(civ, civName, militaryPlan, state) {
    var divisions = Military.getDivisions(civName);
    if (!divisions.length || !militaryPlan.fronts.length) return;

    var assignments = [];
    militaryPlan.fronts.forEach(function (front) {
      var targetPerPost = front.targetManpower / Math.max(1, front.posts.length);
      front.posts.forEach(function (post) {
        var stationed = Military.getDivisionsAt(post.row, post.col, civName);
        assignments.push({
          front: front,
          post: post,
          targetManpower: targetPerPost,
          manpower: sum(stationed, "manpower"),
          count: stationed.length,
          urgent: post.enemyOccupied,
          stationed: stationed
        });
      });
    });

    var keep = {};
    assignments.forEach(function (assignment) {
      var keptManpower = 0;
      assignment.stationed.slice().sort(function (a, b) {
        return (b.experience || 1) - (a.experience || 1);
      }).forEach(function (division, index) {
        if (index === 0 || keptManpower < assignment.targetManpower * 0.75) {
          keep[division.id] = true;
          keptManpower += division.manpower || 0;
        }
      });
    });

    var mobile = divisions.filter(function (division) {
      return !keep[division.id] && (division.movesRemaining == null || division.movesRemaining > 0);
    });

    assignments.sort(function (a, b) {
      return Number(b.urgent && b.count === 0) - Number(a.urgent && a.count === 0) ||
        Number(b.urgent) - Number(a.urgent) ||
        Number(b.front.atWar) - Number(a.front.atWar) ||
        a.count - b.count ||
        assignmentRatio(a) - assignmentRatio(b);
    });

    while (mobile.length && assignments.length && actionAvailable(state)) {
      assignments.sort(function (a, b) {
        return Number(b.urgent && b.count === 0) - Number(a.urgent && a.count === 0) ||
          Number(b.urgent) - Number(a.urgent) ||
          Number(b.front.atWar) - Number(a.front.atWar) ||
          a.count - b.count || assignmentRatio(a) - assignmentRatio(b);
      });
      var destination = assignments[0];
      mobile.sort(function (a, b) {
        return distanceSquared(b, destination.post) - distanceSquared(a, destination.post);
      });
      var division = mobile.pop();
      var moved = moveToward(division, destination.post, civName);
      if (moved) {
        destination.count++;
        destination.manpower += division.manpower || 0;
        record(state, "station", {
          division: division.id,
          front: destination.front.id,
          row: destination.post.row,
          col: destination.post.col
        });
      }

      if (assignments.every(function (assignment) {
        return assignment.count > 0 && assignmentRatio(assignment) >= 0.75;
      })) break;
    }
  }

  function moveToward(division, destination, civName) {
    if (division.row === destination.row && division.col === destination.col) return true;
    var budget = division.movesRemaining == null ? (division.moveLimit || 5) : division.movesRemaining;
    if (budget <= 0) return false;

    var path = Military.findPath(
      civName,
      [division.row, division.col],
      [destination.row, destination.col],
      Number.MAX_SAFE_INTEGER
    );
    if (!path || !path.length) return false;

    var step = path[Math.min(path.length - 1, budget - 1)];
    var point = pathPoint(step);
    if (!point) return false;
    return succeeded(Military.moveDivisions([division.id], point[0], point[1], { ai: true }));
  }

  function emergencyConscript(civ, civName, militaryPlan, state) {
    if (!militaryPlan.atWar || !actionAvailable(state) ||
      (militaryPlan.activeManpower >= militaryPlan.targetManpower * 0.75 &&
        !capitalThreatened(civ, civName, militaryPlan)) ||
      getLastFundedRatio(civ) < 0.75) return;

    var urgent = getUrgentPosts(civName, militaryPlan);
    if (!urgent.length) return;

    var populationCap = Math.max(0, (civ.pop || 0) * 0.10 -
      Military.getSettings(civName).conscriptedThisTurn);
    var stableIncome = Math.max(0, militaryPlan.availableIncome);
    var cashReserve = Math.max(25, civ.govExp || 0, stableIncome * 0.5);
    var spendable = Math.max(0, (civ.money || 0) - cashReserve);
    var affordableMen = Military.menPerLegacyUnit(civ) * spendable / 2;
    var totalUpkeepCapacity = affordableUpkeep(civName, civ) / militaryPlan.upkeepPerMan;
    var upkeepHeadroom = Math.max(0,
      totalUpkeepCapacity - militaryPlan.activeManpower - militaryPlan.queueManpower);
    var raised = 0;

    for (var i = 0; i < urgent.length && raised < 2 && actionAvailable(state); i++) {
      var need = urgent[i];
      var perMan = averageDefensePerMan(civName, need.post.row, need.post.col);
      var powerDeficit = Math.max(0, need.enemyPower * 1.25 - need.friendlyPower);
      var requested = powerDeficit / Math.max(0.1, perMan);
      var manpower = Math.min(requested, populationCap, affordableMen, upkeepHeadroom,
        MAX_DIVISION_MANPOWER);
      manpower = Math.floor(manpower);
      if (manpower < MIN_DIVISION_MANPOWER) continue;

      var projectedMen = militaryPlan.activeManpower + militaryPlan.queueManpower + manpower;
      var conscriptionCost = Military.legacyEquivalent(civ, manpower) * 2;
      var projectedAvailable = Math.max(0, (civ.money || 0) - conscriptionCost) *
        Military.getSettings(civName).maxUpkeepShare;
      var projectedFunding = projectedAvailable /
        Math.max(1, projectedMen * militaryPlan.upkeepPerMan);
      if (projectedFunding < 0.75) continue;

      var result = Military.conscript(civName, need.post.row, need.post.col, manpower, {
        name: nextName(civ, civName),
        ai: true
      });
      if (!succeeded(result)) continue;

      var actual = result.manpower || manpower;
      state.conscripted += actual;
      populationCap -= actual;
      affordableMen -= actual;
      upkeepHeadroom -= actual;
      raised++;
      record(state, "conscript", result.division?.id || result.id);
    }
  }

  function getUrgentPosts(civName, militaryPlan) {
    var urgent = [];
    var seen = {};

    function consider(front, post) {
      var key = post.row + ":" + post.col;
      if (seen[key]) return;
      seen[key] = true;

      var friendly = Military.getDivisionsAt(post.row, post.col, civName);
      var strongestEnemy = null;
      post.enemyTiles.forEach(function (pos) {
        var enemies = Military.getDivisionsAt(pos[0], pos[1]).filter(function (division) {
          return division.civ !== civName && isWarring(civs[civName], division.civ);
        });
        if (!enemies.length) return;
        var power = powerValue(Military.estimatePower(enemies, post.row, post.col, false));
        if (!strongestEnemy || power > strongestEnemy.power) {
          strongestEnemy = { power: power, divisions: enemies };
        }
      });
      if (!strongestEnemy) return;

      var friendlyPower = powerValue(Military.estimatePower(friendly, post.row, post.col, true));
      if (!friendly.length || friendlyPower < strongestEnemy.power * 0.80) {
        urgent.push({
          front: front,
          post: post,
          enemyPower: strongestEnemy.power,
          friendlyPower: friendlyPower
        });
      }
    }

    militaryPlan.fronts.forEach(function (front) {
      if (!front.atWar) return;
      front.posts.forEach(function (post) {
        consider(front, post);
      });
    });

    var capital = militaryPlan.capital;
    if (capital) {
      var capitalPost = {
        row: capital[0],
        col: capital[1],
        enemyTiles: adjacent(capital[0], capital[1])
      };
      consider({ id: "capital", atWar: true }, capitalPost);
    }
    urgent.sort(function (a, b) {
      return (b.enemyPower - b.friendlyPower) - (a.enemyPower - a.friendlyPower);
    });
    return urgent;
  }

  function attack(civ, civName, state) {
    var attempted = {};
    while (actionAvailable(state)) {
      var candidates = getAttackCandidates(civ, civName, attempted);
      if (!candidates.length) break;
      var choice = candidates[0];
      var attemptKey = choice.row + ":" + choice.col + ":" + choice.attackers.map(function (d) {
        return d.id;
      }).join(",");
      attempted[attemptKey] = true;

      var result = Military.attack(
        choice.attackers.map(function (division) { return division.id; }),
        choice.row,
        choice.col,
        { ai: true, enemyCiv: choice.enemyCiv }
      );
      if (succeeded(result)) {
        record(state, "attack", {
          row: choice.row,
          col: choice.col,
          ratio: choice.ratio,
          enemy: choice.enemyCiv
        });
      }
    }
  }

  function getAttackCandidates(civ, civName, attempted) {
    var byTile = {};
    Military.getDivisions(civName).forEach(function (division) {
      if (division.movesRemaining != null && division.movesRemaining < 1) return;
      var key = division.row + ":" + division.col;
      (byTile[key] || (byTile[key] = [])).push(division);
    });

    var candidates = [];
    Object.keys(byTile).forEach(function (sourceKey) {
      var attackers = byTile[sourceKey];
      var source = sourceKey.split(":").map(Number);
      adjacent(source[0], source[1]).forEach(function (pos) {
        var cell = getCell(pos[0], pos[1]);
        if (!cell || !cell.color || cell.color === civName || !isWarring(civ, cell.color)) return;

        var enemies = Military.getDivisionsAt(pos[0], pos[1]).filter(function (division) {
          return division.civ === cell.color;
        });
        var attemptKey = pos[0] + ":" + pos[1] + ":" + attackers.map(function (d) {
          return d.id;
        }).join(",");
        if (attempted[attemptKey]) return;

        var attackPower = powerValue(Military.estimatePower(attackers, pos[0], pos[1], false));
        var defensePower = powerValue(Military.estimatePower(enemies, pos[0], pos[1], true));
        var ratio = defensePower > 0 ? attackPower / defensePower : Infinity;
        var recapture = cell._oldcolor === civName;
        var enemyOccupied = enemies.length > 0;
        var threshold = recapture ? 1.05 : (enemyOccupied ? 1.15 : 1.25);
        if (ratio < threshold) return;

        var cost = Military.getAttackCost(civName, cell.color, attackers, pos[0], pos[1]);
        if ((civ.politic || 0) < cost.politic || (civ.money || 0) < cost.money) return;

        var strategic = Number(cell.type?.strategicValue) || 1;
        var score = (enemyOccupied ? 1000 : 0) + (recapture ? 700 : 0) +
          Math.min(10, ratio) * 100 + strategic * 20 - cost.money;
        candidates.push({
          attackers: attackers,
          row: pos[0],
          col: pos[1],
          enemyCiv: cell.color,
          ratio: ratio,
          score: score
        });
      });
    });

    candidates.sort(function (a, b) { return b.score - a.score; });
    return candidates;
  }

  function averageDefensePerMan(civName, row, col) {
    var divisions = Military.getDivisions(civName);
    var values = divisions.map(function (division) {
      if (!(division.manpower > 0)) return 0;
      return powerValue(Military.estimatePower([division], row, col, true)) / division.manpower;
    }).filter(function (value) { return value > 0; }).sort(function (a, b) { return a - b; });
    if (!values.length) return 1;
    return values[Math.floor(values.length / 2)];
  }

  function frontNeedsImmediateUnit(front) {
    return front.atWar && front.posts.some(function (post) {
      return post.enemyOccupied && Military.getDivisionsAt(post.row, post.col).length === 0;
    });
  }

  function queueLocation(queue, capital, civName) {
    if (getCell(queue.row, queue.col)?.color === civName) return [queue.row, queue.col];
    return capital;
  }

  function getCapital(civ, civName) {
    var parts = typeof regions_genCountryParts === "function" ?
      regions_genCountryParts(civ, civName) : civ._parts;
    if (parts?.supplyCenter && getCell(parts.supplyCenter[0], parts.supplyCenter[1])?.color === civName) {
      return parts.supplyCenter.slice(0, 2);
    }

    var best = null;
    for (var row = 0; row < data.length; row++) {
      for (var col = 0; col < data[row].length; col++) {
        var cell = data[row][col];
        if (!cell || cell.color !== civName) continue;
        var score = (Number(cell.type?.strategicValue) || 1) * 100000 + (cell.pop || 0);
        if (!best || score > best.score) best = { row: row, col: col, score: score };
      }
    }
    return best ? [best.row, best.col] : null;
  }

  function nextName(civ, civName) {
    var state = civ._militaryAI || (civ._militaryAI = {});
    var ordinal = state.nextName || 0;
    var seed = hash(civName) + ordinal * 37;
    var name = ADJECTIVES[Math.abs(seed) % ADJECTIVES.length] + " " +
      NOUNS[Math.abs(Math.floor(seed / ADJECTIVES.length) + ordinal * 7) % NOUNS.length];
    state.nextName = ordinal + 1;

    var used = {};
    Military.getDivisions(civName).concat(Military.getQueues(civName)).forEach(function (item) {
      used[item.name] = true;
    });
    if (used[name]) name += " " + (ordinal + 1);
    return name;
  }

  function getAvailableIncome(civ) {
    var current = Math.max(0, civ.income || 0);
    var average = Math.max(0, civ.incomesRA || 0);
    var stable = current && average ? Math.min(current, average) : Math.max(current, average);
    var nonMilitaryExpense = Math.max(0,
      (civ.expense || 0) - (civ.militaryUpkeep?.paid || 0));
    return Math.max(0, stable - nonMilitaryExpense -
      (civ.govExp || 0) - (civ.spentOnUrban || 0));
  }

  function getUpkeepPerMan(civ) {
    var modifier = Math.max(0.01, 1 + (civ.gov?.mods?.MUKCT || 0));
    return modifier / (4 * Military.menPerLegacyUnit(civ));
  }

  function currentUpkeep(civName, civ) {
    var manpower = sum(Military.getDivisions(civName), "manpower") +
      sum(Military.getQueues(civName), "manpower");
    return manpower * getUpkeepPerMan(civ);
  }

  function affordableUpkeep(civName, civ) {
    return Math.max(0, civ.money || 0) * Military.getSettings(civName).maxUpkeepShare;
  }

  function getLastFundedRatio(civ) {
    if (civ.militaryUpkeep && civ.militaryUpkeep.fundedRatio != null) {
      return civ.militaryUpkeep.fundedRatio;
    }
    if (civ._militaryUpkeepFundedRatio != null) return civ._militaryUpkeepFundedRatio;
    return 1;
  }

  function isBorderTile(row, col, civName) {
    return adjacent(row, col).some(function (pos) {
      var cell = getCell(pos[0], pos[1]);
      return cell && cell.color && cell.color !== civName && !isAllied(civs[civName], cell.color);
    });
  }

  function capitalThreatened(civ, civName, militaryPlan) {
    var capital = militaryPlan.capital;
    if (!capital) return false;
    return adjacent(capital[0], capital[1]).some(function (pos) {
      return Military.getDivisionsAt(pos[0], pos[1]).some(function (division) {
        return division.civ !== civName && isWarring(civ, division.civ);
      });
    });
  }

  function ownedTileCount(civName) {
    var count = 0;
    for (var row = 0; row < data.length; row++) {
      for (var col = 0; col < data[row].length; col++) {
        if (data[row][col]?.color === civName) count++;
      }
    }
    return count;
  }

  function hasActiveWar(civ) {
    return Object.keys(civ.war || {}).some(function (name) { return isWarring(civ, name); });
  }

  function diplomaticRisk(civ, otherName) {
    if (isWarring(civ, otherName)) return 1;
    var relation = civ && civ.war && civ.war[otherName];
    if (relation == null || relation > -5) return 0.65;

    var quartersRemaining = Math.max(0, -5 - relation);
    var expiryPressure = 1 / (1 + quartersRemaining / 8);
    if (relation % 1 === 0) return 0.04 + expiryPressure * 0.50;
    return 0.10 + expiryPressure * 0.85;
  }

  function mobilizationPotential(civ, civName) {
    if (!civ) return 0;
    var active = sum(Military.getDivisions(civName), "manpower") +
      sum(Military.getQueues(civName), "manpower");
    var economic = Math.max(0, civ.income || 0) * 0.20 / getUpkeepPerMan(civ);
    var population = Math.max(0, civ.pop || 0) * 0.015;
    return Math.max(active, Math.min(population, economic));
  }

  function relativeStrength(civ, other) {
    if (!other) return 1;
    var land = (other.ii || 1) / Math.max(1, civ.ii || 1);
    var population = (other.pop || 1) / Math.max(1, civ.pop || 1);
    var income = Math.max(1, other.income || 0) / Math.max(1, civ.income || 0);
    return Math.max(0.25, (land + population + income) / 3);
  }

  function isWarring(civ, other) {
    return civ && civ.war && civ.war[other] != null && civ.war[other] >= 0;
  }

  function isAllied(civ, other) {
    var relation = civ?.war?.[other];
    return relation != null && relation <= -5 && relation % 1 === 0;
  }

  function adjacent(row, col) {
    return [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].filter(function (pos) {
      return !!getCell(pos[0], pos[1]);
    });
  }

  function getCell(row, col) {
    return data[row] && data[row][col];
  }

  function pathPoint(point) {
    if (Array.isArray(point)) return [point[0], point[1]];
    if (point && point.row != null && point.col != null) return [point.row, point.col];
    return null;
  }

  function assignmentRatio(assignment) {
    return assignment.manpower / Math.max(1, assignment.targetManpower);
  }

  function distanceSquared(a, b) {
    var row = a.row - b.row;
    var col = a.col - b.col;
    return row * row + col * col;
  }

  function fillRatio(item) {
    return (item.manpower || 0) / Math.max(1, item.maxManpower || 0);
  }

  function powerValue(value) {
    if (typeof value === "number") return value;
    return value?.power || value?.total || value?.attack || value?.defense || 0;
  }

  function succeeded(result) {
    return !!result && result.ok !== false;
  }

  function sum(items, property) {
    return items.reduce(function (total, item) { return total + (item[property] || 0); }, 0);
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function hash(value) {
    var result = 0;
    for (var i = 0; i < value.length; i++) result = ((result << 5) - result) + value.charCodeAt(i);
    return result | 0;
  }

  function getTurnKey(civ) {
    if (typeof turn !== "undefined") return turn;
    return civ.years || 0;
  }

  function actionAvailable(state) {
    return state.actions.length < MAX_ACTIONS;
  }

  function record(state, action, detail) {
    state.actions.push({ action: action, detail: detail });
  }

  function debug(civOrName) {
    var civName = typeof civOrName === "string" ? civOrName : null;
    var civ = civName ? civs[civName] : civOrName;
    if (!civ) return null;
    if (!civName) {
      Object.keys(civs).some(function (name) {
        if (civs[name] !== civ) return false;
        civName = name;
        return true;
      });
    }
    var result = {
      plan: plan(civ, civName),
      actions: civ._militaryAI?.actions || []
    };
    console.log("MILITARY AI", civName, result);
    return result;
  }

  return publicAPI;
})();
