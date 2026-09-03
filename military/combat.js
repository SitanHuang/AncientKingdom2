var Military = (function (api) {
  function experienceFactor(experience) {
    return 1 + (api.clamp(experience || 1, 1, 4) - 1) * 0.25;
  }

  function moraleFactor(morale) {
    morale = api.clamp(morale == null ? 1 : morale, 0.05, 2);
    return 0.5 + (morale - 0.05) / 1.95 * 0.75;
  }

  function civCombatFactors(civ) {
    civ = civ || {};
    var mods = (civ.gov && civ.gov.mods) || {};
    var technology = Math.sqrt(Math.max(0.1, (civ.technology || 1) *
      Math.max(0, 1 + (mods.MCCCT || 0))));
    var happiness = api.clamp(0.6 + (civ.happiness == null ? 75 : civ.happiness) / 200, 0.6, 1.1);
    var politicalCap = Math.max((civ.ii || 0) / 10, 30) * Math.max(0.1, 1 + (mods.OPPCP || 0));
    var political = api.clamp(0.9 + (civ.politic || 0) / politicalCap * 0.25, 0.75, 1.15);
    var cohesion = api.clamp(0.75 + ((civ.gov && civ.gov.cohesion) == null ? 1 : civ.gov.cohesion) * 0.25, 0.5, 1.25);
    var unrest = api.clamp(1 - Math.max(0, civ.rchance || 0), 0.5, 1);
    var dynasty = 1;
    if (civ.mandate && civ.years > 100 && typeof dynasty_decay_func == "function") {
      dynasty = Math.sqrt(Math.max(0.01, dynasty_decay_func(civ, 0.7)));
    }
    return {
      technology: technology,
      happiness: happiness,
      political: political,
      cohesion: cohesion,
      unrest: unrest,
      dynasty: dynasty,
      total: technology * happiness * political * cohesion * unrest * dynasty
    };
  }

  function encirclementFactor(civName, row, col) {
    var exposed = 0;
    api.getNeighbors(row, col).forEach(function (point) {
      var access = api.getAccess(civName, point[0], point[1]);
      if (access != "own" && access != "allied") exposed++;
    });
    return Math.max(0.25, 1 - Math.max(0, exposed - 1) * 0.25);
  }

  function locationFactor(civName, row, col, defending) {
    if (!defending) {
      var tile = data[row] && data[row][col];
      return tile && tile._oldcolor == civName ? 1.5 : 0.75;
    }

    var civ = civs[civName];
    var regional = typeof regions_defBonus == "function" ? regions_defBonus(civ, civName, row, col) : 1;
    return Math.sqrt(Math.max(0.1, regional)) * api.getBuildingBonus(row, col);
  }

  function getPowerBreakdown(divisions, row, col, defending, overrides) {
    divisions = api.resolveDivisions(divisions);
    overrides = overrides || {};
    if (!divisions.length) return {
      power: 0,
      manpower: 0,
      experience: 0,
      morale: 0,
      encirclement: 1,
      location: 1,
      civ: civCombatFactors(null)
    };

    var civName = divisions[0].civ;
    var actualManpower = divisions.reduce(function (sum, division) { return sum + division.manpower; }, 0);
    var scale = overrides.manpower == null ? 1 : Math.max(0, overrides.manpower) / Math.max(1, actualManpower);
    var encirclement = defending ? encirclementFactor(civName, row, col) : 1;
    var location = locationFactor(civName, row, col, defending);
    var civFactors = civCombatFactors(civs[civName]);
    var power = 0;
    var weightedExperience = 0;
    var weightedMorale = 0;
    var weightedEncirclement = 0;
    var manpower = 0;

    divisions.forEach(function (division) {
      var men = division.manpower * scale;
      var morale = overrides.morale == null ? division.morale : overrides.morale;
      var entrenchment = defending ? api.clamp(division.entrenchment || 1, 1, 2) : 1;
      var divisionEncirclement = defending ? encirclement :
        encirclementFactor(civName, division.row, division.col);
      power += men * experienceFactor(division.experience) * moraleFactor(morale) *
        entrenchment * divisionEncirclement * location * civFactors.total;
      manpower += men;
      weightedExperience += men * division.experience;
      weightedMorale += men * morale;
      weightedEncirclement += men * divisionEncirclement;
    });

    return {
      power: power,
      manpower: manpower,
      experience: manpower ? weightedExperience / manpower : 0,
      morale: manpower ? weightedMorale / manpower : 0,
      encirclement: manpower ? weightedEncirclement / manpower : encirclement,
      location: location,
      buildingBonus: defending ? api.getBuildingBonus(row, col) : 1,
      civ: civFactors
    };
  }

  function estimatePower(divisions, row, col, defending, overrides) {
    return getPowerBreakdown(divisions, row, col, defending, overrides).power;
  }

  function getDivisionStats(division) {
    if (typeof division != "object") division = api.getDivision(division);
    if (!division) return null;
    var upkeepModifier = 1 + ((((civs[division.civ] || {}).gov || {}).mods || {}).MUKCT || 0);
    var attack = getPowerBreakdown([division], division.row, division.col, false);
    var defense = getPowerBreakdown([division], division.row, division.col, true);
    return {
      id: division.id,
      civ: division.civ,
      name: division.name,
      manpower: division.manpower,
      maxManpower: division.maxManpower,
      requestedManpower: Math.max(0, division.maxManpower - division.manpower),
      recoveredLastTurn: division.recoveredLastTurn || 0,
      experience: division.experience,
      morale: division.morale,
      entrenchment: division.entrenchment,
      movesRemaining: division.movesRemaining,
      moveLimit: division.moveLimit,
      attack: attack.power,
      defense: defense.power,
      encirclement: defense.encirclement,
      buildingBonus: defense.buildingBonus,
      upkeep: api.legacyEquivalent(division.civ, division.manpower) / 4 * Math.max(0, upkeepModifier)
    };
  }

  function getStackStats(divisions, row, col, defending, overrides) {
    divisions = api.resolveDivisions(divisions);
    if (typeof defending == "object") {
      overrides = defending;
      defending = true;
    }
    overrides = overrides || {};
    var manpower = divisions.reduce(function (sum, division) { return sum + division.manpower; }, 0);
    var maxManpower = divisions.reduce(function (sum, division) { return sum + division.maxManpower; }, 0);
    var recovered = divisions.reduce(function (sum, division) { return sum + (division.recoveredLastTurn || 0); }, 0);
    var weightedExperience = divisions.reduce(function (sum, division) {
      return sum + division.experience * division.manpower;
    }, 0);
    var weightedMorale = divisions.reduce(function (sum, division) {
      return sum + division.morale * division.manpower;
    }, 0);
    var weightedEntrenchment = divisions.reduce(function (sum, division) {
      return sum + division.entrenchment * division.manpower;
    }, 0);
    var attack = getPowerBreakdown(divisions, row, col, false, overrides);
    var defense = getPowerBreakdown(divisions, row, col, defending !== false, overrides);
    var civName = divisions[0] && divisions[0].civ;
    var upkeepModifier = 1 + (((((civs[civName] || {}).gov || {}).mods || {}).MUKCT) || 0);
    return {
      count: divisions.length,
      manpower: overrides.manpower == null ? manpower : overrides.manpower,
      maxManpower: maxManpower,
      requestedManpower: Math.max(0, maxManpower - manpower),
      recoveredLastTurn: recovered,
      experience: manpower ? weightedExperience / manpower : 0,
      morale: overrides.morale == null ? (manpower ? weightedMorale / manpower : 0) : overrides.morale,
      entrenchment: manpower ? weightedEntrenchment / manpower : 0,
      movesRemaining: divisions.length ? Math.min.apply(null, divisions.map(function (division) {
        return division.movesRemaining;
      })) : 0,
      maxMovesRemaining: divisions.length ? Math.max.apply(null, divisions.map(function (division) {
        return division.movesRemaining;
      })) : 0,
      moveLimit: divisions.length ? Math.min.apply(null, divisions.map(function (division) {
        return division.moveLimit;
      })) : 0,
      attack: attack.power,
      defense: defense.power,
      encirclement: defense.encirclement,
      buildingBonus: defense.buildingBonus,
      upkeep: civName ? api.legacyEquivalent(civName, manpower) / 4 * Math.max(0, upkeepModifier) : 0
    };
  }

  function resolveBattle(attackers, row, col) {
    attackers = api.resolveDivisions(attackers).filter(function (division) { return division.manpower > 0; });
    if (!attackers.length) return { ok: false, reason: "no-divisions" };

    var attackerName = attackers[0].civ;
    var tile = data[row][col];
    var defenderName = tile.color;
    var defenders = api.getDivisionsAt(row, col, defenderName);
    var attack = getPowerBreakdown(attackers, row, col, false);
    var defense = getPowerBreakdown(defenders, row, col, true);
    if (defenders.length && typeof popv2_get_dominant_culture == "function" &&
      popv2_get_dominant_culture(row, col) != civs[attackerName].culture) {
      var regional = typeof regions_defBonus == "function" ?
        regions_defBonus(civs[defenderName], defenderName, row, col) : 1;
      var cultureDefense = Math.sqrt((regional + 0.25) / regional);
      defense.power *= cultureDefense;
      defense.location *= cultureDefense;
    }
    var attackerManpower = totalManpower(attackers);
    var defenderManpower = totalManpower(defenders);
    var attackerLosses = defenderManpower ? Math.min(
      Math.max(0, attackerManpower - 1),
      Math.round(Math.sqrt(defense.power * 5))
    ) : 0;
    var defenderLosses = attackerManpower ? Math.min(
      defenderManpower,
      attackerManpower,
      Math.round(Math.sqrt(attack.power * 5))
    ) : 0;

    applyLosses(attackers, attackerLosses, function (division) {
      return getPowerBreakdown([division], row, col, false).power;
    });
    applyLosses(defenders, defenderLosses, function (division) {
      return getPowerBreakdown([division], row, col, true).power;
    });
    updateExperienceAndMorale(attackers, defenders, attack.power, defense.power);

    defenders.forEach(function (division) { division.pendingMovePenalty = 1; });
    removeDestroyed(attackers);
    removeDestroyed(defenders);
    attackers = attackers.filter(function (division) { return division.manpower > 0; });
    defenders = defenders.filter(function (division) { return division.manpower > 0; });

    var attackerRetreat = shouldRetreat(attackers, defenders, defense.power, attack.power);
    var defenderRetreat = shouldRetreat(defenders, attackers, attack.power, defense.power);
    var retreated = { attacker: false, defender: false, encircled: 0 };
    if (attackers.length && attackerRetreat) retreated.attacker = true;
    if (defenders.length && defenderRetreat) {
      retreated.defender = true;
      var retreat = retreatDefenders(defenders, row, col);
      retreated.encircled = retreat.encircled;
      if (retreat.moved && Math.random() < 0.75 && api.cellTypeName(tile.type) != "land") {
        tile.type = types.land;
      }
      defenders = api.getDivisionsAt(row, col, defenderName);
    } else if (!defenders.length && Math.random() < 0.25 && api.cellTypeName(tile.type) != "land") {
      tile.type = types.land;
    }

    var captured = !retreated.attacker && defenders.length == 0 && attackers.length > 0;
    if (captured) {
      captureTile(attackerName, defenderName, row, col);
      attackers.forEach(function (division) { api._moveDivision(division, row, col); });
    }

    applyBattleConsequences(attackerName, defenderName, row, col, attackers, captured);
    api.updateCivTotal(attackerName);
    api.updateCivTotal(defenderName);

    return {
      ok: true,
      captured: captured,
      attacker: attackerName,
      defender: defenderName,
      attackerPower: attack.power,
      defenderPower: defense.power,
      attackerLosses: attackerLosses,
      defenderLosses: defenderLosses,
      attackerRemaining: totalManpower(attackers),
      defenderRemaining: totalManpower(api.getDivisionsAt(row, col, defenderName)),
      retreated: retreated,
      row: row,
      col: col
    };
  }

  function totalManpower(divisions) {
    return divisions.reduce(function (sum, division) { return sum + division.manpower; }, 0);
  }

  function applyLosses(divisions, losses, weightFn) {
    if (!losses || !divisions.length) return;
    var weighted = divisions.map(function (division) {
      return { division: division, weight: Math.max(0, weightFn(division)) };
    });
    var totalWeight = weighted.reduce(function (sum, item) { return sum + item.weight; }, 0) || divisions.length;
    var assigned = 0;
    weighted.forEach(function (item) {
      var exact = losses * (item.weight || 1) / totalWeight;
      item.loss = Math.min(item.division.manpower, Math.floor(exact));
      item.remainder = exact - item.loss;
      assigned += item.loss;
    });
    weighted.sort(function (a, b) { return b.remainder - a.remainder; });
    while (assigned < losses) {
      var changed = false;
      for (var i = 0; i < weighted.length && assigned < losses; i++) {
        if (weighted[i].loss < weighted[i].division.manpower) {
          weighted[i].loss++;
          assigned++;
          changed = true;
        }
      }
      if (!changed) break;
    }
    weighted.forEach(function (item) { item.division.manpower -= item.loss; });
  }

  function updateExperienceAndMorale(attackers, defenders, attackerPower, defenderPower) {
    var sum = Math.max(1, attackerPower + defenderPower);
    var balance = (attackerPower - defenderPower) / sum;
    attackers.forEach(function (division) {
      division.experience = api.clamp(division.experience + 0.01 * defenderPower / sum, 1, 4);
      division.morale = api.clamp(division.morale + balance * 0.5, 0.05, 2);
    });
    defenders.forEach(function (division) {
      division.experience = api.clamp(division.experience + 0.01 * attackerPower / sum, 1, 4);
      division.morale = api.clamp(division.morale - balance * 0.5, 0.05, 2);
    });
  }

  function removeDestroyed(divisions) {
    divisions.forEach(function (division) {
      if (division.manpower <= 100) api._removeDivision(division.id);
    });
  }

  function shouldRetreat(side, enemy, incomingPower, ownPower) {
    if (!side.length) return false;
    var manpower = totalManpower(side);
    var cap = side.reduce(function (sum, division) { return sum + division.maxManpower; }, 0);
    var morale = side.reduce(function (sum, division) {
      return sum + division.morale * division.manpower;
    }, 0) / Math.max(1, manpower);
    return incomingPower >= ownPower * 1.5 || morale <= 0.35 || manpower <= cap * 0.2;
  }

  function retreatDefenders(defenders, row, col) {
    var encircled = 0;
    var moved = 0;
    defenders.forEach(function (division) {
      var choices = api.getNeighbors(row, col).filter(function (point) {
        return data[point[0]][point[1]].color == division.civ;
      });
      choices.sort(function (a, b) {
        var difference = api.getDivisionsAt(a[0], a[1]).length - api.getDivisionsAt(b[0], b[1]).length;
        return difference || a[0] - b[0] || a[1] - b[1];
      });
      if (!choices.length) {
        api._removeDivision(division.id);
        encircled += division.manpower;
        return;
      }
      api._moveDivision(division, choices[0][0], choices[0][1]);
      moved++;
      division.movesRemaining = 0;
      division.entrenchment = 1;
      division.movedThisTurn = true;
    });
    return { encircled: encircled, moved: moved };
  }

  function captureTile(attackerName, defenderName, row, col) {
    var tile = data[row][col];
    tile.color = attackerName;
    if (!tile._oct || tile._oct <= 0 || !tile._oldcolor) tile._oldcolor = defenderName;
    var attacker = civs[attackerName];
    var defender = civs[defenderName];
    tile._oct = (tile._oct || (((attacker.war && attacker.war[defenderName]) ||
      (defender && defender.war && defender.war[attackerName])) + 2.5) || 3) + 1;
    if (attacker._parts) attacker._parts.lastUpdated = 4;
    if (defender && defender._parts) defender._parts.lastUpdated = 4;

    const dPop = popv2_get_totpop(row, col);
    popv2_apply_delta(row, col, Math.floor(-dPop * 0.25));
    defender.nextDecline = (defender.nextDecline || 0) + dPop * 0.25;
  }

  function applyBattleConsequences(attackerName, defenderName, row, col, attackers, captured) {
    var attacker = civs[attackerName];
    var defender = civs[defenderName];
    if (!attacker || !defender) return;
    var population = typeof popv2_get_totpop == "function" ? popv2_get_totpop(row, col) : 0;
    if (population && typeof popv2_apply_delta == "function") {
      popv2_apply_delta(row, col, -population * Math.random() * 0.1);
    }

    var attackerRemaining = totalManpower(attackers);
    var legacyRemaining = api.legacyEquivalent(attacker, attackerRemaining);
    defender.money -= legacyRemaining / 25;
    defender.logistics = (defender.logistics || 0) + legacyRemaining / 25;
    var attackerRate = api.clamp(1 - attackerRemaining * 1.25 / Math.max(1, attacker.pop || 0), 0.8, 0.99) || 0.97;
    var defenderRate = api.clamp(1 - population / Math.max(1, defender.pop || 0), 0.8, 0.99) || 0.97;
    attacker.happiness *= attackerRate;
    defender.happiness *= defenderRate;
    attacker._hapDec = (attacker._hapDec || 1) * attackerRate;
    attacker._hapDec *= attackerRate;
    defender._hapDec = (defender._hapDec || 1) * defenderRate;

    if (captured) tryCollapse(attackerName, defenderName, row, col);
  }

  function tryCollapse(attackerName, defenderName, row, col) {
    var attacker = civs[attackerName];
    var defender = civs[defenderName];
    var tile = data[row][col];
    var bankrupt = defender.money + (defender.deposit || 0) < -100 || defender.politic < 0;
    var weak = defender.ii < 150 && defender.military < api.menPerLegacyUnit(defender) * 50 &&
      defender.deposit + defender.money < (defender.ii * defender.urban / 10) * 0.6;
    var collapse = bankrupt && weak &&
      Math.random() < Math.min(1, 1 - defender.happiness / 100) * 0.3;
    var capitalFall = api.cellTypeName(tile.type) == "capital" && defender.ii < 250 && Math.random() < 0.1;
    if (!collapse && !capitalFall) return;

    for (var r = 0; r < data.length; r++) {
      for (var c = 0; c < data[r].length; c++) {
        var land = data[r][c];
        if (!land || land.color != defenderName || api.getDivisionsAt(r, c, defenderName).length) continue;
        if (Math.random() >= 0.9) continue;
        if (api.cellTypeName(land.type) == "city" && Math.random() >= 0.7) continue;
        captureTile(attackerName, defenderName, r, c);
      }
    }
  }

  api.experienceFactor = experienceFactor;
  api.moraleFactor = moraleFactor;
  api.civCombatFactors = civCombatFactors;
  api.encirclementFactor = encirclementFactor;
  api.getPowerBreakdown = getPowerBreakdown;
  api.estimatePower = estimatePower;
  api.getDivisionStats = getDivisionStats;
  api.getStackStats = getStackStats;
  api.resolveBattle = resolveBattle;

  return api;
})(Military);
