var military = typeof military == "object" && military ? military : {};

var Military = (function (api) {
  var tileIndex = {};
  var civIndex = {};
  var queueIndex = {};
  var indexDirty = true;

  function init(saved) {
    if (saved) military = saved;

    military.divisions = military.divisions || {};
    military.queues = military.queues || {};
    military.civSettings = military.civSettings || {};
    military.nextDivisionId = military.nextDivisionId || nextNumber(military.divisions);
    military.nextQueueId = military.nextQueueId || nextNumber(military.queues);

    Object.values(military.divisions).forEach(setDivisionDefaults);
    Object.values(military.queues).forEach(setQueueDefaults);
    indexDirty = true;
    updateCivTotals();
    return military;
  }

  function nextNumber(objects) {
    var highest = 0;
    Object.keys(objects || {}).forEach(function (id) {
      highest = Math.max(highest, parseInt(String(id).replace(/\D/g, "")) || 0);
    });
    return highest + 1;
  }

  function setDivisionDefaults(division) {
    division.id = division.id || "d" + military.nextDivisionId++;
    division.name = division.name || "Division " + String(division.id).replace(/\D/g, "");
    division.manpower = Math.max(0, Math.round(division.manpower || 0));
    division.maxManpower = Math.max(division.manpower, Math.round(division.maxManpower || division.manpower));
    division.experience = division.experience || 1;
    division.morale = division.morale || 1;
    division.entrenchment = division.entrenchment || 1;
    division.moveLimit = division.moveLimit == null ? 5 : division.moveLimit;
    division.movesRemaining = division.movesRemaining == null ? division.moveLimit : division.movesRemaining;
    division.pendingMovePenalty = division.pendingMovePenalty || 0;
    division.recoveredLastTurn = division.recoveredLastTurn || 0;
    division.recoveredThisTurn = division.recoveredThisTurn || 0;
    if (division.armyColor !== "red") delete division.armyColor;
    return division;
  }

  function setQueueDefaults(queue) {
    queue.id = queue.id || "q" + military.nextQueueId++;
    queue.name = queue.name || "Division " + String(queue.id).replace(/\D/g, "");
    queue.manpower = Math.max(0, Math.round(queue.manpower || 0));
    queue.maxManpower = Math.max(queue.manpower, Math.round(queue.maxManpower || queue.manpower));
    queue.experience = queue.experience || 1;
    queue.recoveredLastTurn = queue.recoveredLastTurn || 0;
    queue.recoveredThisTurn = queue.recoveredThisTurn || 0;
    return queue;
  }

  function getSettings(civName) {
    var settings = military.civSettings[civName] || (military.civSettings[civName] = {});
    if (settings.growthShare == null) settings.growthShare = 0.5;
    if (settings.maxUpkeepShare == null) settings.maxUpkeepShare = 1;
    settings.conscriptedThisTurn = settings.conscriptedThisTurn || 0;
    settings.casualtiesSufferedThisTurn = settings.casualtiesSufferedThisTurn || 0;
    settings.casualtiesInflictedThisTurn = settings.casualtiesInflictedThisTurn || 0;
    settings.casualtiesSufferedLastTurn = settings.casualtiesSufferedLastTurn || 0;
    settings.casualtiesInflictedLastTurn = settings.casualtiesInflictedLastTurn || 0;
    return settings;
  }

  function setGrowthShare(civName, share) {
    return getSettings(civName).growthShare = clamp(share, 0, 1);
  }

  function setMaxUpkeepShare(civName, share) {
    return getSettings(civName).maxUpkeepShare = clamp(share, 0, 1);
  }

  function rebuildIndexes() {
    if (!indexDirty) return;
    tileIndex = {};
    civIndex = {};
    queueIndex = {};

    Object.values(military.divisions).forEach(function (division) {
      var tileKey = division.row + ":" + division.col;
      (tileIndex[tileKey] || (tileIndex[tileKey] = [])).push(division);
      (civIndex[division.civ] || (civIndex[division.civ] = [])).push(division);
    });
    Object.values(military.queues).forEach(function (queue) {
      (queueIndex[queue.civ] || (queueIndex[queue.civ] = [])).push(queue);
    });
    indexDirty = false;
  }

  function getDivisions(civName) {
    rebuildIndexes();
    return civName == null ? Object.values(military.divisions) : (civIndex[civName] || []).slice();
  }

  function getDivisionsAt(row, col, civName) {
    rebuildIndexes();
    var divisions = tileIndex[row + ":" + col] || [];
    return (civName == null ? divisions : divisions.filter(function (division) {
      return division.civ == civName;
    })).slice();
  }

  function getQueues(civName) {
    rebuildIndexes();
    return civName == null ? Object.values(military.queues) : (queueIndex[civName] || []).slice();
  }

  function addDivision(fields, deferTotal) {
    var division = setDivisionDefaults(Object.assign({}, fields));
    if (military.divisions[division.id]) division.id = "d" + military.nextDivisionId++;
    military.divisions[division.id] = division;
    indexDirty = true;
    if (!deferTotal) updateCivTotal(division.civ);
    return division;
  }

  function addQueue(fields) {
    var queue = setQueueDefaults(Object.assign({}, fields));
    if (military.queues[queue.id]) queue.id = "q" + military.nextQueueId++;
    military.queues[queue.id] = queue;
    indexDirty = true;
    return queue;
  }

  function removeDivision(id) {
    var division = military.divisions[id];
    if (!division) return null;
    delete military.divisions[id];
    indexDirty = true;
    updateCivTotal(division.civ);
    return division;
  }

  function setDivisionArmy(id, color) {
    var division = military.divisions[id];
    if (!division) return { ok: false, reason: "missing-division" };
    if (color == null || color === "none") delete division.armyColor;
    else if (color === "red") division.armyColor = color;
    else return { ok: false, reason: "invalid-army-color" };
    return { ok: true, division: division, armyColor: division.armyColor || null };
  }

  function removeQueue(id) {
    var queue = military.queues[id];
    if (!queue) return null;
    delete military.queues[id];
    indexDirty = true;
    return queue;
  }

  function moveDivision(division, row, col) {
    division.row = row;
    division.col = col;
    indexDirty = true;
  }

  function resolveDivisions(ids) {
    return (ids || []).map(function (value) {
      return typeof value == "object" ? value : military.divisions[value];
    }).filter(Boolean);
  }

  function menPerLegacyUnit(civ) {
    if (typeof civ == "string") civ = civs[civ];
    return 100 * (1 + ((civ && civ.ii) || 0) / 10);
    // return 400 * (1 + ((civ && civ.ii) || 0) / 1000);
  }

  function legacyEquivalent(civ, manpower) {
    return 1 * manpower / menPerLegacyUnit(civ);
    // return manpower / menPerLegacyUnit(civ) * Math.max(1, (1.0 + manpower * (0.9 + ((civ && civ.ii) || 0) / 10) / ((civ.pop || 0) + 1))) ** 10;
  }

  function getPartKey(civName, row, col) {
    var civ = civs[civName];
    if (!civ || typeof regions_genCountryParts != "function") return civName + ":0";
    var parts = regions_genCountryParts(civ, civName);
    var part = parts.map[row + ":" + col];
    return civName + ":" + (part == null ? "detached" : part);
  }

  function getCapital(civName) {
    var civ = civs[civName];
    if (!civ) return null;
    if (typeof regions_genCountryParts == "function") {
      var parts = regions_genCountryParts(civ, civName);
      if (parts.supplyCenter) return parts.supplyCenter.slice(0, 2);
    }
    if (civ.birth && data[civ.birth[0]] && data[civ.birth[0]][civ.birth[1]] &&
      data[civ.birth[0]][civ.birth[1]].color == civName) return civ.birth.slice(0, 2);
    for (var row = 0; row < data.length; row++) {
      for (var col = 0; col < data[row].length; col++) {
        if (data[row][col] && data[row][col].color == civName) return [row, col];
      }
    }
    return null;
  }

  function cellTypeName(type) {
    if (!type) return null;
    if (typeof cellTypeId == "function") return cellTypeId(type);
    for (var name in types) {
      if (type === types[name] || (type.draw && types[name].draw &&
        type.draw.toString() == types[name].draw.toString())) return name;
    }
    return type.id;
  }

  function getBuildingBonus(row, col) {
    var tile = data[row] && data[row][col];
    if (!tile || !tile.type) return 1;
    var canonical = types[cellTypeName(tile.type)] || tile.type;
    if (canonical.defenseBonus != null) return 1 + canonical.defenseBonus;
    return 1;
  }

  function migrateLegacyCells() {
    var migrated = 0;
    init();
    for (var row = 0; row < data.length; row++) {
      for (var col = 0; col < data[row].length; col++) {
        var tile = data[row][col];
        if (!tile || !tile.type || tile.type.val == null) continue;
        var civ = civs[tile.color];
        var ratio = menPerLegacyUnit(civ);
        var current = Math.max(0, Math.round(tile.type.val * ratio));
        var maximum = Math.max(current, Math.round((tile.type.oVal || tile.type.val) * ratio));
        addDivision({
          civ: tile.color,
          row: row,
          col: col,
          manpower: current,
          maxManpower: maximum,
          experience: 1,
          morale: 1,
          entrenchment: 1
        }, true);
        tile.type = tile._militaryUnderlyingType || types.land;
        delete tile._militaryUnderlyingType;
        migrated++;
      }
    }
    updateCivTotals();
    return migrated;
  }

  function updateCivTotal(civName) {
    if (!civs[civName]) return;
    rebuildIndexes();
    civs[civName].military = (civIndex[civName] || []).reduce(function (sum, division) {
      return sum + division.manpower;
    }, 0);
  }

  function updateCivTotals() {
    if (typeof civs == "undefined") return;
    Object.keys(civs).forEach(updateCivTotal);
  }

  function recordCasualties(civName, suffered, inflicted) {
    var settings = getSettings(civName);
    settings.casualtiesSufferedThisTurn += Math.max(0, Math.round(suffered || 0));
    settings.casualtiesInflictedThisTurn += Math.max(0, Math.round(inflicted || 0));
  }

  function getCasualtyReport(civName) {
    var settings = getSettings(civName);
    return {
      suffered: settings.casualtiesSufferedLastTurn + settings.casualtiesSufferedThisTurn,
      inflicted: settings.casualtiesInflictedLastTurn + settings.casualtiesInflictedThisTurn,
      sufferedLastTurn: settings.casualtiesSufferedLastTurn,
      inflictedLastTurn: settings.casualtiesInflictedLastTurn,
      sufferedThisTurn: settings.casualtiesSufferedThisTurn,
      inflictedThisTurn: settings.casualtiesInflictedThisTurn
    };
  }

  function beginTurn(civName) {
    var settings = getSettings(civName);
    settings.conscriptedThisTurn = 0;
    settings.casualtiesSufferedLastTurn = settings.casualtiesSufferedThisTurn;
    settings.casualtiesInflictedLastTurn = settings.casualtiesInflictedThisTurn;
    settings.casualtiesSufferedThisTurn = 0;
    settings.casualtiesInflictedThisTurn = 0;
    getDivisions(civName).forEach(function (division) {
      if (!division.movedThisTurn) {
        division.entrenchment = clamp(division.entrenchment + 0.25, 1, 2);
      }
      division.morale += division.morale < 1 ? Math.min(0.2, 1 - division.morale) :
        -Math.min(0.1, division.morale - 1);
      division.moveLimit = Math.max(0, 5 - Math.min(1, division.pendingMovePenalty || 0));
      division.movesRemaining = division.moveLimit;
      division.pendingMovePenalty = 0;
      division.movedThisTurn = false;
      division.recoveredLastTurn = division.recoveredThisTurn || 0;
      division.recoveredThisTurn = 0;
    });
    var capital = getCapital(civName);
    getQueues(civName).forEach(function (queue) {
      queue.recoveredLastTurn = queue.recoveredThisTurn || 0;
      queue.recoveredThisTurn = 0;
      if (capital) {
        queue.row = capital[0];
        queue.col = capital[1];
      }
    });
    if (api.resetGrowthRequests) api.resetGrowthRequests(civName);
    updateCivTotal(civName);
  }

  function clamp(value, min, max) {
    value = Number(value) || 0;
    return Math.max(min, Math.min(max, value));
  }

  api.init = init;
  api.migrateLegacyCells = migrateLegacyCells;
  api.getSettings = getSettings;
  api.setGrowthShare = setGrowthShare;
  api.setMaxUpkeepShare = setMaxUpkeepShare;
  api.getDivisions = getDivisions;
  api.getDivisionsAt = getDivisionsAt;
  api.getQueues = getQueues;
  api.getDivision = function (id) { return military.divisions[id]; };
  api.getQueue = function (id) { return military.queues[id]; };
  api.setDivisionArmy = setDivisionArmy;
  api.resolveDivisions = resolveDivisions;
  api.menPerLegacyUnit = menPerLegacyUnit;
  api.legacyEquivalent = legacyEquivalent;
  api.getPartKey = getPartKey;
  api.getCapital = getCapital;
  api.cellTypeName = cellTypeName;
  api.getBuildingBonus = getBuildingBonus;
  api.beginTurn = beginTurn;
  api.updateCivTotal = updateCivTotal;
  api.updateCivTotals = updateCivTotals;
  api.recordCasualties = recordCasualties;
  api.getCasualtyReport = getCasualtyReport;
  api.clamp = clamp;
  api._addDivision = addDivision;
  api._addQueue = addQueue;
  api._removeDivision = removeDivision;
  api._removeQueue = removeQueue;
  api._moveDivision = moveDivision;
  api._touch = function () { indexDirty = true; };

  return api;
})(typeof Military == "object" && Military ? Military : {});
