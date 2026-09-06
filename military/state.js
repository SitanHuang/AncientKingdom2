var military = typeof military == "object" && military ? military : {};

var Military = (function (api) {
  var armyColors = { purple: "#4a148c", red: "#b71c1c", blue: "#0d47a1",
    green: "#109020", olive: "#827717", orange: "#e65100", charcoal: "#302f2f" };
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

    Object.keys(civs).forEach(getCivStats);
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
    division.moveTargets = Array.isArray(division.moveTargets) ? division.moveTargets.filter(function (point) {
      return Array.isArray(point) && point.length == 2 && point.every(Number.isInteger);
    }).map(function (point) { return point.slice(); }) : [];
    if (!Object.prototype.hasOwnProperty.call(armyColors, division.armyColor)) delete division.armyColor;
    api.normalizeEquipment(division);
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
    api.normalizeEquipment(queue);
    return queue;
  }

  function getSettings(civName) {
    var settings = military.civSettings[civName] || (military.civSettings[civName] = {});
    if (!Number.isFinite(settings.factoryProductionShare)) settings.factoryProductionShare = 1;
    settings.factoryProductionShare = clamp(settings.factoryProductionShare, 0, 1);
    if (settings.growthShare == null) settings.growthShare = 0.5;
    if (settings.maxUpkeepShare == null) settings.maxUpkeepShare = 1;
    return settings;
  }

  function getCivStats(civName) {
    var civ = civs[civName];
    if (!civ) return null;
    var old = military.civSettings[civName] || {};
    var counters = ['conscriptedThisTurn', 'casualtiesSufferedThisTurn', 'casualtiesInflictedThisTurn',
      'casualtiesSufferedLastTurn', 'casualtiesInflictedLastTurn', 'heavyEquipmentStock'];
    counters.concat(['equipmentProduction', 'equipmentProductionTurn', 'lastEquipmentBattle']).forEach(function (key) {
      if (civ[key] == null && old[key] != null) civ[key] = old[key];
      delete old[key];
    });
    counters.forEach(function (key) { civ[key] = Number.isFinite(civ[key]) ? Math.max(0, civ[key]) : 0; });
    return civ;
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
    updateCivTotal(queue.civ);
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
    else if (Object.prototype.hasOwnProperty.call(armyColors, color)) division.armyColor = color;
    else return { ok: false, reason: "invalid-army-color" };
    return { ok: true, division: division, armyColor: division.armyColor || null };
  }

  function removeQueue(id) {
    var queue = military.queues[id];
    if (!queue) return null;
    delete military.queues[id];
    indexDirty = true;
    updateCivTotal(queue.civ);
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
    if (!getCivStats(civName)) return;
    rebuildIndexes();
    civs[civName].military = (civIndex[civName] || []).reduce(function (sum, division) {
      return sum + division.manpower;
    }, 0);
    civs[civName].deployedHeavyEquipment = (civIndex[civName] || []).reduce(function (sum, division) {
      return sum + (division.heavyEquipment || 0);
    }, 0);
    civs[civName].queuedHeavyEquipment = (queueIndex[civName] || []).reduce(function (sum, queue) {
      return sum + (queue.heavyEquipment || 0);
    }, 0);
  }

  function updateCivTotals() {
    if (typeof civs == "undefined") return;
    Object.keys(civs).forEach(updateCivTotal);
  }

  function recordCasualties(civName, suffered, inflicted) {
    var stats = getCivStats(civName);
    if (!stats) return;
    stats.casualtiesSufferedThisTurn += Math.max(0, Math.round(suffered || 0));
    stats.casualtiesInflictedThisTurn += Math.max(0, Math.round(inflicted || 0));
  }

  function getCasualtyReport(civName) {
    var stats = getCivStats(civName);
    stats = stats || {casualtiesSufferedThisTurn:0,casualtiesInflictedThisTurn:0,casualtiesSufferedLastTurn:0,casualtiesInflictedLastTurn:0};
    return {
      suffered: stats.casualtiesSufferedLastTurn + stats.casualtiesSufferedThisTurn,
      inflicted: stats.casualtiesInflictedLastTurn + stats.casualtiesInflictedThisTurn,
      sufferedLastTurn: stats.casualtiesSufferedLastTurn,
      inflictedLastTurn: stats.casualtiesInflictedLastTurn,
      sufferedThisTurn: stats.casualtiesSufferedThisTurn,
      inflictedThisTurn: stats.casualtiesInflictedThisTurn
    };
  }

  function beginTurn(civName) {
    var stats = getCivStats(civName);
    if (!stats) return;
    stats.conscriptedThisTurn = 0;
    stats.casualtiesSufferedLastTurn = stats.casualtiesSufferedThisTurn;
    stats.casualtiesInflictedLastTurn = stats.casualtiesInflictedThisTurn;
    stats.casualtiesSufferedThisTurn = 0;
    stats.casualtiesInflictedThisTurn = 0;
    getDivisions(civName).forEach(function (division) {
      if (!division.movedThisTurn) {
        division.entrenchment = clamp(division.entrenchment + 0.25, 1, 2);
      }
      division.morale += division.morale < 1 ? Math.min(0.2, 1 - division.morale) :
        -Math.min(0.1, division.morale - 1);
      division.moveLimit = Math.max(0, 5 - Math.min(1, division.pendingMovePenalty || 0));
      division.movesRemaining = division.moveLimit;
      delete division.movePlanWaiting;
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
    if (api.executeTurnOrders) api.executeTurnOrders(civName);
    updateCivTotal(civName);
  }

  function clamp(value, min, max) {
    value = Number(value) || 0;
    return Math.max(min, Math.min(max, value));
  }

  api.armyColors = armyColors;
  api.init = init;
  api.migrateLegacyCells = migrateLegacyCells;
  api.getSettings = getSettings;
  api.getCivStats = getCivStats;
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

// Heavy equipment is additive saved state; terrain inspection never changes stock or cash.
var Military = (function (api) {
  var balance = { menPerEquipment: 100, refillShare: 0.25, upkeepShare: 0.5,
    factoryPrice: 250, factoryUpkeep: 2, factoryOutput: 10, sizeScale: 100, constructionSizeScale: 200 };
  function finite(value) { return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0; }
  function normalize(formation) {
    formation.maxHeavyEquipment = Math.min(finite(formation.maxHeavyEquipment), finite(formation.maxManpower) / balance.menPerEquipment);
    formation.heavyEquipment = Math.min(finite(formation.heavyEquipment), capacity(formation));
  }
  function capacity(f) { return Math.min(finite(f.maxHeavyEquipment), finite(f.manpower) / balance.menPerEquipment); }
  function hardness(f) { return f.manpower > 0 ? api.clamp(finite(f.heavyEquipment) * balance.menPerEquipment / f.manpower, 0, 1) : 0; }
  function supplied(f) {
    var capital = api.getCapital(f.civ), tile = data[f.row] && data[f.row][f.col];
    return !!(capital && tile && tile.color == f.civ &&
      api.getPartKey(f.civ, f.row, f.col) == api.getPartKey(f.civ, capital[0], capital[1]));
  }
  function stock(civName) { return finite((api.getCivStats(civName) || {}).heavyEquipmentStock); }
  function returnEquipment(f, amount) {
    if (supplied(f)) civs[f.civ].heavyEquipmentStock = stock(f.civ) + finite(amount);
  }
  function setCap(f, value) {
    if (typeof f == 'string') f = api.getDivision(f) || api.getQueue(f);
    if (!f) return false;
    var previous = finite(f.heavyEquipment);
    f.maxHeavyEquipment = finite(value);
    normalize(f);
    returnEquipment(f, previous - f.heavyEquipment);
    api.updateCivTotal(f.civ);
    return true;
  }
  function lose(f, lostMen) {
    f.heavyEquipment = finite(f.heavyEquipment) * Math.max(0, 1 - lostMen / Math.max(1, f.manpower));
  }
  function resource(row, col) {
    var tile = data[row] && data[row][col];
    var p = typeof res_pop_mod == 'function' && tile ? res_pop_mod(row, col) : NaN;
    var e = typeof res_econ_mod == 'function' && tile ? res_econ_mod(row, col) : NaN;
    var potential = p < 0.4 && e > 0.8 ? 2 + 8 * api.clamp((0.4 - p) / 0.22, 0, 1) * api.clamp(e - 1, 0, 1) : 0;
    var owner = tile && civs[tile.color];
    var populations = typeof popv2 == 'object' && popv2 && popv2.map &&
      popv2.map[row] && popv2.map[row][col] && popv2.map[row][col].pop;
    var totalPopulation = Object.values(populations || {}).reduce(function (sum, population) {
      return sum + finite(population);
    }, 0);
    // Each ruling-culture resident contributes, even when that culture is a minority.
    var cultureShare = owner && owner.culture != null && totalPopulation > 0 ?
      api.clamp(finite(populations[owner.culture]) / totalPopulation, 0, 1) : 0;
    return { potential: potential, output: potential * cultureShare, cultureShare: cultureShare, popMod: p, econMod: e,
      reason: !potential ? 'Terrain does not qualify' : !owner ? 'Unowned' : !totalPopulation ? 'No population data' :
        !cultureShare ? 'No ruling-culture population' : 'Producing in proportion to ruling-culture population',
      factory: !!(tile && api.cellTypeName(tile.type) == 'factory') };
  }
  function owned(civName) {
    var result = [];
    data.forEach(function (line, row) { line.forEach(function (tile, col) {
      if (tile && tile.color == civName) result.push([row, col]);
    }); });
    return result;
  }
  function costs(civName) {
    var scale = 1 + Math.pow(owned(civName).length / balance.sizeScale, 2);
    return { construction: balance.factoryPrice * (1 + Math.pow(owned(civName).length / balance.constructionSizeScale, 2)), upkeep: balance.factoryUpkeep * scale };
  }
  function production(civName) {
    var free = 0, factory = 0, factories = [], price = costs(civName);
    owned(civName).forEach(function (point) {
      var r = resource(point[0], point[1]);
      free += r.output;
      if (r.factory) {
        var output = balance.factoryOutput * api.getTaxEfficiency(civName, point[0], point[1]);
        factory += output;
        factories.push({ row: point[0], col: point[1], output: output });
      }
    });
    return { free: free, factory: factory, factories: factories, cost: price.upkeep * factories.length };
  }
  function setFunding(civName, share) {
    api.getSettings(civName).factoryProductionShare = api.clamp(finite(share), 0, 1);
  }
  function refill(civName) {
    var requests = api.getDivisions(civName).concat(api.getQueues(civName)).filter(supplied).map(function (f) {
      normalize(f);
      return { f: f, amount: Math.min(Math.max(0, capacity(f) - f.heavyEquipment), capacity(f) * balance.refillShare) };
    });
    var total = requests.reduce(function (sum, r) { return sum + r.amount; }, 0);
    var available = Math.min(stock(civName), total);
    requests.forEach(function (r) { r.f.heavyEquipment += total ? available * r.amount / total : 0; });
    civs[civName].heavyEquipmentStock = Math.max(0, stock(civName) - available);
    api.updateCivTotal(civName);
    return available;
  }
  function process(civName) {
    var civ = api.getCivStats(civName);
    if (!civ) return { paid: 0 };
    var settings = api.getSettings(civName), key = typeof turn == 'number' ? turn : civ.years;
    if (civ.equipmentProductionTurn === key) return { paid: 0, duplicate: true };
    civ.equipmentProductionTurn = key;
    var p = production(civName);
    var share = settings.factoryProductionShare;
    // Reserve the upkeep of this turn's possible refill before paying factories.
    var reserve = api.getDivisions(civName).concat(api.getQueues(civName)).reduce(function (sum, f) {
      var current = hardness(f), next = current;
      if (supplied(f) && f.manpower > 0) {
        var added = Math.min(Math.max(0, capacity(f) - finite(f.heavyEquipment)), capacity(f) * balance.refillShare);
        next += added * balance.menPerEquipment / f.manpower;
      }
      return sum + api.getFormationUpkeep(f) / (1 + balance.upkeepShare * current) * (1 + balance.upkeepShare * next);
    }, 0);
    var upkeepShare = settings.maxUpkeepShare;
    reserve = upkeepShare > 0 ? reserve / upkeepShare : 0;
    var budget = Math.max(0, finite(civ.money) - reserve);
    var paid = Math.min(p.cost * share, budget);
    var ratio = p.cost ? paid / p.cost : 0;
    civ.money -= paid;
    civ.heavyEquipmentStock = stock(civName) + p.free + p.factory * ratio;
    p.factories.forEach(function (f) {
      data[f.row][f.col]._heavyProduction = { output: f.output * ratio, funding: ratio, owner: civName };
    });
    civ.equipmentProduction = { free: p.free, factory: p.factory * ratio, paid: paid,
      funding: ratio, factories: p.factories.length, idle: ratio == 0 ? p.factories.length : 0 };
    civ.equipmentProduction.delivered = refill(civName);
    return civ.equipmentProduction;
  }
  function stackHardness(divisions) {
    var men = 0, weighted = 0;
    api.resolveDivisions(divisions).forEach(function (f) { men += f.manpower; weighted += f.manpower * hardness(f); });
    return men ? weighted / men : 0;
  }
  function matchup(attackers, defenders) {
    var a = stackHardness(attackers), d = stackHardness(defenders);
    return {
      attackerHardness: a,
      defenderHardness: d,
      // men LOST BY the attacking side
      // A harder attacker therefore suffers fewer losses from the defender's power.
      attackerLossMultiplier: 1 - 0.75 * (a - d),
      // Men LOST BY the defending side, calculated from the attacker's power.
      // A harder attacker inflicts more losses; a harder defender suffers fewer.
      // Equal hardness leaves both multipliers at 1 (no casualty adjustment).
      defenderLossMultiplier: 1 + 0.5 * (a - d)
    };
  }
  function build(civName, row, col) {
    var tile = data[row] && data[row][col], civ = civs[civName], price = costs(civName).construction;
    if (!tile || tile.color != civName || api.cellTypeName(tile.type) != 'land') return { ok: false, reason: 'owned-land-required' };
    if (!civ || civ.money < price) return { ok: false, reason: 'money', cost: price };
    civ.money -= price;
    tile.type = types.factory;
    return { ok: true, cost: price };
  }
  api.equipmentBalance = balance;
  api.normalizeEquipment = normalize;
  api.equipmentCapacity = capacity;
  api.getHardness = hardness;
  api.isHeavyUnit = function (formation) { return hardness(formation) > 0.5; };
  api.isEquipmentSupplied = supplied;
  api.getEquipmentStock = stock;
  api.returnEquipment = returnEquipment;
  api.setEquipmentCap = setCap;
  api.loseEquipment = lose;
  api.getHeavyResource = resource;
  api.getFactoryCosts = costs;
  api.getEquipmentProduction = production;
  api.setFactoryProductionShare = setFunding;
  api.refillEquipment = refill;
  api.processEquipment = process;
  api.getEquipmentMatchup = matchup;
  api.buildFactory = build;
  return api;
})(Military);
