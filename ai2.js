AGGRESSIVENESS = 0.12;

var AI2 = (function () {
  var publicAPI = {
    think: think,
    calculateWarChances: calculateWarChances,
    debug: debug
  };

  var QUEUE_LIMIT = 12;
  var WAR_PLAN_TTL = 10;

  function think(civ, civName) {
    if (civ.ii < 2) return;

    initAI(civ);
    civ.war = civ.war || {};

    if ((Math.random() < 0.1 || (civ.urban > 50 && Math.random() < 0.7)) &&
      !Object.values(civ.war).filter(x => x > 0).length) {
      tryResearch(civ);
    }

    updateMandate(civ);
    refreshGovernment(civ, civName);

    civ.outGate = true;
    updateInGatesPolicy(civ, civName);

    var econ = getEconomy(civ);
    var budget = planBudget(civ, econ);
    civ._aiBudget = budget;

    var isBankrupt = econ.money < (civ.ii || 0) * 2 && civ.newMoney < civ.oldMoney;
    if (isBankrupt) {
      queueAction(civ, {
        id: "fix-bankrupt",
        type: "fix-bankrupt",
        priority: 100,
        blocking: true,
        ttl: 3,
        run: function () {
          tryDisbandUnits(civ, civName, econ, budget, { mode: "bankrupt" });
          tryFixBankrupt(civ, civName);
          recordAction(civ, "fix-bankrupt");
          return true;
        }
      });
    }

    var offenseChances = computeWarChances(civ, civName, "offense");
    civ._warChances = offenseChances;
    var defenseChances = computeWarChances(civ, civName, "defense");
    var threats = computeThreats(civ);
    civ._aiThreats = threats;

    handleDiplomacy(civ, civName, offenseChances, threats);
    handleWarPlans(civ, civName, offenseChances, threats, econ);

    buildEconomicQueue(civ, civName, econ, budget, threats);
    processQueue(civ, civName, budget);

    if (!isBankrupt && !hasActiveWar(civ) && econ.net < 0 && econ.money < budget.reserve * 0.5) {
      tryDisbandUnits(civ, civName, econ, budget, { mode: "trim" });
    }

    if (hasActiveWar(civ)) {
      defendAndMoveUnits(civ, civName, defenseChances, budget);
    } else {
      fortifyIfNeeded(civ, civName, budget, threats);
    }

    maintainReserve(civ, econ, budget);
    debugDump(civ, civName, econ, offenseChances, threats);
  }

  function calculateWarChances(civ, civName) {
    civ._warChances = computeWarChances(civ, civName, "offense");
  }

  function initAI(civ) {
    civ._aiState = civ._aiState || {};
    civ._aiQueue = civ._aiQueue || [];
    civ._aiWarPlans = civ._aiWarPlans || [];
    civ._aiBudget = civ._aiBudget || { reserve: 0 };
    civ._aiState.turn = (civ._aiState.turn || 0) + 1;
    civ._aiState.actions = [];
    civ._aicitycount = civ._aicitycount || civ.cityCount || 0;
  }

  function recordAction(civ, type, detail) {
    civ._aiState.actions.push({
      type: type,
      detail: detail || null
    });
  }

  function resolveCivName(civ, civName) {
    if (civName) return civName;
    if (typeof civ === "string") return civ;
    if (civ?.name) return civ.name;
    if (!civs) return null;
    for (var name in civs) {
      if (civs[name] === civ) return name;
    }
    return null;
  }

  function buildDebugSnapshot(civ, civName, econ, warChances, threats) {
    var name = resolveCivName(civ, civName);
    var econData = econ || getEconomy(civ);
    var warData = warChances || (name ? computeWarChances(civ, name, "offense") : {});
    var threatData = threats || computeThreats(civ);
    return {
      civ: name,
      turn: civ._aiState?.turn,
      econ: econData,
      budget: civ._aiBudget,
      warChances: warData,
      threats: threatData.slice(0, 4),
      warPlans: civ._aiWarPlans,
      queue: civ._aiQueue,
      actions: civ._aiState?.actions
    };
  }

  function debug(civOrName) {
    var civ = civOrName;
    var civName = null;
    if (typeof civOrName === "string") {
      civName = civOrName;
      civ = civs?.[civOrName];
    }
    if (!civ) return null;
    var snapshot = buildDebugSnapshot(civ, civName);
    civ._aiDebug = snapshot;
    console.log("AI2 DEBUG", snapshot);
    return snapshot;
  }

  function debugDump(civ, civName, econ, warChances, threats) {
    civ._aiDebug = buildDebugSnapshot(civ, civName, econ, warChances, threats);
  }

  function updateMandate(civ) {
    if (civ.pop > _dynastyPopReq * 0.6 && !civ.mandate && Math.random() < 0.2) {
      civ.mandateInAcquirement = 30 * 4;
    }
    if (civ.mandateInAcquirement) {
      civ.mandateInAcquirement--;
    }
    if (!civ.mandateInAcquirement || civ.mandate || civ.pop < _dynastyPopReq * 0.5) {
      delete civ.mandateInAcquirement;
    }
  }

  function refreshGovernment(civ, civName) {
    if (civ.gov && Math.random() < 0.3) {
      Object.keys(civ.gov.advisors)
        .forEach(x => gov_demote_to_bureaucrat(civ.gov, x));
      gov_refresh(civ, civName);
    }
    while (civ.gov && Object.keys(civ.gov.advisors).length < GOV_ADVISORS_PER_CIV) {
      handleGov(civ, civName);
    }
  }

  function updateInGatesPolicy(civ, civName) {
    if (!civ.inGatesDisallowed || !civ.neighbors) return;
    for (var cn in civ.neighbors) {
      var c2 = civs[cn];
      if (!c2) continue;
      if (
        civ.rchance > 1.25 / 100 || civ.happiness < 40 ||
        ((civ.mandate || civ.mandateInAcquirement) && Math.random() < 0.90)
      ) {
        civ.inGatesDisallowed[cn] = true;
      } else if (civ.rchance > 0.75 / 100 || civ.happiness < 50) {
        civ.inGatesDisallowed[cn] = (c2.nextDecline > civ.pop * 0.005) ||
          (c2.pop > civ.pop * 0.1 && Math.random() > civ.happiness / 100 / 4);
      } else if (civ.rchance > 0.5 / 100 || civ.happiness < 60) {
        civ.inGatesDisallowed[cn] = (c2.nextDecline > civ.pop * 0.05) ||
          (c2.pop > civ.pop && Math.random() > civ.happiness / 100 / 2);
      } else if (civ.rchance > 0.1 / 100 || civ.happiness < 80) {
        civ.inGatesDisallowed[cn] = (c2.nextDecline > civ.pop * 0.1) ||
          (c2.pop > civ.pop * 2 && Math.random() > civ.happiness / 100);
      } else if (civ.rchance > 0.05 / 100) {
        civ.inGatesDisallowed[cn] = Math.random() > civ.happiness / 80;
      } else {
        delete civ.inGatesDisallowed[cn];
      }
      if (!civ.inGatesDisallowed[cn]) {
        delete civ.inGatesDisallowed[cn];
      }
    }
  }

  function getEconomy(civ) {
    var income = civ.income || 0;
    var ra = civ.incomesRA || 0;
    var money = civ.money || 0;
    var deposit = civ.deposit || 0;
    var expense = (civ.spentOnUrban || 0) + (civ.govExp || 0) + (civ.expense || 0);
    var net = income - expense;
    var buffer = money + deposit + ra * 2;
    var confidence = (net > 0 && buffer > Math.max(100, civ.ii * 1.5));
    return {
      income: income,
      ra: ra,
      money: money,
      deposit: deposit,
      expense: expense,
      net: net,
      buffer: buffer,
      confidence: confidence
    };
  }

  function planBudget(civ, econ) {
    var reserve = Math.max(30, (civ.ii || 1) * (civ.urban || 0) / 8);
    if (civ.happiness < 60 || civ.rchance > 0.05) reserve *= 1.4;
    if (econ.net < 0) reserve *= 1.5;
    if (hasActiveWar(civ)) reserve *= 1.3;
    reserve = Math.min(reserve, econ.money + econ.deposit);
    return {
      reserve: reserve / 4
    };
  }

  function maintainReserve(civ, econ, budget) {
    civ.deposit = civ.deposit || 0;
    if (civ.deposit < 0) {
      civ.money += civ.deposit + 10;
      civ.deposit = 10;
    }
    if (civ.money < 0 && civ.deposit > 0) {
      var take = Math.min(civ.deposit, Math.abs(civ.money));
      civ.money += take;
      civ.deposit -= take;
    }
    if (civ.money > 0 && civ.deposit < budget.reserve && civ.money > budget.reserve * 0.5) {
      var add = Math.min(budget.reserve - civ.deposit, civ.money / 2);
      civ.deposit += add;
      civ.money -= add;
    }
  }

  function queueAction(civ, action) {
    if (civ._aiQueue.length >= QUEUE_LIMIT) return;
    if (civ._aiQueue.some(x => x.id === action.id)) return;
    civ._aiQueue.push(action);
  }

  function canAfford(civ, cost, reserve) {
    var money = civ.money || 0;
    var deposit = civ.deposit || 0;
    if (money - cost >= reserve) return true;
    return (money + Math.max(0, deposit - reserve) - cost) >= 0;
  }

  function prepareFunds(civ, cost, reserve) {
    var money = civ.money || 0;
    var deposit = civ.deposit || 0;
    if (money >= cost) return;
    var available = Math.max(0, deposit - reserve);
    var need = cost - money;
    var take = Math.min(available, need);
    if (take > 0) {
      civ.money += take;
      civ.deposit -= take;
    }
  }

  function processQueue(civ, civName, budget) {
    var queue = civ._aiQueue.map(function (item) {
      if (item.ttl == null) item.ttl = 6;
      item.ttl--;
      return item;
    }).filter(item => item.ttl > 0);

    queue.sort(function (a, b) {
      return (b.priority || 0) - (a.priority || 0);
    });

    var remaining = [];
    var executed = 0;
    for (var i = 0; i < queue.length; i++) {
      var action = queue[i];
      var minMoney = action.minMoney || 0;
      var minPolitic = action.minPolitic || 0;
      if (minMoney > 0 && !canAfford(civ, minMoney, budget.reserve)) {
        remaining.push(action);
        if (action.blocking) {
          remaining = remaining.concat(queue.slice(i + 1));
          break;
        }
        continue;
      }
      if (civ.politic < minPolitic) {
        remaining.push(action);
        if (action.blocking) {
          remaining = remaining.concat(queue.slice(i + 1));
          break;
        }
        continue;
      }
      if (action.run && action.run(civ, civName, budget)) {
        executed++;
        if (executed >= 2) {
          remaining = remaining.concat(queue.slice(i + 1));
          break;
        }
      } else {
        remaining.push(action);
      }
    }
    civ._aiQueue = remaining;
  }

  function buildEconomicQueue(civ, civName, econ, budget, threats) {
    var stabilityLow = civ.happiness < 60 || civ.rchance > 0.05;
    var stable = civ.happiness > 55 && civ.rchance < 0.06;
    var adjInc = Math.min(econ.ra, econ.income) - (civ.spentOnUrban || 0) - (civ.govExp || 0);
    var warThreat = threats.length && threats[0].score > 1.2;
    var earlyLand = civ.ii < 55 && econ.money > 15;

    if (stabilityLow) {
      queueBuild(civ, civName, {
        id: "school-stability",
        type: types.school,
        price: 105,
        maxMoney: Math.max(105, 0.5 * (adjInc + econ.money / 2)),
        econMod: -0.1,
        popMod: 2,
        priority: 95,
        blocking: true
      });
      queueBuild(civ, civName, {
        id: "finance-stability",
        type: types.finance,
        price: 105,
        maxMoney: Math.max(105, econ.money / 2),
        econMod: 5,
        popMod: 1,
        cityOveride: true,
        priority: 90,
        blocking: true
      });
    }

    if (!stabilityLow && (civ.urban < 65 || civ.ii < 70)) {
      queueBuild(civ, civName, {
        id: "finance-growth",
        type: types.finance,
        price: 105,
        maxMoney: Math.max(105, econ.money / 2),
        econMod: 5,
        popMod: 1,
        cityOveride: true,
        priority: 70
      });
    }

    if (civ.ii < 300 && stable) {
      queueBuild(civ, civName, {
        id: "city-growth",
        type: types.city,
        price: 85,
        maxMoney: Math.max(85, econ.money / 5),
        econMod: 0.1,
        popMod: 1,
        cityOveride: true,
        priority: 60
      });
    }

    if (earlyLand && !warThreat) {
      queueAction(civ, {
        id: "land-expansion-early",
        type: "land",
        minMoney: civGetLandPrice(civ),
        priority: 55,
        ttl: 5,
        run: function () {
          prepareFunds(civ, civGetLandPrice(civ), budget.reserve);
          var built = tryBuildLand(civ, civName, econ.money / (Math.floor(Math.random() * 9 + 2)));
          if (built > 0) recordAction(civ, "build-land", built);
          return built > 0;
        }
      });
    }

    if (stable && civ.ii < 100 && !warThreat) {
      queueAction(civ, {
        id: "land-expansion",
        type: "land",
        minMoney: civGetLandPrice(civ),
        priority: 45,
        ttl: 5,
        run: function () {
          prepareFunds(civ, civGetLandPrice(civ), budget.reserve);
          var built = tryBuildLand(civ, civName, econ.money / (Math.floor(Math.random() * 9 + 2)));
          if (built > 0) recordAction(civ, "build-land", built);
          return built > 0;
        }
      });
    }

    if (warThreat || hasActiveWar(civ)) {
      queueBuild(civ, civName, {
        id: "fortify-borders",
        type: types.fort,
        price: 25,
        maxMoney: Math.max(25, econ.money / 4),
        econMod: -1,
        popMod: -1,
        priority: 80
      });
      queueBuild(civ, civName, {
        id: "build-gates",
        type: types.gate,
        price: 5,
        maxMoney: Math.max(5, econ.money / 30),
        econMod: -1,
        popMod: -1,
        priority: 50
      });
    }
  }

  function queueBuild(civ, civName, opts) {
    queueAction(civ, {
      id: opts.id,
      type: "build",
      minMoney: opts.price,
      priority: opts.priority || 50,
      blocking: opts.blocking || false,
      ttl: 6,
      run: function () {
        prepareFunds(civ, opts.price, civ._aiBudget.reserve);
        var built = tryBuild(
          civ,
          civName,
          opts.maxMoney,
          opts.type,
          opts.price,
          opts.econMod == null ? 1 : opts.econMod,
          opts.popMod == null ? 1 : opts.popMod,
          opts.cityOveride || false
        );
        if (built > 0) recordAction(civ, "build", { type: opts.type, count: built });
        return built > 0;
      }
    });
  }

  function handleDiplomacy(civ, civName, warChances, threats) {
    if (!civ.neighbors) return;
    civ.AIprompted = civ.AIprompted || {};

    var highThreats = threats.slice(0, 2).map(x => x.name);
    highThreats.forEach(function (cn) {
      if (civ.AIprompted[cn]) return;
      if (isAtWar(civ, cn)) return;
      if (!isPeace(civ, cn) && Math.random() > 0.4) {
        promptForPact(civName, cn);
        civ.AIprompted[cn] = true;
        recordAction(civ, "pact", cn);
      }
    });

    if (hasActiveWar(civ)) {
      for (var k in civ.war) {
        if (!civ.war.hasOwnProperty(k) || civ.war[k] <= 1) continue;
        civOrders.forEach(function (x) {
          if (x === civName) return;
          if (isAtWar(civs[x], k) && !isAtWar(civ, x)) {
            if (!isPeace(civ, x)) {
              if (Math.random() < 0.5) promptForAlliance(civName, x);
              else promptForPact(civName, x);
              recordAction(civ, "seek-ally", x);
            }
            if (civ.neighbors && civs[x]?.neighbors) {
              var totalNeighbors = (civ.neighbors[k] || 0) + (civs[x].neighbors[k] || 0);
              if (Math.random() > 0.3 && civ.money > 100) {
                giveMoneyTo(
                  civName,
                  x,
                  (civ.money - 100) / (1 + Math.random() * 2) *
                  (civs[x].neighbors[k] || 0) / (totalNeighbors || 1),
                  k
                );
                recordAction(civ, "support-ally", x);
              }
            }
          }
        });
        break;
      }
    }
  }

  // War plans: pick a neighbor target, stage pacts, then declare if stability,
  // economy, and warChance thresholds are met. Plans expire after a TTL.
  function handleWarPlans(civ, civName, warChances, threats, econ) {
    var plans = civ._aiWarPlans || [];
    plans.forEach(p => p.age++);
    plans = plans.filter(p => p.age <= WAR_PLAN_TTL && civ.neighbors && civ.neighbors[p.target]);
    civ._aiWarPlans = plans;

    var stable = civ.happiness > 55 && civ.rchance < 0.06;
    var econStrong = econ.confidence || (econ.buffer > Math.max(100, civ.ii * 2));

    if (!plans.length) {
      var target = pickWarTarget(civ, warChances, stable, econStrong);
      if (target) {
        var ratio = strengthRatio(civ, civs[target]);
        plans.push({
          target: target,
          stage: ratio >= 0.6 ? "pacts" : "declare",
          age: 0,
          reason: civ.culture === civs[target].culture ? "unify" : "expand"
        });
        recordAction(civ, "plan-war", target);
      }
    }

    for (var i = 0; i < plans.length; i++) {
      var plan = plans[i];
      var targetName = plan.target;
      var target = civs[targetName];
      if (!target) continue;

      if (plan.stage === "pacts") {
        var pactList = threats.filter(t => t.name !== targetName).slice(0, 2);
        pactList.forEach(function (t) {
          if (isAtWar(civ, t.name)) return;
          if (!isPeace(civ, t.name)) {
            promptForPact(civName, t.name);
            recordAction(civ, "pre-pact", t.name);
          }
        });
        if (plan.age > 2 || pactList.length === 0) {
          plan.stage = "declare";
          plan.age = 0;
        }
      } else if (plan.stage === "declare") {
        var chance = warChances[targetName] || 0;
        // Declaration gate: stable + econStrong with higher threshold for expansion,
        // relaxed threshold for same-culture "unify" wars.
        var allow = stable && econStrong && chance > 0.25;
        if (civ.culture === target.culture) {
          allow = econStrong && chance > 0.15;
        }
        if (allow && !isAtWar(civ, targetName)) {
          // Major war likelihood grows with chance; diff-culture wars avoid major wars.
          var majorWar = civ.culture == target.culture ? (Math.random() < Math.sqrt(chance)) : 0;
          if (declareWar(civName, targetName, undefined, undefined, majorWar)) {
            recordAction(civ, "declare-war", targetName);
            plans.splice(i, 1);
            i--;
            continue;
          }
        }
        if (!allow && plan.age > 3) {
          plans.splice(i, 1);
          i--;
        }
      }
    }
  }

  // Pick a neighbor that crosses warChance thresholds with stability/economy gating.
  // Same-culture targets get a lower threshold to allow "unify" wars.
  function pickWarTarget(civ, warChances, stable, econStrong) {
    if (!civ.neighbors) return null;
    var candidates = Object.keys(warChances).map(function (cn) {
      return { name: cn, chance: warChances[cn] || 0 };
    }).sort((a, b) => b.chance - a.chance);

    for (var i = 0; i < candidates.length; i++) {
      var cn = candidates[i].name;
      var civ2 = civs[cn];
      if (!civ2) continue;
      if (isAtWar(civ, cn) || isAlliance(civ, cn)) continue;
      var sameCulture = civ.culture === civ2.culture;
      if (sameCulture && (econStrong || civ.mandateInAcquirement) && candidates[i].chance > 0.15) {
        return cn;
      }
      if (stable && econStrong && candidates[i].chance > 0.3) {
        return cn;
      }
    }
    return null;
  }

  function strengthRatio(civ, civ2) {
    if (!civ2) return 0;
    var ii = safeDiv(civ2.ii, civ.ii, 1);
    var pop = safeDiv(civ2.pop, civ.pop, 1);
    var inc = safeDiv(civ2.income, civ.income, 1);
    return (ii + pop + inc) / 3;
  }

  function computeThreats(civ) {
    if (!civ.neighbors) return [];
    var list = Object.keys(civ.neighbors).map(function (cn) {
      var c2 = civs[cn];
      if (!c2) return null;
      var score = strengthRatio(civ, c2);
      return { name: cn, score: score };
    }).filter(Boolean);
    list.sort((a, b) => b.score - a.score);
    return list;
  }

  function fortifyIfNeeded(civ, civName, budget, threats) {
    if (civ.politic > 2 && (civ.happiness > 70 && civ.rchance < 0.03)) return;
    if (!threats.length && Math.random() > 0.3) return;
    if (!canAfford(civ, 25, budget.reserve)) return;
    prepareFunds(civ, 25, budget.reserve);
    var built = tryBuild(civ, civName, Math.max(25, civ.money / 4), types.fort, 25, -1, -1);
    if (built > 0) recordAction(civ, "fortify", built);
  }

  function getAttackBudget(civ, budget) {
    var reserve = budget?.reserve || 0;
    var money = civ.money || 0;
    var deposit = civ.deposit || 0;
    var liquid = money + Math.max(0, deposit - reserve);
    var spendLimit = Math.max(0, liquid - reserve * 0.6);
    var warChest = Math.max(0, liquid - reserve);
    var threshold = Math.max(200, (civ.ii || 1) * 3, (civ.income || 0) * 2);
    var overkill = warChest > threshold;
    var overkillFactor = overkill ? Math.min(2, 1 + warChest / Math.max(200, threshold)) : 1;
    return {
      reserve: reserve,
      spendLimit: spendLimit,
      warChest: warChest,
      overkill: overkill,
      overkillFactor: overkillFactor
    };
  }

  function defendAndMoveUnits(civ, civName, defenseChances, budget) {
    if (civ.ii / (data.length * data[0].length) > 0.5 && Math.random() < 0.9) {
      return;
    }
    if (civ.ii / (data.length * data[0].length) > 0.07 && Math.random() < 0.5) {
      return;
    }

    if (civ.politic < 1) {
      fortifyIfNeeded(civ, civName, budget, []);
      return;
    }

    var attackBudget = getAttackBudget(civ, budget);
    var reserve = attackBudget.reserve;
    var spendLimit = attackBudget.spendLimit;
    var overkillMode = attackBudget.overkill;
    var overkillFactor = attackBudget.overkillFactor;
    var enemies = Object.keys(civ.war || {}).filter(k => civ.war[k] > 1);
    if (!enemies.length) return;

    var enemyMap = {};
    enemies.forEach(k => enemyMap[k] = true);

    function getStrategicValue(defend) {
      if (defend === types.capital.defend) return 6;
      if (defend === types.city.defend) return 4.5;
      if (defend === types.headquarter.defend) return 4;
      if (defend === types.fort.defend) return 3.2;
      if (defend === types.finance.defend || defend === types.school.defend) return 3;
      if (defend === types.gate.defend) return 2;
      return 1;
    }

    var moneySpent = -10;
    var list = getAllUnits(civName);
    var moveVal = -1;
    var momentum = 0;

    function hasEnemyNeighbor(row, col) {
      var found = false;
      getNeighbors(row, col, function (l2) {
        if (found || !l2 || !l2.type) return;
        if (!l2.color || l2.color === civName) return;
        if (!enemyMap[l2.color]) return;
        if (isAlliance(civ, l2.color)) return;
        found = true;
      });
      return found;
    }

    for (var ii = 0; ii < list.length; ii++) {
      if (civ.politic < 1) {
        fortifyIfNeeded(civ, civName, budget, []);
        break;
      }

      var item = list[ii];
      var row = item.row;
      var col = item.col;
      var land = item.land;

      if (!land) continue;

      if (land.type && land.type.val) {
        if (land.type.val > 10) {
          moveVal = land.type.val;
        } else {
          moveVal += land.type.val;
          land.type = types.land;
        }
        if (Math.random() < 0.1 || (Math.random() < 0.1 && land.type.val > 25)) {
          land.type = types.land;
        }
      }

      var neighbor = false;
      var enemyNeighbors = [];
      var availableStrength = moveVal > 0 ? moveVal : 0;

      getNeighbors(row, col, function (l2, r, c) {
        if (!l2 || !l2.type) return;
        if (l2.color === civName) return;
        if (!enemyMap[l2.color]) return;
        if (isAlliance(civ, l2.color)) return;
        neighbor = true;

        var defendVal = l2.type.val ? l2.type.val : l2.type.defend;
        var strategic = getStrategicValue(l2.type.defend);
        var warBias = (defenseChances && defenseChances[l2.color]) || 0;
        var frontier = 0;
        getNeighbors(r, c, function (l3) {
          if (!l3 || !l3.type) return;
          if (!l3.color || l3.color === civName) return;
          if (!enemyMap[l3.color]) return;
          if (isAlliance(civ, l3.color)) return;
          frontier++;
        });
        var efficiency = 12 / (defendVal + 6);
        var score = strategic * 12 + warBias * 18 - defendVal + frontier * 4 + efficiency * 5;
        if (availableStrength > 0) {
          score += Math.min(25, availableStrength - defendVal);
        }
        enemyNeighbors.push({
          l2: l2,
          r: r,
          c: c,
          defendVal: defendVal,
          strategic: strategic,
          warBias: warBias,
          frontier: frontier,
          score: score
        });
      });

      if (enemyNeighbors.length) {
        enemyNeighbors.sort((a, b) => b.score - a.score);
        var target = enemyNeighbors[0];

        if (land.type.defend === types.land.defend &&
          civ.money - reserve > 30 &&
          (target.warBias < 0.3 || target.strategic >= 4) &&
          Math.random() < 0.35) {
          civ.money -= 25 * (civ.ii > 225 ? 1.5 : 1);
          moneySpent += 25 * (civ.ii > 225 ? 1.5 : 1);
          land.type = (civ.ii > 225 ? types.headquarter : types.fort);
          continue;
        }

        if (civ.politic < 1) continue;

        var aggression = 0.45 + Math.min(0.35, target.warBias * 0.6);
        if (target.strategic >= 4) aggression += 0.1;
        if (overkillMode) aggression += 0.15;
        aggression += Math.min(0.2, momentum * 0.05);
        if (availableStrength > 0 &&
          availableStrength < target.defendVal * (1.1 - aggression * 0.5) &&
          !overkillMode) {
          continue;
        }
        if (availableStrength <= 0 && !overkillMode && civ.money - reserve < 10) {
          continue;
        }

        var m = target.defendVal + Math.round(Math.random() * 10);
        if (availableStrength > 0) {
          var cap = Math.max(1, Math.min(availableStrength,
            Math.round(target.defendVal * (0.9 + aggression * 0.4) + 4)));
          m = Math.max(m, cap);
        }
        if (overkillMode) {
          var overkill = Math.round(target.defendVal *
            (1.2 + Math.min(0.8, (overkillFactor - 1) * 0.6)));
          if (target.strategic >= 4) {
            overkill += Math.round(target.defendVal * 0.2);
          }
          m = Math.max(m, overkill);
        }
        if (moveVal > m / 2) {
          m = moveVal;
          land.type = types.land;
          moneySpent -= m + m / 4;
          civ.money += m * 1.7;
        }

        if (Math.random() < (overkillMode ? 0.05 : 0.2)) moveVal = -1;
        moneySpent += m * 2;
        if (moneySpent > spendLimit) {
          if (target.l2.type.defend === types.city.defend) {
            moneySpent -= m * 2 - 2;
            m = 1;
          } else {
            continue;
          }
        }

        civ.logistics += m / 4;
        prepareFunds(civ, m * 2, reserve);
        civ.money -= m * 2;
        civ.nextDecline = (civ.nextDecline || 0) + Math.max(0, m * 400 * (1 + (civ.ii || 0) / 1000));
        civ.nextDecline = Math.min(civ.pop * 0.9 || 0, civ.nextDecline);
        var result = move(civName, {
          civ: civName,
          type: { val: m }
        }, [target.r, target.c], "ai");
        var val = result[0];
        if (result[1] == 0) {
          var nextItem = {
            row: target.r,
            col: target.c,
            land: data[target.r][target.c]
          };
          var pushForward = civ.politic > 1 && hasEnemyNeighbor(target.r, target.c) &&
            (overkillMode || result[0] > target.defendVal * 0.7 || momentum > 1);
          if (pushForward) {
            list.splice(ii + 1, 0, nextItem);
            momentum = Math.min(6, momentum + 2);
          } else {
            list.push(nextItem);
            momentum = Math.min(6, momentum + 1);
          }
        } else {
          momentum = Math.max(0, momentum - 1);
        }

        var omvpc = 1 + (civ.gov?.mods?.OMVPC || 0);
        civ.politic -= 0.7 * omvpc;
        var mmvct = 1 + (civ.gov?.mods?.MMVCT || 0);
        civ.money -= val / 25 * mmvct;
      }

      if (!neighbor &&
        (land.type.defend === types.fort.defend || land.type.defend === types.headquarter.defend) &&
        Math.random() < 0.2) {
        land.type = types.land;
      }
    }
  }

  // Compute per-neighbor war propensity score.
  // Uses relative strength (income/tech/ii/pop), liquidity, mandate pressure,
  // culture and oppression modifiers, and stability/aggressiveness dampeners.
  // Output is a heuristic score; callers apply thresholds to decide plans/war.
  function computeWarChances(civ, civName, mode) {
    var chances = {};
    if (!civ.neighbors) return chances;

    for (var cn in civ.neighbors) {
      var civ2 = civs[cn];
      if (!civ2) continue;

      var warChance = 0;
      var sameCulture = civ.culture && civ2.culture && civ.culture === civ2.culture;

      if (mode === "offense" && civ.income * 1.2 > civ2.income) {
        warChance += ratioScore(civ.income, civ2.income, 10, 0.25);
      }
      if (civ.technology * 1.2 > civ2.technology) {
        warChance += ratioScore(civ.technology, civ2.technology, 1, 0.25);
      }
      if (civ.ii * 1.2 > civ2.ii) {
        warChance += ratioScore(civ.ii, civ2.ii, 10, 0.25);
      }
      if (civ.pop * 1.2 > civ2.pop) {
        warChance += ratioScore(civ.pop, civ2.pop, 10, 0.25);
      }

      if (!civ.mandate || mode === "offense") {
        var civAdjMoney = (civ.money || 0) + (civ.deposit || 0) +
          (civ.income || 0) * 4 + (civ.incomesRA || 0) * 4;
        var civ2AdjMoney = (civ2.money || 0) + (civ2.deposit || 0) +
          (civ2.income || 0) * 4 + (civ2.incomesRA || 0) * 4;
        var minAdjMoney = Math.min(civ2AdjMoney, civAdjMoney);
        civAdjMoney -= minAdjMoney;
        civ2AdjMoney -= minAdjMoney;
        if (civAdjMoney * 1.2 > civ2AdjMoney) {
          warChance += ratioScore(civAdjMoney, civ2AdjMoney, 10, 0.75);
        }
        warChance *= (civ2.rchance || 0) + 1;
      }

      var oppressedPop = civ2._poptable?.[civ.culture];
      if (civ.mandate && !sameCulture && oppressedPop < 500000) {
        warChance *= 0.10;
        warChance = Math.min(warChance, 0.7);
      }

      if (civ.mandateInAcquirement ||
        (civ.mandate && sameCulture && (civ2.pop > civ.pop * 0.05 || civ2.ii > civ.ii * 0.1))) {
        warChance *= 50;
        warChance = Math.min(warChance, 10);
      }

      if (warChance > 0.25) {
        if (sameCulture) {
          warChance *= 2;
        } else {
          if (civ.em / civ.ii > civ2.em / civ2.ii) warChance *= 0.80;
          else warChance *= 1.2;
          if (civ.pm / civ.ii * 0.8 > civ2.pm / civ2.ii) warChance *= 0.35;
          if (civ.pm / civ.ii > civ2.pm / civ2.ii) warChance *= 0.35;
          else warChance *= 1.5;
          if (oppressedPop > 500000) {
            warChance *= 1.5 + Math.min(10, Math.max(0, oppressedPop / civ.pop * 10));
          } else {
            warChance *= 0.50;
          }
        }
      }

      warChance *= Math.min(5, Math.max(0, (civ.deposit + civ.money) / (civ.ii * civ.urban / 10 * 2)));
      warChance *= Math.max(0, civ.happiness / 100 - 0.2);
      if (civ.happiness < 55 || civ.rchance > 0.06) {
        warChance *= sameCulture ? 0.9 : 0.5;
      }
      warChance *= AGGRESSIVENESS;
      warChance *= 1 + (civ2.gov?.mods?.OFRHS || 0);

      chances[cn] = warChance;
    }
    return chances;
  }

  function ratioScore(a, b, scale, cap) {
    if (!a || !b) return 0;
    return Math.min(cap, Math.max(0, (a / b) / scale));
  }

  function safeDiv(a, b, scale) {
    if (!a || !b) return 0;
    return (a / b) / scale;
  }

  function hasActiveWar(civ) {
    if (!civ.war) return false;
    return Object.values(civ.war).some(x => x > 1);
  }

  function estimateMilitaryUpkeep(civ, val) {
    var mukct = 1 + (civ.gov?.mods?.MUKCT || 0);
    return val / 4 * mukct;
  }

  function tryDisbandUnits(civ, civName, econ, budget, opts) {
    var mode = opts?.mode || "trim";
    var list = getAllUnits(civName);
    if (!list || !list.length) return 0;

    var atWar = hasActiveWar(civ);
    var enemyMap = {};
    if (atWar && civ.war) {
      for (var k in civ.war) {
        if (civ.war[k] > 1) enemyMap[k] = true;
      }
    }
    var hasEnemies = Object.keys(enemyMap).length > 0;

    function hasEnemyNeighbor(row, col) {
      var found = false;
      getNeighbors(row, col, function (l2) {
        if (found || !l2 || !l2.color || l2.color === civName) return;
        if (hasEnemies && !enemyMap[l2.color]) return;
        if (isAlliance(civ, l2.color)) return;
        found = true;
      });
      return found;
    }

    function hasBorderNeighbor(row, col) {
      var found = false;
      getNeighbors(row, col, function (l2) {
        if (found || !l2 || !l2.color || l2.color === civName) return;
        if (isAlliance(civ, l2.color)) return;
        found = true;
      });
      return found;
    }

    var candidates = list.map(function (item) {
      var land = item.land;
      if (!land || !land.type || !land.type.val || land.color !== civName) return null;
      var enemyNeighbor = hasEnemyNeighbor(item.row, item.col);
      var border = enemyNeighbor ? true : hasBorderNeighbor(item.row, item.col);
      return {
        row: item.row,
        col: item.col,
        land: land,
        val: land.type.val || 0,
        pop: land.pop || 0,
        enemyNeighbor: enemyNeighbor,
        border: border
      };
    }).filter(Boolean);

    if (!candidates.length) return 0;

    var moneyLoss = Math.max(0, (civ.oldMoney || 0) - (civ.newMoney || 0));
    var target = 0;
    if (mode === "bankrupt") {
      target = Math.max(30, moneyLoss * 1.2 + Math.max(0, -civ.money));
    } else {
      var net = econ ? econ.net : ((civ.income || 0) - (civ.expense || 0));
      target = Math.max(8, Math.max(0, -net) * 0.4);
    }

    var minGarrison = atWar ? 6 : 4;
    var minFrontline = atWar ? 12 : minGarrison;
    var allowFrontline = mode === "bankrupt" && civ.money < 0;
    var allowBorder = mode === "bankrupt" || !atWar;

    candidates.sort(function (a, b) {
      if (a.enemyNeighbor !== b.enemyNeighbor) return a.enemyNeighbor ? 1 : -1;
      if (a.border !== b.border) return a.border ? 1 : -1;
      if (a.pop !== b.pop) return a.pop - b.pop;
      return b.val - a.val;
    });

    var saved = 0;
    var removed = 0;
    var reduced = 0;
    for (var i = 0; i < candidates.length; i++) {
      var unit = candidates[i];
      if (unit.enemyNeighbor && !allowFrontline) continue;
      if (unit.border && !allowBorder) continue;

      var val = unit.val;
      if (val <= 0) continue;

      if (mode !== "bankrupt") {
        var trimTo = unit.enemyNeighbor ? minFrontline : minGarrison;
        if (val <= trimTo) continue;
        unit.land.type.val = trimTo;
        var oVal = unit.land.type.oVal;
        if (oVal == null || isNaN(oVal) || oVal > trimTo) {
          unit.land.type.oVal = trimTo;
        }
        saved += estimateMilitaryUpkeep(civ, val - trimTo);
        reduced += (val - trimTo);
      } else {
        if (unit.enemyNeighbor) {
          var keep = Math.max(minFrontline, 1);
          if (val <= keep) continue;
          unit.land.type.val = keep;
          var oVal2 = unit.land.type.oVal;
          if (oVal2 == null || isNaN(oVal2) || oVal2 > keep) {
            unit.land.type.oVal = keep;
          }
          saved += estimateMilitaryUpkeep(civ, val - keep);
          reduced += (val - keep);
        } else {
          unit.land.type = types.land;
          saved += estimateMilitaryUpkeep(civ, val);
          removed++;
        }
      }

      if (saved >= target) break;
    }

    if (removed || reduced) {
      recordAction(civ, "disband-units", {
        mode: mode,
        removed: removed,
        reduced: reduced,
        saved: Math.round(saved * 10) / 10
      });
      console.log("AI: Disband units for ", civName,
        "mode=", mode, "removed", removed, "reduced", reduced, "saved~", Math.round(saved * 10) / 10);
    }

    return saved;
  }

  function tryFixBankrupt(civ, civName) {
    if (!civ._parts?.map) return;

    var deficit = (civ.oldMoney - civ.newMoney) * 2 + 50;
    if (deficit < 0) return;

    if (civ.money < -100) {
      deficit *= Math.max(Math.abs(civ.money / deficit), 2);
    }

    var toRemove = Object.keys(civ._parts.map).map(function (x) {
      var pos = _regions_parseKey(x);
      return [pos[0], pos[1], data[pos[0]][pos[1]]];
    }).filter(function (x) {
      return x[2]?._exp > 1 && (Math.random() > 0.75 || x[2]?._exp > 10);
    }).sort(function (a, b) {
      return (b[2]._exp - a[2]._exp) || (a[2].pop - b[2].pop);
    });

    var totFixed = 0;
    var totDispPop = 0;
    var totRemoved = 0;
    for (var i = 0; i < toRemove.length; i++) {
      var x = toRemove[i];
      deficit -= x[2]._exp;
      totFixed += x[2]._exp;
      totDispPop += x[2].pop - 1;
      totRemoved++;
      x[2].type = types.land;
      if (deficit < 0) break;
      if (totDispPop / civ.pop > 0.10) break;
    }

    console.log("AI: Fix bankrupt for ", civName,
      "removed", totRemoved, "buildings worth expenses $", totFixed, "and pop=", totDispPop);
  }

  function handleGov(civ, civName) {
    var gov = civ.gov;
    var useMandateLogic = civ.mandate || civ.rchance > 0.05 || civ.happiness < 45;
    var modMap = useMandateLogic ? {
      "ORBRD": 8,
      "PIMHR": 2,
      "PDSCR": 3
    } : (
      civ.mandateInAcquirement ? {
        "MCCCT": 5,
        "PIMHR": 10,
        "OMVPC": 10,
        "ORBRD": 5
      } : {
        "PIMHR": 2,
        "OMVPC": 4,
        "ORBRD": 3
      }
    );

    var candidates = Object.values(gov.persons)
      .filter(x => x.pos === GOV_POSITIONS.BUREAUCRAT)
      .sort((a, b) => (person_custom_mod_value(b, modMap) -
        person_custom_mod_value(a, modMap)));

    var candidate = candidates[0];
    if (!candidate) return;
    gov_promote_to_advisors(gov, candidate);
    gov_refresh(civ, civName);
  }

  function tryResearch(civ) {
    var m = 300 + civ.money / 2 + civ.ii / 2 || 0;
    var p = 10 + civ.politic / 2;
    if (civ.money > m && civ.politic > p) {
      research();
    }
  }

  function tryBuild(civ, civName, maxMoney, type, price, econMod, popMod, cityOveride) {
    var moneySpent = price;
    var buildList = [];
    iterateMathRandom(function (row, col) {
      if (Math.random() < 0.25) return;
      var land = data[row][col];
      if (land &&
        (land.type && land.color === civName &&
          land.type.defend !== types.capital.defend &&
          land.type.defend !== types.school.defend &&
          land.type.defend !== types.finance.defend &&
          (cityOveride || land.type.defend !== types.city.defend))) {
        if (land.type && land.color === civName && land.type.defend === types.fort.defend) return;
        var bool = false;
        var built = false;
        var capital = false;
        var neighbor = false;
        getNeighbors(row, col, function (l2, r, c) {
          getNeighbors(r, c, function (l) {
            if (Math.random() < 0.8) return;
            if (l && l.color !== civName) built = true;
            if (l && l.type && l.type.defend === types.land.defend && Math.random() > 0.70) {
              built = built;
            } else if (l?.type &&
              l.type.defend !== types.land.defend &&
              l.type.defend !== types.capital.defend &&
              l.type.defend !== types.school.defend &&
              l.type.defend !== types.finance.defend &&
              l.type.defend !== types.fort.defend &&
              l.type.defend !== types.gate.defend) {
              built = civ.urban < 30 ?
                true :
                (civ.urban < 50 &&
                  (type === types.finance ||
                    (Math.random() > 0.6 && type === types.school) ||
                    l.type.defend === types.capital.defend) ?
                  Math.random() > 0.6 : true);
            }
          });
          if (l2 && l2.color === civName) {
            if (l2.type && l2.type.defend === types.capital.defend) capital = built = true;
            bool = true;
            if (l2.type &&
              l2.type.defend !== types.land.defend &&
              l2.type.defend !== types.capital.defend &&
              l2.type.defend !== types.school.defend) {
              built = l2.type.defend === types.city.defend && cityOveride ? built : true;
            }
          } else if (l2 && l2.color !== civName) {
            neighbor = true;
          }
        });
        if (neighbor && land.color === civName && type.defend === types.fort.defend && Math.random() > 0.6) {
          buildList.push([row, col]);
        } else if (bool && !built && !capital) {
          buildList.push([row, col]);
        }
      }
    });

    var B = 10000;
    var builtCount = 0;
    buildList.sort((a, b) =>
      Math.log((popv2_get_totpop(b[0], b[1]) + B) / B) -
      Math.log((popv2_get_totpop(a[0], a[1]) + B) / B) +
      ((res_pop_mod(b[0], b[1]) * popMod) + (res_econ_mod(b[0], b[1]) * econMod) + Math.random() * 0.1) -
      ((res_pop_mod(a[0], a[1]) * popMod) + (res_econ_mod(a[0], a[1]) * econMod) + Math.random() * 0.1)
    ).forEach(function (x) {
      var currentUrban = civ._aicitycount / civ.ii * 100;
      if (moneySpent > maxMoney || price > civ.money || civ.money < 0 ||
        (Math.min(civ.incomesRA, civ.income) / 3 < (currentUrban - 55) * 10)) {
        return;
      }
      civ._aicitycount++;
      var row = x[0];
      var col = x[1];
      var land = data[row][col];
      data[row][col] = {
        color: civName,
        type: type
      };
      if (land?._oldcolor) data[row][col]._oldcolor = land._oldcolor;
      if (land?._oct) data[row][col]._oct = land._oct;
      civ.money -= price;
      moneySpent += price;
      builtCount++;
    });
    return builtCount;
  }

  function tryBuildLand(civ, civName, maxMoney) {
    var moneySpent = civGetLandPrice(civ);
    if (moneySpent > maxMoney || civ.money < moneySpent) return 0;

    var buildList = [];
    iterateMathRandom(function (row, col) {
      if (Math.random() < 0.1) return;
      var land = data[row][col];
      if (land && !land.color) {
        var bool = false;
        getNeighbors(row, col, function (l2) {
          if (l2 && l2.color === civName) bool = true;
        });
        if (bool) buildList.push([row, col]);
      }
    });

    var builtCount = 0;
    buildList.sort((a, b) =>
      ((res_pop_mod(b[0], b[1]) * 2.0) + (Math.min(2, res_econ_mod(b[0], b[1])) * 1.0) + Math.random() * 0.1) -
      ((res_pop_mod(a[0], a[1]) * 2.0) + (Math.min(2, res_econ_mod(a[0], a[1])) * 1.0) + Math.random() * 0.1)
    ).forEach(function (entry) {
      var row = entry[0];
      var col = entry[1];
      if (moneySpent > maxMoney || civ.money < moneySpent) return;
      data[row][col] = {
        color: civName,
        type: types.land
      };
      civ.landsBuilt = (civ.landsBuilt || 0) + 1;
      getNeighbors(row, col, function (l, r, c) {
        if (!l.color) {
          data[r][c] = {
            color: civName,
            type: types.land
          };
        }
      });
      civ.money -= civGetLandPrice(civ);
      moneySpent += civGetLandPrice(civ);
      builtCount++;
    });
    return builtCount;
  }

  return publicAPI;
})();
