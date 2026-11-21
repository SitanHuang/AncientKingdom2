var Military = (function (api) {
  var growthRequests = {};

  function createRecruitQueue(civName, maxManpower, opts) {
    opts = opts || {};
    var civ = civs[civName];
    var capital = api.getCapital(civName);
    maxManpower = Math.round(maxManpower);
    if (!civ || !capital) return { ok: false, reason: "no-territory" };
    if (maxManpower < 1) return { ok: false, reason: "invalid-manpower" };

    var queue = api._addQueue({
      civ: civName,
      name: opts.name,
      maxHeavyEquipment: opts.maxHeavyEquipment,
      row: capital[0],
      col: capital[1],
      manpower: 0,
      maxManpower: maxManpower,
      experience: 1,
      createdTurn: typeof turn == "number" ? turn : 0
    });
    resetGrowthRequests(civName);
    return { ok: true, queue: queue };
  }

  function conscript(civName, row, col, maxManpower, opts) {
    opts = opts || {};
    var civ = civs[civName];
    var tile = data[row] && data[row][col];
    if (!civ || !tile || tile.color != civName) return { ok: false, reason: "not-owned" };

    maxManpower = Math.round(maxManpower);
    if (maxManpower < 1) return { ok: false, reason: "invalid-manpower" };

    api.getCivStats(civName);
    var culture = civ.culture || civName;
    var sources = [];
    var totalAvailable = 0;
    var pending = [[row, col]];
    var seen = new Set([row + ':' + col]);
    while (pending.length) {
      var [r, c] = pending.pop();
      var cell = popv2?.map?.[r]?.[c];
      if (cell?.pop?.[culture]) {
        var available = Math.floor(Math.min(cell.pop[culture], populationTotal(cell) - 2500));
        if (available > 0) {
          sources.push({ row: r, col: c, available: available });
          totalAvailable += available;
        }
      }
      for (const point of api.getNeighbors(r, c)) {
        const key = point.join(':');
        if (seen.has(key) || data[point[0]][point[1]].color !== civName) continue;
        seen.add(key);
        pending.push(point);
      }
    }
    var turnCap = Math.floor(((civ.pop || 0) + civ.conscriptedThisTurn) * 0.1);
    var manpower = Math.min(maxManpower, turnCap - civ.conscriptedThisTurn, totalAvailable);
    if (manpower < 1) return { ok: false, reason: "population-cap" };

    var cost = api.legacyEquivalent(civ, manpower) * 2;
    if (!opts.ignoreCost && (civ.money || 0) < cost) return {
      ok: false,
      reason: "money",
      cost: cost
    };

    civ.money -= cost;
    var left = manpower;
    sources.forEach(function (source) {
      var taken = Math.min(left, Math.round(left * source.available / totalAvailable));
      changePopulation(source.row, source.col, culture, -taken);
      left -= taken;
      totalAvailable -= source.available;
    });
    changeCivilianTotal(civ, culture, -manpower);
    civ.conscriptedThisTurn += manpower;

    var division = api._addDivision({
      civ: civName,
      name: opts.name,
      maxHeavyEquipment: opts.maxHeavyEquipment,
      row: row,
      col: col,
      manpower: manpower,
      maxManpower: manpower,
      experience: 0.5,
      morale: 0.8,
      entrenchment: 0.8,
      movesRemaining: opts.movesRemaining == null ? 2 : opts.movesRemaining,
      moveLimit: 5,
      createdTurn: typeof turn == "number" ? turn : 0
    });
    resetGrowthRequests(civName);

    return {
      ok: true,
      division: division,
      manpower: manpower,
      requestedManpower: maxManpower,
      cost: cost
    };
  }

  function deployQueue(queueId, opts) {
    opts = opts || {};
    var queue = api.getQueue(queueId);
    if (!queue) return { ok: false, reason: "missing-queue" };
    if (queue.manpower < 1) return { ok: false, reason: "empty-queue" };

    var useQueueTile = opts.row === queue.row && opts.col === queue.col && data[queue.row]?.[queue.col]?.color === queue.civ;
    var location = useQueueTile ? [queue.row, queue.col] : api.getCapital(queue.civ);
    if (!location) return { ok: false, reason: "no-territory" };
    var manpower = queue.manpower;

    var division = api._addDivision({
      civ: queue.civ,
      name: opts.name || queue.name,
      maxHeavyEquipment: queue.maxHeavyEquipment,
      heavyEquipment: queue.heavyEquipment,
      row: location[0],
      col: location[1],
      manpower: manpower,
      recruits: queue.recruits,
      maxManpower: queue.maxManpower,
      experience: queue.experience || 1,
      morale: 1,
      entrenchment: 1,
      movesRemaining: opts.movesRemaining == null ? 5 : opts.movesRemaining,
      moveLimit: 5,
      recoveredLastTurn: queue.recoveredLastTurn || 0,
      recoveredThisTurn: queue.recoveredThisTurn || 0,
      createdTurn: typeof turn == "number" ? turn : 0
    });

    api._removeQueue(queueId);
    resetGrowthRequests(queue.civ);
    return { ok: true, division: division, manpower: manpower };
  }

  function disbandDivision(id) {
    var division = api._removeDivision(id);
    if (!division) return { ok: false, reason: "missing-division" };
    api.returnEquipment(division, division.heavyEquipment);
    returnPopulation(division, division.manpower);
    resetGrowthRequests(division.civ);
    return { ok: true, manpower: division.manpower, division: division };
  }

  function cancelQueue(id) {
    var queue = api._removeQueue(id);
    if (!queue) return { ok: false, reason: "missing-queue" };
    api.returnEquipment(queue, queue.heavyEquipment);
    returnPopulation(queue, queue.manpower);
    resetGrowthRequests(queue.civ);
    return { ok: true, manpower: queue.manpower, queue: queue };
  }

  function populationTotal(cell) {
    return cell.totPop ?? Object.values(cell.pop).reduce((sum, n) => sum + n, 0);
  }

  function changePopulation(row, col, culture, amount) {
    var cell = popv2.map[row][col];
    var total = populationTotal(cell);
    cell.pop[culture] = (cell.pop[culture] || 0) + amount;
    cell.hist ??= {};
    cell.hist[culture] ??= 0;
    data[row][col].pop = cell.totPop = total + amount;
  }

  function changeCivilianTotal(civ, culture, amount) {
    civ.pop = Math.max(0, (civ.pop || 0) + amount);
    if (civ._poptable) {
      civ._poptable[culture] = Math.max(0, (civ._poptable[culture] || 0) + amount);
      civ._poptable_tot = Math.max(0, (civ._poptable_tot || 0) + amount);
    }
  }

  function removeRecruits(formation, manpower) {
    var removed = {};
    var total = Object.values(formation.recruits).reduce((sum, n) => sum + n, 0);
    var left = Math.round(manpower);
    for (const [culture, count] of Object.entries(formation.recruits)) {
      if (!count || !left) continue;
      var amount = Math.min(count, left, Math.round(left * count / total));
      removed[culture] = amount;
      formation.recruits[culture] -= amount;
      total -= count;
      left -= amount;
    }
    return removed;
  }
  api.removeRecruits = removeRecruits;

  function returnPopulation(formation, manpower) {
    var removed = removeRecruits(formation, manpower);
    var point = [formation.row, formation.col];
    if (data[point[0]]?.[point[1]]?.color !== formation.civ) point = api.getCapital(formation.civ);
    if (!point || !popv2?.map?.[point[0]]?.[point[1]]) return;
    var civ = civs[formation.civ];
    for (const [culture, amount] of Object.entries(removed)) {
      changePopulation(point[0], point[1], culture, amount);
      changeCivilianTotal(civ, culture, amount);
    }
  }

  function offerGrowth(civName, row, col, positiveGrowth, eligibleGrowth) {
    positiveGrowth = Math.max(0, Math.floor(positiveGrowth || 0));
    var culture = civs[civName].culture || civName;
    var cell = popv2?.map?.[row]?.[col];
    var eligible = Math.min(positiveGrowth, eligibleGrowth ?? (cell ? positiveGrowth * (cell.pop[culture] || 0) / Math.max(1, populationTotal(cell)) : 0));
    var available = Math.floor(eligible * api.getSettings(civName).growthShare);
    var partKey = api.getPartKey(civName, row, col);
    var requests = getGrowthRequests(civName, partKey).map(function (request) {
      var deficit = Math.max(0, request.target.maxManpower - request.target.manpower);
      return {
        target: request.target,
        deficit: deficit,
        growthNeeded: Math.ceil(deficit / request.multiplier),
        multiplier: request.multiplier,
        recruited: request.recruited
      };
    }).filter(function (request) { return request.deficit > 0; });

    var needed = requests.reduce(function (sum, request) { return sum + request.growthNeeded; }, 0);
    var diverted = Math.min(available, needed);
    if (!diverted) return {
      offered: positiveGrowth,
      diverted: 0,
      civilianGrowth: positiveGrowth,
      recovered: 0,
      recruited: 0
    };

    var assigned = 0;
    requests.forEach(function (request) {
      var exact = diverted * request.growthNeeded / needed;
      request.growth = Math.min(request.growthNeeded, Math.floor(exact));
      request.remainder = exact - request.growth;
      assigned += request.growth;
    });
    requests.sort(function (a, b) { return b.remainder - a.remainder; });
    for (var i = 0; assigned < diverted && i < requests.length; i++, assigned++) {
      requests[i].growth++;
    }

    var recovered = 0;
    var recruited = 0;
    requests.forEach(function (request) {
      var target = request.target;
      var recoveryChance = request.recruited
        ? 0.75 * getTaxEfficiency(civName, target.row, target.col)
        : getRecoveryChance(civName, target.row, target.col);
      if (Math.random() >= recoveryChance) return;
      var gained = Math.min(Math.round(Math.min(request.deficit, request.growth * request.multiplier) * 0.7),
        eligible - recruited - recovered, cell.pop[culture] || 0, Math.max(0, populationTotal(cell) - 2500));
      if (!gained) return;
      var oldManpower = target.manpower;
      var gainedExperience = request.recruited ? 1 : 0.9;
      changePopulation(row, col, culture, -gained);
      target.recruits[culture] = (target.recruits[culture] || 0) + gained;
      target.manpower += gained;
      target.experience = (oldManpower * (target.experience || 1) + gained * gainedExperience) /
        target.manpower;
      target.recoveredThisTurn = (target.recoveredThisTurn || 0) + gained;
      if (request.recruited) {
        recruited += gained;
      } else {
        recovered += gained;
      }
    });
    api.updateCivTotal(civName);

    return {
      offered: positiveGrowth,
      diverted: recruited + recovered,
      civilianGrowth: positiveGrowth - recruited - recovered,
      recovered: recovered,
      recruited: recruited
    };
  }

  function getRecoveryMultiplier(civName) {
    var civ = civs[civName];
    if (!civ) return 1;
    return 1 + 100 / api.menPerLegacyUnit(civ);
  }

  function getRecoveryChance(civName, row, col) {
    var civ = civs[civName];
    if (!civ) return 0;
    var countryScale = api.clamp(0.5 + 300 / api.menPerLegacyUnit(civ), 0.5, 1);
    return 0.75 * countryScale * getTaxEfficiency(civName, row, col);
  }

  function getGrowthRequests(civName, partKey) {
    if (!growthRequests[civName]) {
      var byPart = growthRequests[civName] = {};
      api.getDivisions(civName).forEach(function (division) {
        var key = api.getPartKey(civName, division.row, division.col);
        (byPart[key] || (byPart[key] = [])).push({
          target: division,
          multiplier: getRecoveryMultiplier(civName),
          recruited: false
        });
      });
      api.getQueues(civName).forEach(function (queue) {
        var key = api.getPartKey(civName, queue.row, queue.col);
        (byPart[key] || (byPart[key] = [])).push({
          target: queue,
          multiplier: 2,
          recruited: true
        });
      });
    }
    return growthRequests[civName][partKey] || [];
  }

  function resetGrowthRequests(civName) {
    if (civName == null) growthRequests = {};
    else delete growthRequests[civName];
  }

  function getUpkeep(civName) {
    var scale = getUpkeepScale(civName);
    return api.getDivisions(civName).concat(api.getQueues(civName)).reduce(function (sum, formation) {
      return sum + getFormationUpkeep(formation, scale);
    }, 0);
  }

  function getUpkeepScale(civName) {
    var manpower = api.getDivisions(civName).reduce(sumManpower, 0) +
      api.getQueues(civName).reduce(sumManpower, 0);
    return Math.max(1, Math.pow(manpower / 550000, 2));
  }

  function getTaxEfficiency(civName, row, col) {
    var civ = civs[civName];
    if (!civ || row == null || col == null || typeof regions_taxEff != "function") return 1;
    return api.clamp(regions_taxEff(civ, civName, row, col) || 0.1, 0.1, 1);
  }

  function getUpkeepPerManAt(civName, row, col) {
    var civ = civs[civName];
    if (!civ) return 0;
    var modifier = 1 + (((civ.gov || {}).mods || {}).MUKCT || 0);
    return Math.max(0, modifier) * getUpkeepScale(civName) /
      (4 * api.menPerLegacyUnit(civ) * getTaxEfficiency(civName, row, col));
  }

  function getFormationUpkeep(formation, scale) {
    if (!formation) return 0;
    var civ = civs[formation.civ];
    if (!civ) return 0;
    var modifier = 1 + (((civ.gov || {}).mods || {}).MUKCT || 0);
    if (scale == null) scale = getUpkeepScale(formation.civ);
    return api.legacyEquivalent(civ, Math.max(0, formation.manpower || 0)) / 4 *
      Math.max(0, modifier) * scale /
      getTaxEfficiency(formation.civ, formation.row, formation.col) *
      (1 + api.equipmentBalance.upkeepShare * api.getHardness(formation));
  }

  function sumManpower(sum, formation) {
    return sum + formation.manpower;
  }

  function processUpkeep(civName) {
    var civ = civs[civName];
    if (!civ) return { ok: false, reason: "missing-civ" };
    var divisions = api.getDivisions(civName);
    var queues = api.getQueues(civName);
    var formations = divisions.concat(queues);
    var needed = getUpkeep(civName);
    var available = Math.max(0, civ.money || 0) * api.getSettings(civName).maxUpkeepShare;
    var paid = Math.min(needed, available);
    var fundedRatio = needed ? paid / needed : 1;
    var returned = 0;

    civ.money -= paid;
    if (fundedRatio < 1) {
      formations.forEach(function (formation) {
        var loss = Math.min(formation.manpower, Math.round(
          Math.max(1000, formation.manpower * 0.1)
        ));
        var equipment = formation.heavyEquipment;
        returnPopulation(formation, loss);
        formation.manpower -= loss;
        api.normalizeEquipment(formation);
        api.returnEquipment(formation, equipment - formation.heavyEquipment);
        returned += loss;
      });

      divisions.forEach(function (division) {
        if (division.manpower <= 0) api._removeDivision(division.id);
      });
    }

    api.updateCivTotal(civName);
    civ.militaryUpkeep = {
      needed: needed,
      paid: paid,
      fundedRatio: fundedRatio,
      deserted: returned,
      activeManpower: api.getDivisions(civName).reduce(sumManpower, 0),
      queuedManpower: api.getQueues(civName).reduce(sumManpower, 0)
    };
    return Object.assign({ ok: true }, civ.militaryUpkeep);
  }

  api.createRecruitQueue = createRecruitQueue;
  api.deployQueue = deployQueue;
  api.conscript = conscript;
  api.disbandDivision = disbandDivision;
  api.cancelQueue = cancelQueue;
  api.returnPopulation = returnPopulation;
  api.offerGrowth = offerGrowth;
  api.divertGrowth = offerGrowth;
  api.getRecoveryMultiplier = getRecoveryMultiplier;
  api.getRecoveryChance = getRecoveryChance;
  api.resetGrowthRequests = resetGrowthRequests;
  api.getTaxEfficiency = getTaxEfficiency;
  api.getUpkeepScale = getUpkeepScale;
  api.getUpkeepPerManAt = getUpkeepPerManAt;
  api.getFormationUpkeep = getFormationUpkeep;
  api.getUpkeep = getUpkeep;
  api.processUpkeep = processUpkeep;

  return api;
})(Military);
