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

    var settings = api.getSettings(civName);
    var remainingTurnCap = Math.max(0, Math.floor((civ.pop || 0) * 0.1) - settings.conscriptedThisTurn);
    var remainingPopulation = Math.max(0, Math.floor((civ.pop || 0) * 0.9 - (civ.nextDecline || 0)));
    var manpower = Math.min(maxManpower, remainingTurnCap, remainingPopulation);
    if (manpower < 1) return { ok: false, reason: "population-cap" };

    var cost = api.legacyEquivalent(civ, manpower) * 2;
    if (!opts.ignoreCost && (civ.money || 0) < cost) return {
      ok: false,
      reason: "money",
      cost: cost
    };

    civ.money -= cost;
    civ.nextDecline = (civ.nextDecline || 0) + manpower;
    settings.conscriptedThisTurn += manpower;

    var division = api._addDivision({
      civ: civName,
      name: opts.name,
      row: row,
      col: col,
      manpower: manpower,
      maxManpower: manpower,
      experience: 1,
      morale: 1,
      entrenchment: 1,
      movesRemaining: opts.movesRemaining == null ? 5 : opts.movesRemaining,
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

    var capital = api.getCapital(queue.civ);
    if (!capital) return { ok: false, reason: "no-territory" };
    var manpower = queue.manpower;

    var division = api._addDivision({
      civ: queue.civ,
      name: opts.name || queue.name,
      row: capital[0],
      col: capital[1],
      manpower: manpower,
      maxManpower: queue.maxManpower,
      experience: queue.experience || 1,
      morale: 1,
      entrenchment: 1,
      movesRemaining: opts.movesRemaining == null ? 5 : opts.movesRemaining,
      moveLimit: 5,
      createdTurn: typeof turn == "number" ? turn : 0
    });

    api._removeQueue(queueId);
    resetGrowthRequests(queue.civ);
    return { ok: true, division: division, manpower: manpower };
  }

  function disbandDivision(id) {
    var division = api._removeDivision(id);
    if (!division) return { ok: false, reason: "missing-division" };
    returnPopulation(division.civ, division.manpower);
    resetGrowthRequests(division.civ);
    return { ok: true, manpower: division.manpower, division: division };
  }

  function cancelQueue(id) {
    var queue = api._removeQueue(id);
    if (!queue) return { ok: false, reason: "missing-queue" };
    returnPopulation(queue.civ, queue.manpower);
    resetGrowthRequests(queue.civ);
    return { ok: true, manpower: queue.manpower, queue: queue };
  }

  function returnPopulation(civName, manpower) {
    var civ = civs[civName];
    if (civ) civ.nextDecline = (civ.nextDecline || 0) - Math.max(0, Math.round(manpower));
  }

  function offerGrowth(civName, row, col, positiveGrowth) {
    positiveGrowth = Math.max(0, positiveGrowth || 0);
    var available = Math.floor(positiveGrowth * api.getSettings(civName).growthShare);
    var partKey = api.getPartKey(civName, row, col);
    var requests = getGrowthRequests(civName, partKey).map(function (request) {
      var deficit = Math.max(0, request.target.maxManpower - request.target.manpower);
      return {
        target: request.target,
        deficit: deficit,
        growthNeeded: Math.ceil(deficit / request.multiplier),
        multiplier: request.multiplier
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
      var gained = Math.min(request.deficit, request.growth * request.multiplier);
      if (!gained) return;
      var oldManpower = target.manpower;
      target.manpower += gained;
      target.experience = (oldManpower * (target.experience || 1) + gained) / target.manpower;
      target.recoveredLastTurn = (target.recoveredLastTurn || 0) + gained;
      if (request.multiplier == 2) recruited += gained;
      else recovered += gained;
    });
    api.updateCivTotal(civName);

    return {
      offered: positiveGrowth,
      diverted: diverted,
      civilianGrowth: positiveGrowth - diverted,
      recovered: recovered,
      recruited: recruited
    };
  }

  function getGrowthRequests(civName, partKey) {
    if (!growthRequests[civName]) {
      var byPart = growthRequests[civName] = {};
      api.getDivisions(civName).forEach(function (division) {
        var key = api.getPartKey(civName, division.row, division.col);
        (byPart[key] || (byPart[key] = [])).push({ target: division, multiplier: 1 });
      });
      api.getQueues(civName).forEach(function (queue) {
        var key = api.getPartKey(civName, queue.row, queue.col);
        (byPart[key] || (byPart[key] = [])).push({ target: queue, multiplier: 2 });
      });
    }
    return growthRequests[civName][partKey] || [];
  }

  function resetGrowthRequests(civName) {
    if (civName == null) growthRequests = {};
    else delete growthRequests[civName];
  }

  function getUpkeep(civName) {
    var civ = civs[civName];
    var manpower = api.getDivisions(civName).reduce(sumManpower, 0) +
      api.getQueues(civName).reduce(sumManpower, 0);
    var modifier = 1 + (((civ && civ.gov && civ.gov.mods) || {}).MUKCT || 0);
    return api.legacyEquivalent(civ, manpower) / 4 * Math.max(0, modifier);
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
        formation.manpower -= loss;
        returned += loss;
      });
      returnPopulation(civName, returned);
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
  api.resetGrowthRequests = resetGrowthRequests;
  api.getUpkeep = getUpkeep;
  api.processUpkeep = processUpkeep;

  return api;
})(Military);
