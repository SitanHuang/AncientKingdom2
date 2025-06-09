readMap();
TIMEOUT_DELAY = 150;
RCHANCEMOD = 1;
INCOMEMOD = 0.3;

lazyDrawCml = false;

_gallery_prev_year = 0;
_gallery_change_cml = 0;
GALLERY_MAX_YEARS = 12;
GALLERY_MIN_YEARS = 0.5;
GALLERY_TRIGGER_CHANGES = 0.2; // as percent of map size

var onRightClick = null;

ready = function () {
    drawCanvas();

    $('canvas').bind('wheel', function (e) {_gallery_change_cml
        e.preventDefault();
        if (e.originalEvent.wheelDelta / 120 > 0) {
            BLOCK_SIZE++;
        } else {
            BLOCK_SIZE--;
        }
        drawCanvas()
    }).click(function (e) {
        onClick(Math.floor(e.pageY / BLOCK_SIZE), Math.floor(e.pageX / BLOCK_SIZE));
    }).on("contextmenu", function(e) {
        if (onRightClick) {
            onRightClick(Math.floor(e.pageY / BLOCK_SIZE), Math.floor(e.pageX / BLOCK_SIZE));
        }
    });

    prepareTurn();
    refreshTable();
};

var i = -1;
var civOrders = Object.keys(civs).sort();

var buyClick = null;

function civGetLandPrice(civ) {
    return Math.min(800, Math.ceil(
        Math.max(
            0,
            100 * Math.sqrt(civ.landsBuilt || 0)
            - Math.max(0, (civ.years || 0) * 0.6)
        )
        + Math.max(0, (civ.ii || 0))
        + 200 // base price
    ));
}

buy = function (type, price) {
    $('#panel').hide();
    var civName = civOrders[i];
    var civ = civs[civName];
    if (civ.money < price) {
        alert('Not enough money.');
        drawCanvas();
        buyClick = null;
        return;
    }
    if ((type.draw.toString() == types.finance.draw.toString() && civ.happiness < 70) ||
        (type.draw.toString() == types.school.draw.toString() && civ.happiness < 60)) {
        alert('Not enough happiness.');
        drawCanvas();
        buyClick = null;
        return;
    }

    drawCanvas(function (row, col) {
        var land = data[row][col];
        if (land && land.color != civName && land.color != null) return false;
        if (land == null) return false;
        var bool = false;
        getNeighbors(row, col, function (land) {
            if (land && land.color == civName) {
                bool = true;
            }
        });
        return bool;
    });
    buyClick = function (row, col) {
        var land = data[row][col];
        if (land == null || (land && land.color != civName && land.color != null)) {
            alert('Land is null or already occupied.');
        } else {
            var bool = false;
            getNeighbors(row, col, function (land) {
                if (land && land.color == civName) {
                    bool = true;
                }
            });
            if (!bool) {
                alert('Land is not adjacent to your territory.')
            } else {
                if (type.defend == types.land.defend) {
                    civ.landsBuilt = (civ.landsBuilt || 0) + 1;

                    getNeighbors(row, col, function (l, r, c) {
                        if (!l.color) {
                            data[r][c] = {
                                color: civName,
                                type: type
                            };
                        }
                    })
                } else if (!land.color) {
                    alert('Land is not your territory.');
                    return;
                }
                data[row][col] = {
                    color: civName,
                    type: type,
                };
                // if (land.pop > 10000)
                //     data[row][col].pop = land.pop;
                if (land._oldcolor)
                    data[row][col]._oldcolor = land._oldcolor;
                if (land._oct)
                    data[row][col]._oct = land._oct;
                civ.money -= price;
                buyClick = null;
                drawCanvas();
            }
        }
        showInfo();
    }
};

research = function () {
    var civName = civOrders[i];
    var civ = civs[civName];

    var m = 300 + civ.money / 10 + civ.ii / 2 || 0;
    var p = 9 + civ.politic / 2;

    const oprop = 1 + (civ.gov?.mods?.OPROP || 0);

    if (civ.money < m || civ.politic < p) {
        alert("Failed. " + m + " money needed, " + p + " PP needed.")
    } else {
        civ.money -= m;
        civ.politic -= p;
        civ.technology += oprop;
    }

    showInfo();
};

battle = function (m1, m2, t1, t2) {
    t1 = Math.sqrt(t1);
    t2 = Math.sqrt(t2);
    var eM1 = m1 * t1;
    var eM2 = m2 * t2;
    var factor = eM2 / eM1;
    m1 = Math.floor((eM1 - eM2 * factor) / t1);
    m2 = Math.floor((eM2 - eM1 / factor) / t2);
    return [Math.max(m1, 0), Math.max(m2, 0)];
};

tryDeclareWar = function () {
    let c2 = prompt("To who?");
    if (!c2) return;
    let ii;
    for (ii = 0;ii < 1000 && !declareWar(civOrders[i], c2);ii++) ;
    if (ii < 1000)
        alert("Successful.");
    else
        alert("Failed.");
};
tryDeclareMajWar = function () {
    let c2 = prompt("To who?");
    if (!c2) return;
    let ii;
    for (ii = 0; ii < 1000 && !declareWar(civOrders[i], c2, undefined, undefined, 1.1); ii++);
    if (ii < 1000)
        alert("Successful.");
    else
        alert("Failed.");
};

move = function (cn1, pickedUp, p2, ai) {
    var row2 = p2[0];
    var col2 = p2[1];

    var l2 = data[row2][col2];
    var ddffeend = l2.type.draw.toString();

    var cn2 = l2.color;
    var c1 = civs[cn1];
    var c2 = civs[cn2];

    const l2DefMod = regions_defBonus(c2, cn2, row2, col2);

    var type = $.extend(true, {}, types.military);
    type.val = pickedUp.type.val;

    var result = [type.val, 0];

    var t1 = c1.technology;
    var t2 = c2.technology;

    t1 *= 1 + (c1.gov?.mods?.MCCCT || 0);
    t2 *= 1 + (c2.gov?.mods?.MCCCT || 0);
    t2 *= l2DefMod;

    if (l2._oldcolor == cn1) // if taking own territory back
        t1 = t1 * 1.50;
    else
        t1 = t1 * 0.75;

    if (cn1 == cn2) {
        if (data[row2][col2].type.val)
            data[row2][col2].type.val += type.val;
        else
            data[row2][col2].type = type;
        if (!ai) drawCanvas();
        return result;
    } else if (!c2) {
        data[row2][col2].type = type;
        data[row2][col2].color = cn1;
    } else if (typeof l2.type.val == 'undefined') {
        result = battle(pickedUp.type.val, l2.type.defend, t1, t2);
    } else {
        var m1 = pickedUp.type.val;
        var m2 = l2.type.val / 2;

        var eM1 = m1 * t1;
        var eM2 = m2 * t2;

        if (eM1 > eM2) {
            m1 = Math.ceil(pickedUp.type.val / 5);
            m2 = Math.ceil(l2.type.val / 5);
            m1s = pickedUp.type.val - m1;
            m2s = l2.type.val - m2;
            result = battle(m1, m2, t1, t2);
            c2.money -= result[0] / 25;
            c2.logistics += result[0] / 25;
            m1 = m1s + result[0];
            m2 = m2s + result[1];
            var broke = false;
            getNeighbors(row2, col2, function (u, r, c) {
                if (broke) return;
                if (u && u.color && u.color == cn2 && u.type.defend == types.land.defend) {
                    type = $.extend(true, {}, types.military);
                    type.val = m2;
                    type.oVal = pickedUp.type.oVal;
                    data[r][c].type = type;
                    broke = true;
                }
            });
            type = $.extend(true, {}, types.military);
            type.val = m1;
            type.oVal = pickedUp.type.oVal;
            let target = data[row2][col2];
            target.type = type;
            target.color = cn1;
            if (!target._oct || target._oct <= 0 || !target._oldcolor)
              target._oldcolor = cn2;
            target._oct = (target._oct || ((c1?.war[cn2] || c2?.war[cn1]) + 2.5) || 3) + 1;
            return [m1, m2];
        } else {
            result = battle(m1, m2, t1, t2);
        }

        m1 = Math.floor((eM1 - eM2) / t1);
        m2 = Math.floor((eM2 - eM1) / t2);
        // return [Math.max(m1, 0), Math.max(m2, 0)];

    }

    if (result) {
        if (result[1] == 0) {
            type.val = result[0];
            type.oVal = pickedUp.type.oVal;

            if (result[0] == 0) {
                type = types.land;
            }

            let target = data[row2][col2];
            target.type = type;
            target.color = cn1;
            if (!target._oct || target._oct <= 0 || !target._oldcolor)
              target._oldcolor = cn2;
            target._oct = (target._oct || ((c1?.war[cn2] || c2?.war[cn1]) + 2.5) || 3) + 1;
        } else if (result[1] > 0) {
            type.val = result[1];
            data[row2][col2].type = type;
        }

        let dPop = popv2_get_totpop(row2, col2);

        popv2_apply_delta(row2, col2, -dPop * Math.random() * 0.25);

        if (c2) {
            if (result[0]) {
              c2.money -= result[0] / 25;
              c2.logistics = c2.logistics ? c2.logistics + result[0] / 25 : result[0] / 25;

              let rate = Math.min(0.99, Math.max(0.8, 1 - result[0] * 500 * (1 + (c1.ii || 0) / 1000) / c1.pop)) || 0.97;
              let rate2 = Math.min(0.99, Math.max(0.8, 1 - dPop / c2.pop)) || 0.97;
              c2.happiness *= rate2;
              c2._hapDec *= rate2;
              c1.happiness *= rate;
              c1._hapDec *= rate;
            }
            if (((c2.money + c2.deposit < -100 || c2.politic < 0) && Math.random() < Math.min(1, 1 - c2.happiness / 100) * 0.3
                && c2.ii < 150 && c2.military < 50 && c2.deposit + c2.money < (c2.ii * c2.urban / 10) * 0.6) ||
                (ddffeend == types.capital.draw.toString() && Math.random() < 0.1 && c2.ii < 250)) {
                for (var row = 0; row < data.length; row++) {
                    var rowData = data[row];
                    for (var col = 0; col < rowData.length; col++) {
                        var land = data[row][col];
                        if (land && land.color == cn2 && Math.random() < 0.9 &&
                            (land.type.defend != types.city.defend || Math.random() < 0.7)) {
                            land.color = cn1;
                            if (!land._oct || land._oct <= 0 || !land._oldcolor)
                              land._oldcolor = cn2;
                            land._oct = (land._oct || ((c1?.war[cn2] || c2?.war[cn1]) + 2.5) || 3) + 1;
                        }
                    }
                }
            }
        }
    }
if (!ai) drawCanvas();
    return result;
};
turn = 0;
averageData = {income: 0, happiness: 0, logistics: 0, technology: 0, ii: 0, politic: 0, money: 0, population: 0}
poptable_hook(averageData);
max_pop = 200000;
max_econ = 0;
max_pop_country = 200000;
max_econ_country = 0;

endTurn = function () {
    turn++;
    let _startTime = new Date().getTime();
    var civName = civOrders[i];
    var civ = civs[civName];
    civ.military = 0;
    civ.years = civ.years ? civ.years + 0.25 : 0.25;
    civ.technology = Math.max(Math.round(civ.technology * 1000) / 1000, 1);
    civ.money = !Number.isFinite(civ.money) || Number.isNaN(civ.money) ? 0 : civ.money;
    let oldtech = civ.technology;

    if (civ.birth &&
        !(data[civ.birth[0]] && data[civ.birth[0]][civ.birth[1]])) {
        delete civ.birth;
    }
    if (civ.capital &&
        !(data[civ.capital[0]] && data[civ.capital[0]][civ.capital[1]])) {
        delete civ.capital;
    }

    const oldRealInc = (civ.income + 10) / (1 - (civ.imodDueToReserve || 0));

    civ.imodDueToReserve = 0;
    if (civ.income > 100 && oldRealInc > 100 && civ.money > 100 && civ.ii > 10 && civ.money / oldRealInc > 4)
        civ.imodDueToReserve = Math.min(0.9, Math.max(0, Math.log(civ.money / oldRealInc - 3) * 0.2));
    const imodDTR = civ.imodDueToReserve;
    civ.happiness = !isNaN(civ.happiness) ? civ.happiness + (1.5 - civ.happiness / 100) : 60;
    civ.happiness = Math.round(Math.max(0, Math.min(100, civ.happiness)) * 100) / 100;
    civ.politic = civ.politic || 0;
    civ.neighbors = civ.neighbors || {};
    civ.totalNeighbors = civ.totalNeighbors || {};
    civ.nextDecline = civ.nextDecline || 0;
    civ.migrantsOutTotal = 0;
    civ._migrantsOutSuccessfulLast = civ.migrantsOutSuccessful || 0;
    civ.migrantsOutSuccessful = 0;
    civ._migrantsInLast = civ.migrantsIn || 0;
    civ.migrantsIn = 0;
    civ._hapDec = 1;
    civ.inGatesDisallowed = civ.inGatesDisallowed || {};
    civ.outGate = civ.outGate === undefined ? true : civ.outGate;
    civ._perished = 0;

    let _newColorGrid = data.map(x => x.map(x => null));

    if (!civ.gov)
        gov_init(civ, civName);

    popv2_init();

    civ._migrantInfo = {
        alleviatedFromOut: {happiness: 1},
        unrestFromIn: {happiness: 1, rchance: 1},
        from: {},
        to: {}
    };

    let happinessBK = {};
    civOrders.forEach(x => {
        happinessBK[x] = Math.min(150, Math.max(1, civs[x].happiness)) || 0;
    });

    let totalGateAllowed = 0;
    for (let cn2 in civ.neighbors) {
        let n = civs[cn2]?.inGatesDisallowed;
        if (n && !n[civName]) {
            totalGateAllowed += civ.neighbors[cn2] * (happinessBK[cn2] || 1) || 1;
        }
    }
    for (let cn2 in civ.neighbors) {
        let n = civs[cn2]?.inGatesDisallowed;
        if (n && !n[civName]) {
            civ._migrantInfo.to[cn2] = [0, civ.neighbors[cn2] * happinessBK[cn2] / totalGateAllowed];
        }
    }

    const edpig = 1 + (civ.gov.mods.EDPIG || 0);
    const edpmx = 1 + (civ.gov.mods.EDPMX || 0);

    let depositCap = civ.ii * civ.urban * edpmx / 10 || 0;

    // fixes exploit from depositing a ton before endturn
    if (civ.deposit > depositCap) {
        let diff = civ.deposit - depositCap;
        civ.deposit -= diff;
        civ.money += diff;
    }

    let oldMoney = civ.money;

    civ.depRate = 1 + (0.10 * edpig);
    civ.deposit = (civ.deposit ? civ.deposit : 1) * (depositCap ? civ.depRate : 0.5);
    civ.incDep = 0;
    if (depositCap > 0 && civ.deposit > depositCap) {
      let diff = civ.incDep = civ.deposit - depositCap;
      civ.deposit -= diff;
      civ.money += diff;
    }

    civ._polFromAllies = 0;
    civ._techFromAllies = 0;
    calculateYears(civ,civName);

    var ii = 0;
    var occupiedII = 0;
    var takeControls = $('#takeControls');
    takeControls.children().remove();

    civOrders.forEach(function (name) {
        if (civs[name].ai) {
            takeControls.append('<button onclick="delete civs.' + name + '.ai">Play ' + name + '</button>')
        }
    });


    let cityCount = 0;
    let income = 0;
    let expense = 0;
    let oldpop = civ.pop || (civ.pop = 0);
    civ.pop = 0;

    poptable_hook(civ);

    civ.pm = 0;
    civ.em = 0;
    civ.pmb = 0;
    civ.emb = 0;
    civ.teb = 0;
    let tebi = 0;
    let pmbi = 0;
    let embi = 0;

    const pdscr = 1 + (civ.gov.mods['PDSCR'] || 0);
    const dchance1 = 0.02 * pdscr;
    const dchance2 = 0.001 * pdscr;
    let maginitude = Math.random() < dchance1 ? 0.2 * Math.random() : (Math.random() < dchance2 ? 0.4 : 0);
    if (maginitude && civ.ii > 2) {
        if (civ.money > 0)
            civ.money *= maginitude;
        if (civ.deposit > 0)
            civ.deposit *= maginitude;
        gov_opinion_disaster(civ, civName, civ.gov);
        push_msg(`Natural disasters in ${civName} is causing famines killing ${maginitude * 100 | 0}% of population.`, [civName, ...Object.keys(civ.neighbors)]);
    }

    let neighbors = {};
    let totalNeighbors = 0;
    let nextDecline = oldpop * maginitude;
    nextDecline += civ.nextDecline || 0;

    max_pop = 0;
    max_econ = 0;

    iterateMathRandom((row, col) => {
        let d = data[row][col];

        let dPop = popv2_get_totpop(row, col);

        max_pop = Math.max(max_pop, dPop);
        if (d?._econ)
          max_econ = Math.max(max_econ, d._econ);

        _newColorGrid[row][col] = d?.color || null;

        if (!d || !d.color || !d.type) return;

        if (data._cgrid && data._cgrid[row][col] != d?.color)
            _gallery_change_cml += 1 / data.length / data[0].length;

        if (d.type.draw.toString() == types.capital.draw.toString()
            && civs[d.color] && !civs[d.color].birth) {
            civs[d.color].birth = [row, col];
        }
        if (d.color == civName) {
            civ.pm += res_pop_mod(row, col);
            civ.em += res_econ_mod(row, col);
            /*
             * disabling this so borders only change at war end*/
            if (d._oct) {
              d._oct--;
            }
            /* */
            if (!d._oct || d._oct < 0 || d._oldcolor == d.color) {
              delete d._oldcolor;
              delete d._oct;
            }
            getNeighbors(row, col, (d2, r, c) => {
                if (d2?.type && d2?.color != civName && d2.color) {
                    // d._adj = r == row - 1 && c == col ? 1 :// top
                    //          r == row + 1 && c == col ? 2 : // bottom
                    //          r == row && c == col - 1 ? 3 : 4; // left, right
                    neighbors[d2.color] = (neighbors[d2.color] || 0) + 1;
                    totalNeighbors++;
                }
            });

            // !!! WORK ZONE START !!!

            popv2_clamp_max(row, col, 1500000);

            let noGrowth = true;
            d.growth = 1.001;
            let cap = 30000 * res_pop_mod(row, col);

            if (d && (d.type.draw.toString() == types.city.draw.toString() ||
                        d.type.draw.toString() == types.town.draw.toString() ||
                        d.type.draw.toString() == types.school.draw.toString() ||
                        d.type.draw.toString() == types.headquarter.draw.toString())) {
                d.growth = dPop < 70000 ? 1.025 : 1.005;
                nextDecline -= (dPop < 70000 ? 0.025 : 0.005) * dPop * 0.10;
                cityCount++;
                cap *= 20;
                noGrowth = false;
            } else if (d && d.type.draw.toString() == types.finance.draw.toString()) {
                d.growth = dPop < 100000 ? 0.045 : 0.0090;
                d.growth *= 1 + (civ.gov.mods.EFNPG || 0);
                d.growth += 1;
                nextDecline -= (dPop < 100000 ? 0.045 : 0.009) * dPop * 0.05;
                cityCount+=2;
                cap *= 30;
                noGrowth = false;
            } else if (d && d.type.draw.toString() == types.capital.draw.toString()) {
                d.growth = dPop < 150000 ? 1.050 : 1.01;
                nextDecline -= (dPop < 150000 ? 0.050 : 0.01) * dPop * 0.01;
                cityCount+=2;
                cap *= 50;
                noGrowth = false;
            } else if (d && d.type.val > 0) {
                // nextDecline += d.type.val * (civ.ii || 100);
            }

            if (noGrowth) {
                cap *= res_pop_mod(row, col);
            }

            if (d.growth > 1) {
                civ.pmb += res_pop_mod(row, col);
                pmbi++;

                d.growth -= 1;
                d.growth *= 1 + (civ.gov.mods["PPPGR"] || 0);
                d.growth += 1;
            }

            if ((!dPop || dPop < 1000) && d.growth > 1) {
                // assign normal population on start of game

                let init;
                if (turn <= civOrders.length * 2)
                    init = d.type.defend * 5000 * Math.random() * (res_pop_mod(row, col) + 0.3) * res_pop_mod(row, col);
                else
                    init = d.type.defend * 2500 * Math.random() * Math.pow(res_pop_mod(row, col), 2);

                popv2_apply_delta(row, col, init);
                dPop = popv2_get_totpop(row, col);
            }

            let urb = Math.max(1, civ.urban) || 10;

            // distributed growth depends on res_pop_mod
            let decline = !noGrowth ? (nextDecline < 0 ? nextDecline / urb * 10 * Math.random() * res_pop_mod(row, col) : Math.min(nextDecline, dPop / 1.5, nextDecline / urb * 10 * Math.random())) : 0;

            if (decline < 0 && dPop > cap)
              decline /= 20;

            decline = Math.min(50000, decline);

            nextDecline -= decline;

            d._d = decline;

            // use carrying capacity equation
            // 1/25/23 LMAO growth rate cant be negative, this feature was broke since the beginning
            let delta = Math.max(0, dPop > cap ? 0.05 : (d.growth - 1)) * dPop * (1 - dPop / cap);
            if (delta > 0) {
                delta *= res_pop_mod(row, col);
                delta *= Math.random() * 1.2 - 0.2;
                delta += (d.growth > 1 ? 100 : 0) * res_pop_mod(row, col);
            } else {
                delta /= res_pop_mod(row, col);
            }
            // if (delta > 0)
            //    nextDecline -= delta / 10;

            delta -= decline;

            let decline2 = decline;
            if (delta < -50) {
                // around 25%
                let migrants = -(delta * Math.random() * 0.5 | 0);
                // other 35% move domestically
                if (noGrowth)
                  nextDecline += (delta * Math.random() * 0.7) | 0;
                civ.migrantsOutTotal += migrants;
                if (civ.outGate) {
                    for (let cn2 in civ.neighbors) {
                        let n = civs[cn2]?.inGatesDisallowed;
                        let civ2 = civs[cn2];
                        if (n && !n[civName] && civ2._migrantInfo) {
                            let _m = Math.max(0, Math.min(migrants, (migrants * civ.neighbors[cn2] * happinessBK[cn2] / (totalGateAllowed + 1) | 0) || 0));
                            delta += _m;
                            decline2 -= _m;
                            civ2.migrantsIn += _m;

                            let pop = Math.min(100000, civ2.pop) || 100000;
                            const piwhr = 1 + (civ2.gov?.mods?.PIMHR || 0);
                            const hapDrop = (_m / (pop)) / 2 * piwhr;
                            civ2.happiness *= (1 - hapDrop) || 1;
                            civ2.rchance *= (1 + (_m / pop * 4 * piwhr)) || 1;
                            civ2.rchance = Math.min(civ2.rchance, 0.35);
                            civ2.nextDecline -= _m;

                            if (civ2._migrantInfo) {
                                civ2._migrantInfo.unrestFromIn.happiness *= (1 - hapDrop) || 1;
                                civ2._migrantInfo.unrestFromIn.rchance *= (1 + (_m / pop * 4) * piwhr) || 1;
                                civ2._migrantInfo.from[civName] = (civ2._migrantInfo.from[civName] || 0) + _m;
                            }

                            civ._migrantInfo.to[cn2][0] += _m;
                            civ.migrantsOutSuccessful += _m;
                        }
                    }
                }
            }

            if (oldpop > 1000) {
                let rate = Math.pow((1 - (decline2 / (oldpop + 1) / 5)) || 1, 2);
                if (delta < -50)
                    civ._migrantInfo.alleviatedFromOut.happiness *= Math.pow(((1 + (decline2 / (oldpop + 1) / 5)) || 1) / ((1 + (decline / (oldpop + 1) / 5)) || 1), 2);
                civ.happiness *= rate;
                civ._hapDec *= rate;
            }

            dPop = popv2_get_totpop(row, col);

            popv2_apply_delta(row, col, -dPop * 0.04);
            popv2_apply_delta(row, col, dPop * 0.04);

            popv2_apply_delta(row, col, Math.round(delta + 1));

            popv2_record_history(row, col);

            poptable_add_from_pt(civ, row, col);

            dPop = popv2_get_totpop(row, col);

            // legacy:
            d.pop = dPop;

            civ.pop += dPop;
            max_pop = Math.max(max_pop, dPop);

            // !!! WORK ZONE END !!!

            let _oldmoney = civ.money + 0;
            let _oldtech = civ.technology + 0;
            let _oldhap = civ.happiness + 0;

            d.type.income(civ);

            let change = civ.money - _oldmoney;

            // hack
            if (Math.abs(change) > 10000) {
              civ.money = _oldmoney;
              change = 0;
            }

            if (change > 0) {
                // if (!noGrowth) {
                const baseline = 40000;
                const refPop = Math.max(Math.min(1500000, dPop), 1000);
                const efficiency = Math.log((refPop + baseline) / baseline) + (1 - Math.log(2));

                let nchange = change * efficiency * res_econ_mod(row, col);
                // 2/20/24, adjusting for lower population, hence the 0.10
                nchange *= 1 + (civ.gov.mods.EGRVG || 0) - INCOMEMOD - imodDTR + 0.15; // econ reduction factor

                const taxEff = regions_taxEff(civ, civName, row, col);
                tebi += nchange;
                nchange *= taxEff; // tax efficiency
                civ.teb += nchange;

                d._econ = nchange;
                civ.money -= change - nchange;
                income += nchange;
                civ.emb += res_econ_mod(row, col);
                embi++;
                // } else {
                //     income += change;
                //     d._econ = change;
                // }
                max_econ = Math.max(max_econ, d._econ);
            } else {
                d._exp = -change;
                expense -= change;
            }

            change = civ.technology - _oldtech;
            if (change > 0) {
                let nchange = change * dPop / 150000;
                nchange *= 1 + (civ.gov.mods.OSTOI || 0);
                civ.technology -= change - nchange;
            };

            change = civ.happiness - _oldhap;
            if (change > 0) {
                let nchange = change * dPop / 150000;
                nchange *= 1 + (civ.gov.mods.EHPGR || 0);
                civ.happiness -= change - nchange;
            };

            ii++;
            if (d._oldcolor && d._oldcolor != d.color)
                occupiedII++;
        }
        if (d.type.val <= 0) d.type = types.land;
        if (d.type.val && d.color == civName) {
            civ.military += d.type.val;
            if (isNaN(d.type.oVal)) {
                d.type.oVal = d.type.val;
            }
            if (civ.money > d.type.val / 2
                && d.type.oVal >= d.type.val) {
                d.type.val += 5;
                civ.money -= 0.55;
                expense += 0.55;
            }
        }
    });

    data._cgrid = _newColorGrid;

    civ._parts && ++civ._parts.lastUpdated; // update yearly parts cache counter

    // for (var row = 0; row < data.length; row++) {
    //     var rowData = data[row];
    //     for (var col = 0; col < rowData.length; col++) {

    //     }
    // }
    civ.ii = ii;
    civ.occupiedII = occupiedII;
    civ.nextDecline = nextDecline || 0;
    civ.popchange = Math.round((civ.pop = Math.round(civ.pop)) - oldpop);
    civ.popchangeperc = Math.round(civ.popchange / (oldpop || Infinity) * 10000) / 100;

    civ.popchangepercs = civ.popchangepercs || [0, 0, 0, 0, 0];
    civ.popchangepercRA = rollingAverage(civ.popchangepercs, civ.popchangeperc, 5) || 0;
    civ.popchangepercRA = Math.round(civ.popchangepercRA * 100) / 100;

    civ.technology = Math.round(civ.technology * 1000) / 1000;
    civ.techinc = Math.round((civ.technology - oldtech) * 1000) / 1000;

    civ.techincs = civ.techincs || Array(8).fill(0);
    civ.techincRA = rollingAverage(civ.techincs, civ.techinc, 8) || 0;
    civ.techincRA = Math.round(civ.techincRA * 1000) / 1000;

    civ.happiness -= Math.max(Math.round(civ.years / 100) - 0.80, 0);
    civ.happiness -= Math.max(Math.round(civ.ii / 300), 0) - 0.55;
    civ.happiness -= Math.max(Math.round(civ.occupiedII / 100), 0);
    civ.politic -= Math.max(Math.round(civ.years / 5), 0);
    civ.neighbors = neighbors;
    civ.totalNeighbors = totalNeighbors;
    civ._avgpm = Math.round(civ.pm / (civ.ii + 1) * 100) / 100;
    civ._avgem = Math.round(civ.em / (civ.ii + 1) * 100) / 100;
    if (pmbi)
        civ.pmb = Math.round(civ.pmb / (pmbi) * 100) / 100;
    if (embi)
        civ.emb = Math.round(civ.emb / (embi) * 100) / 100;
    if (tebi)
        civ.teb = Math.round(civ.teb / (tebi) * 100) / 100;

    max_pop_country = 0;
    max_econ_country = 0;
    max_avg_pm_country = 0;
    max_avg_em_country = 0;
    Object.values(civs).forEach(x => {
      max_pop_country = Math.max(x.pop || 0, max_pop_country);
      max_econ_country = Math.max(x.income || 0, max_econ_country);
      max_avg_pm_country = Math.max(x._avgpm || 0, max_avg_pm_country);
      max_avg_em_country = Math.max(x._avgem || 0, max_avg_em_country);
    });

    if (civ.birth && data[civ.birth[0]][civ.birth[1]].color == civName) {
        data[civ.birth[0]][civ.birth[1]].type = types.capital;
    } else
        civ.politic /= 3;

//     let expense = civ.military / 2.0;
//     let income = expense - oldMoney + civ.money;

    civ.income = Math.round(income * 100) / 100;

    civ.incomes = civ.incomes || Array(12).fill(0);
    civ.incomesRA = rollingAverage(civ.incomes, civ.income, 12) || 0;
    civ.incomesRA = Math.round(civ.incomesRA * 100) / 100;

    let oldInc = civ.incomes[civ.incomes.length - 2] || Infinity;
    let incomeRAdiff = Math.round((civ.income - oldInc) / oldInc * 10000) / 100;

    civ.incomeRAdiffs = civ.incomeRAdiffs || Array(12).fill(0);
    civ.incomeRAdiffsRA = rollingAverage(civ.incomeRAdiffs, incomeRAdiff, 12) || 0;
    civ.incomeRAdiffsRA = Math.round(civ.incomeRAdiffsRA * 100) / 100;

    // civ.expense = Math.round((expense + ((((civ.ii / 900 + 0.2) * civ.ii)))) * 100) / 100;
    civ.expense = Math.round(expense * 100) / 100;
    civ.oldMoney = Math.round(oldMoney * 100) / 100;
    civ.urban = Math.round(cityCount / ii * 10000) / 100;
    civ._aicitycount = cityCount;
    civ.cityCount = cityCount;
    // this shouldn't be too non-linear due to tax eff factoring radius (5/12/2024)
    civ.govExp = (civ.ii / 2000 + 0.17) * civ.ii + (civ.occupiedII / 40 + 0.5) * civ.occupiedII;
    if (civ.money < civ.govExp) {
        civ.govExp = 0;
        civ.rchance *= 1.2;
    }
    civ.money = Math.round((civ.money - (civ.govExp)
      + (civ.deposit < 0 ? civ.deposit / 10 : 0)) * 100) / 100;
    civ.spentOnUrban = 0;
    const puofc = 1 + (civ.gov.mods.PUOFC || 0);
    if (civ.ii > 50 && civ.urban > 55)
        civ.money -= (civ.spentOnUrban = (civ.urban - 55) * 10 * puofc);
    civ.newMoney = civ.money;
    if (isNaN(civ.money)) civ.money = 0;
    let polCap = Math.max(civ.ii / 10, 30);
    polCap *= 1 + (civ.gov.mods.OPPCP || 0);
    const oppgn = 1 + (civ.gov.mods.OPPGN || 0);
    civ.politic = Math.max(Math.min(Math.round((civ.politic * (civ.happiness / 100) + 5 * oppgn) * 100) / 100 + (civ.money / 250 + (civ.gov.cohesion - 1) * 5) * oppgn, polCap), -50);
    // averageData = {happiness: 0, logistics: 0, technology: 0, ii: 0, politic: 0}
    averageData.population += civ.pop;
    averageData.happiness += civ.happiness;
    averageData.logistics += civ.logistics;
    averageData.technology += civ.technology;
    averageData.politic += civ.politic;
    averageData.money += civ.money;
    averageData.income += civ.income;
    poptable_add(averageData, poptable_get_popObj_from_poptable(civ));
    civ.logistics = 0;

    dynasty_assign_candidate();

    if ((civ.money < 0 || civ.deposit < 10) && civ.gov?.cohesion > 0) {
        gov_opinion_bankrupt(civ, civName, civ.gov);
    }

    if (civ.ii > 0)
        gov_exec(civ, civName);

    // rebel pops: for own civ
    if (Math.random() < civ.rchance && Math.random() < RCHANCEMOD) {
        console.log("== triggering rebellion in", civName, "with chance=", civ.rchance);
        push_msg(`Rebellions in ${civName} are attempting an uprising.`, [civName, ...Object.keys(civ.neighbors)]);
        if (popRebel(null, civName))
            civ.rchance *= 0.35;
    }

    // rebel pops: for perished civs
    if (ii <= 2 && turn >= 10 * 4 * civOrders.length && (Math.random() < 0.0012
    // || (1 + turn) % (88 * 4 * civOrders.length) <= 14
    ) && civ.technology >= 0 && Math.random() < RCHANCEMOD) {
       // auto pick target
        console.log("## triggering rebellion for", civName);
        if (Math.random() < 0.7 && civ.birth) {
            let targetCiv = data[civ.birth[0]][civ.birth[1]].color;
            targetCiv.rchance *= 100; // cause a cascade
            if (popRebel(civName, targetCiv, civ.birth))
              push_msg(`Descendants of ${civName} are attempting an uprising in ${targetCiv}.`, [civName, targetCiv]);
        } else {
            delete civ.birth;
            popRebel(civName);
        }
    }

    if (civ.ii >= 2) {
        let rchance = (20 / Math.max(1, civ.happiness) - 0.1) + ((Math.max(0, 1 - civ.gov.cohesion)) || 0);
        rchance *= (1 + rchance);
        rchance *= 0.0001 * (1 + civ.ii / data.length / data[0].length * 10) * (1 + civ.years / 75);
        if (civ.ii < 200)
            rchance /= 10;
        if (civ.popchangeperc < 0)
            rchance *= Math.pow(-civ.popchangeperc, 2.25);
        if (civ.income < civ.ii)
            rchance *= 1.1;
        if (civ.deposit < civ.ii * 2)
            rchance *= 1.2;
        if (civ.politic < 5)
            rchance *= 1.3;
        if (civ.happiness < 50)
            rchance *= 1.4;
        if (civ.happiness < 0)
            rchance *= 1.5;
        if (civ.gov.cohesion > 1)
            rchance *= 0.8;
        if (civ.gov.cohesion > 1.1)
            rchance *= 0.8;
        if (civ.gov.cohesion > 1.2)
            rchance *= 0.6;
        if (civ.gov.cohesion > 1.4)
            rchance *= 0.5;
        if (civ.gov.cohesion < 0.9)
            rchance *= 1.5;
        if (civ.gov.cohesion < 0.85)
            rchance *= 1.5;
        if (civ.gov.cohesion < 0.45)
            rchance *= 2.5;
        civ.rchance = rchance > civ.rchance ? rchance : (civ.rchance || 0) * 0.3 + rchance * 0.7;
        civ.rchance *= 1 + (civ.gov.mods.ORBRD || 0);
    } else {
        civ.landsBuilt = 0;

        civ.rchance = 0;
        civ.years = 0;
        civ.technology = 0;

        if (civ.birth) {
            let occupier = data[civ.birth[0]][civ.birth[1]]?.color;

            if (occupier = civs[occupier]) {
                // eternal unrest for perished civs
                occupier.rchance = occupier.rchance * 1.05 + 0.0025;
                occupier._perished++;
            }
        }
    }

    civ.rchance *= 1 + civ.rchance;
    civ.rchance = Math.min(0.50, civ.rchance);

    document.getElementById('tickTime').innerText = 'Tick: ' + (new Date().getTime() - _startTime).toFixed("0") + 'ms';
    prepareTurn();


    delete window.pickedUp;
};

// if civ doesnt have birth, will assign birth
popRebel = function (civName, target, source) {
    if (!civName) {
        // need to find a rebel
        let candidates = civOrders.filter(x => civs[x].ii <= 2 && civs[x].technology >= 0).sort(() => Math.random() - 0.5);

        // find a perished civ inside target
        for (let cn of candidates) {
            if (civs[cn].birth && data[civs[cn].birth[0]][civs[cn].birth[1]]?.color == target) {
                civName = cn;
                break;
            }
        }

        if (!civName && !(civName = candidates[0]))
            return false;
    }
    let civ = civs[civName];
    if (!target) {
        let choices = civOrders.filter(x => civs[x].ii >= 2).sort((a, b) => civs[b].ii - civs[a].ii);

        let totChances = choices.reduce((prev, x) => prev + civs[x].rchance, 0);

        let adjusted = choices.map(x => [x, Math.sqrt(civs[x].rchance / totChances)]);

        if (!adjusted.length)
            return false;

        let i = 0;
        while (!target) {
            let chance = (adjusted[i][1] += 0.1);
            console.log('Rebel ->', adjusted[i][0], chance);
            if (Math.random() < chance)
                target = adjusted[i][0];
            if (++i >= adjusted.length)
                i = 0;
        }
    }
    // really shouldn't be popping rebels due to descendants when rchance < 0.1%
    // this allows for actual peace periods instead of non stop wars
    // a good balance between 1 civ domination and multi
    if (Math.random() >= civs[target].rchance * 1000) {
      return false;
    }
    if (!source) {
        // find target city
        let choices = [];
        for (let r = 0;r < data.length;r++) {
            for (let c = 0;c < data[r].length;c++) {
                let d = data[r][c];
                let dPop = popv2_get_totpop(r, c);
                if (d?.color == target && d?.growth >= 1)
                    choices.push([r, c, (d._d + dPop) / regions_taxEff(civs[target], target, r, c)]);
            }
        }
        source = choices.sort((a, b) => b[2] - a[2])[0]?.splice(0, 2);
        if (source)
            civ.birth = source;
        else
            source = [data.length, data[0].length].map(x => x * Math.random() | 0);
    }
    if (civName == target) return false;
    console.log('Rebel=', civName, ': target=', target, 'source=', source);

    civ.ii = 1;
    let oldii = civs[target].ii;

    // circle method (old)
    findNearbyCitiesOfLargestCiv(source, civName, target);

    let targetBirth = civs[target].birth;

    // old civ's birth is inside new nation -> need to remove birth so it
    // doesn't cause eternal unrest in new nation
    if (targetBirth && data[targetBirth[0]][targetBirth[1]]?.color == civName)
        delete civs[target].birth;

    civs[target].happiness *= 0.6;
    civs[target].politic *= 0.4;

    if (civs[target].gov)
        gov_opinion_rebel(civs[target], target, civs[target].gov);

    civ.war = civ.war || {};
    civs[target].war = civs[target].war || {};
    delete civs[target].war[civName];
    delete civ.war[target];

    civ.landsBuilt = Math.ceil((civs[target].landsBuilt || 0) * 0.8);

    civ.money = 100 + civ.ii * 5;
    civ.politic = 50;
    civ.happiness = 100;
    civ.rchance = 0;
    civ.years = 0;

    delete civ.gov;
    gov_init(civ, civName);
    gov_exec(civ, civName);

    if (civs[target].deposit > 0) {
        civ.deposit = civs[target].deposit * civ.ii / oldii;
        civs[target].deposit -= civ.deposit;
        civ.money += civs[target].money * civ.ii / oldii;
        civs[target].money -= civ.money;
    } else {
        civ.deposit = 1000;
    }


    var sum = 0;

    if (Math.random() < 0.8 || civs[target].mandate > 1)
        declareWar(target, civName, true, `as a result of the ${civName} rebellion.`, 5 + 5*(civs[target].rchance || 0))

    civOrders.forEach(function (civN) {
        sum = Math.max(civs[civN].technology, sum);
    });

    civ.technology = Math.max(1, sum * (Math.random() * 0.5 + 0.5));

    if (!civ.birth) return true;

    let b = civ.birth;
    b = data[b[0]][b[1]];
    if (b.color == civName && b.type.draw.toString() != types.capital.draw.toString()) {
        b.type = types.capital;
    }

    return true;
};

showInfo = function () {
    var civ = civs[civOrders[i]];
    var tributeToOthersText = "<div style='max-height: 5em;overflow: auto;border: 1px dashed grey;'>";
    var tributeToOther = civ.tributeToOther || {};
    var tributeToMe = civ.tributeToMe || {};

    Object.getOwnPropertyNames(tributeToOther).forEach(x => {
        let out = tributeToOther[x];
        let inp = tributeToMe[x] || 0;
        let net = inp - out;
        tributeToOthersText += ` ${net > 0 ? '+' : '-'} Tribute out ${Math.round(out * 100) / 100} in ${Math.round(inp * 100) / 100} with ${x} (net ${Math.round(net * 100) / 100})\n`;
    });
    tributeToOthersText += '</div>';

//     var tributeToMeText = "";

//     Object.getOwnPropertyNames(tributeToMe).forEach(x => {
//         tributeToMeText += ` + Tribute ${Math.round(tributeToMe[x] * 100) / 100} from ${x}\n`;
//     });

    $('#panel').show().children('div').hide();
    $('#panel button.buyLand').text(`land $${civGetLandPrice(civs[civOrders[i]])}`);
    $('#turn').html('<h2></h2>');
    const edpmx = 1 + (civ.gov?.mods?.EDPMX || 0);

    let depositCap = civ.ii * civ.urban * edpmx / 10 || 0;
    $('#turn').show()
        .find('h2')
        .text("Player " + civOrders[i] + "'s turn")
        .css('background', civ.color)
        .css('color', civ.fontColor)
        .parent()
        .append(
            $('<pre></pre>')
                .html(
                    "Reserve: " + civ.money + "\n" +
                    "Deposit: " + Math.floor(civ.deposit * 100) / 100 + `/${Math.floor(depositCap)}(${Math.round((civ.depRate - 1)*100*100)/100}% interest)\n` +
                    `Technology: ${civ.technology} (+${civ.techinc}, ${civ._techFromAllies ? `${civ._techFromAllies} from allies, ` : ''}8-turn RA=+${civ.techincRA})\n` +
                    "Political Powers: " + civ.politic + (civ._polFromAllies ? ` (${Math.round(civ._polFromAllies * 100) / 100} from allies) \n` : '\n') +
                    `Legitimacy: ${Math.round(civ.gov?.cohesion * 10000) / 100}\n` +
                    "Population: " + civ.pop + ` (+${civ.popchange}, +${civ.popchangeperc}%, 4-turn RA=+${civ.popchangepercRA}%)\n` +
                    "Military(Until last turn): " + civ.military + "\n" +
                    `Happiness: ${Math.round(civ.happiness * 100) / 100} % (Rebellion chance: ${Math.round(civ.rchance * 100000) / 1000}%; x${Math.round((civ._hapDec) * 100) / 100} from unnatural deaths; ${civ._perished || 0} rebel movements)\n` +
                    "Urbanization: " + civ.urban + "% (" + civ.cityCount + ")\n" +
                    `Migrants: ${civ.migrantsOutTotal} total displaced, ${civ.migrantsOutSuccessful} migrated out, ${civ.migrantsIn} in; net=${civ.migrantsIn - civ.migrantsOutSuccessful} <button onclick="manageMigrants()">Manage</button>\n` +
                    "==Statistics==\n" +
                    "        " + (civ.oldMoney) + "\n" +
                    ` + Tax     ${civ.income} (12-turn RA=$${civ.incomesRA}, +${civ.incomeRAdiffsRA}%, reduction due to high reserve: -${Math.round(civ.imodDueToReserve * 10000) / 100}%, tax eff. = ${Math.round(civ.teb*100)}%) \n` +
                    (civ.spentOnUrban > 0 ? ` - Urban overflow $${Math.round(civ.spentOnUrban * 100) / 100}\n` : "") +
                    " - Expense " + Math.round((civ.expense) * 100) / 100 + "  (Logistics " + civ.logistics + ")\n" +
                    " - Gov     " + Math.round(civ.govExp * 100) / 100 + "  (Government Offices in " + civ.ii + " counties, " + civ.occupiedII + " are occupied)\n" +
                    " + Ints    " + Math.round(civ.incDep * 10000) / 10000 + "  (interest overflow from deposit)\n" +
                    tributeToOthersText +
                    " = " + civ.newMoney + ` (net: ${Math.round((civ.newMoney - civ.oldMoney) * 100) / 100})`
                )
        ).append(civ.technology == -1 ?
        'Place the capital and get started.' :
        'Order your moves.')
        .append(_paint_msgs(civOrders[i]));
    var takeControls = $('#takeControls');
    takeControls.children().remove();


    civOrders.forEach(function (name) {
        if (civs[name].ai) {
            takeControls.append('<button onclick="delete civs.' + name + '.ai">Play ' + name + '</button>')
        }
    });
    ;

    if (civ._poptable) {
        const demoSelect = $('#demoSelect').html(civOrders.map(x => `
            <option value="${x}" ${x == civOrders[i] ? 'selected' : ''}>${x}</option>
        `).join(""))[0];
        demoSelect.onchange = function() {
            const selectedCiv = civs[demoSelect.value];
            poptable_gen_Tablesort(selectedCiv, $('#demoPopTable'));
        };

        demoSelect.onchange();
    }
};

let _populationData = [];
let _incomeData = [];
let _pwrData = [];
let _techData = [];
let enableGraph = true;

let hisChart = new HistoryChart('#hisGraph', 761, 25);

prepareTurn = function () {
    buyClick = null;
    i++;
    if (i >= civOrders.length) {
        i = 0;

        const yearsSinceLastScreenshot = Math.floor(turn / civOrders.length) / 4 - _gallery_prev_year;
        if (
            yearsSinceLastScreenshot >= GALLERY_MAX_YEARS ||
            (yearsSinceLastScreenshot >= GALLERY_MIN_YEARS && _gallery_change_cml >= GALLERY_TRIGGER_CHANGES)
        ) {
            if (lazyDrawCml) {
                count = 0;
                drawCanvas();
            }
            canvasScreenshot();
        }

        window.average = {
            happiness: averageData.happiness / civOrders.length,
            logistics: averageData.logistics / civOrders.length,
            technology: averageData.technology / civOrders.length,
            politic: averageData.politic / civOrders.length,
            money: averageData.money / civOrders.length,
            pop: averageData.population,
            income: averageData.income
        };

        poptable_gen_Tablesort(averageData, $('#worldPopTable'));

        // console.log(average);

        if (enableGraph) {
            const currentYear = Math.floor(turn / civOrders.length) / 4;
            const timeFormat = (date) => {
                return date.valueOf().toString();
            };

            let popObj = {date: currentYear, pop: 0};
            civOrders.forEach(x => {
                let last = 0;
                if (_populationData.length > 2) {
                    for (let i = 1;i <= 2; i++) {
                        last += _populationData[_populationData.length - i][x + '.h'];
                    }
                    popObj[x] = (last + civs[x].pop / 1000000) / 3;
                } else {
                    popObj[x] = civs[x].pop / 1000000;
                }
                popObj[x + '.h'] = civs[x].pop / 1000000;
                popObj.pop += popObj[x];
            });
            _populationData.push(popObj);

            $('#popGraph').html('');
            var pChart = d3_timeseries()
                .width(800)
                .height(600)
                .addSerie(_populationData, { x: 'date', y: 'pop' }, { interpolate: 'linear', color: 'grey', width: 2 });
            pChart.xscale.tickFormat(timeFormat);
            civOrders.forEach(x => {
                pChart = pChart.addSerie(_populationData,{x:'date',y: x},{interpolate:'linear', color: civs[x].color, width: 1});
            });
            pChart('#popGraph');

            let bbox = document.querySelector('#popGraph > svg > g').getBoundingClientRect();

            hisChart.width = bbox.width;
            document.querySelector('#hisGraph').style.marginLeft = bbox.x;
            document.querySelector('#hisGraph').style.width = bbox.width;
            hisChart.draw(_dynastyData, turn, _populationData[0].date * civOrders.length * 4);

            let incObj = { date: currentYear, inc: 0};
            civOrders.forEach(x => {
                let last = 0;
                if (_incomeData.length > 4) {
                    for (let i = 1; i <= 4; i++) {
                        last += _incomeData[_incomeData.length - i][x + '.h'];
                    }
                    incObj[x] = (last + civs[x].income / 1000) / 5;
                } else {
                    incObj[x] = civs[x].income / 1000;
                }
                incObj[x + '.h'] = civs[x].income / 1000;
                incObj.inc += incObj[x];
            });
            _incomeData.push(incObj);

            $('#incGraph').html('');
            var iChart = d3_timeseries()
                .width(800)
                .height(600)
                .addSerie(_incomeData, { x: 'date', y: 'inc' }, { interpolate: 'linear', color: 'grey', width: 2 });
            iChart.xscale.tickFormat(timeFormat);
            civOrders.forEach(x => {
                iChart = iChart.addSerie(_incomeData,{x:'date',y: x},{interpolate:'linear', color: civs[x].color, width: 1});
            });
            iChart('#incGraph');

            let pwrObj = { date: currentYear, pwr: 0};
            civOrders.forEach(x => {
                let last = 0;
                if (_pwrData.length > 2) {
                    for (let i = 1; i <= 2; i++) {
                        last += _pwrData[_pwrData.length - i][x + '.h'];
                    }
                    pwrObj[x] = (last + civs[x].power) / 3;
                } else {
                    pwrObj[x] = civs[x].power;
                }
                pwrObj[x + '.h'] = civs[x].power;
                pwrObj.pwr += pwrObj[x];
            });
            _pwrData.push(pwrObj);

            $('#pwrGraph').html('');
            var wChart = d3_timeseries()
                .width(800)
                .height(600);
            wChart.xscale.tickFormat(timeFormat);
            civOrders.forEach(x => {
                wChart = wChart.addSerie(_pwrData,{x:'date',y: x},{interpolate:'linear', color: civs[x].color, width: 1});
            });
            wChart('#pwrGraph');

            let techObj = { date: currentYear, globalPeak: 0};
            let newHighestTech = 0;
            let lastTechPeak = 0;
            civOrders.forEach(x => {
                if (_techData.length > 4 && civs[x].techinc > 0 && civs[x].technology > 0 && civs[x].techinc < 30) {
                    lastTechPeak = Math.max(lastTechPeak, civs[x].technology - civs[x].techinc);
                    newHighestTech = Math.max(newHighestTech, civs[x].technology);
                }

                techObj[x] = Math.min(Math.max((civs[x].techincRA * 0.75 + civs[x].techinc * 0.25) || civs[x].techinc || 0, 0), 99);
            });
            if (lastTechPeak && newHighestTech)
                techObj.globalPeak = Math.max(Math.min(newHighestTech - lastTechPeak, 99), -9);
            _techData.push(techObj);

            $('#techGraph').html('');
            var wChart = d3_timeseries()
                .width(800)
                .height(600);
            wChart.xscale.tickFormat(timeFormat);
            civOrders.forEach(x => {
                wChart = wChart.addSerie(_techData,{x:'date',y: x},{interpolate:'linear', color: civs[x].color, width: 1});
            });
            wChart = wChart.addSerie(_techData, { x: 'date', y: 'globalPeak' }, { interpolate: 'linear', color: 'grey', width: 2 });
            wChart('#techGraph');
        }


        averageData = {income: 0,happiness: 0, logistics: 0, technology: 0, politic: 0, money: 0, population: 0};
        poptable_hook(averageData);
    }
    let civ = civs[civOrders[i]];
    civ.newMoney = civ.money;
    if (civs[civOrders[i]].ai || (civs[civOrders[i]].ii <= 1 && civs[civOrders[i]].technology > 0)) {
        let start = new Date();
        AI.think(civs[civOrders[i]], civOrders[i]);
        AI.think(civs[civOrders[i]], civOrders[i]);
        $('#aiTime').text((new Date() - start) + 'ms');
        $('#panel').hide();
        setTimeout(endTurn, TIMEOUT_DELAY || 150);
    } else {
        showInfo();
    }
    refreshTable();
    if (lazyDrawCml)
        count = 1; // prevents draw on lazydraw
    drawCanvas();

    document.getElementById('year').innerText =
        'Population: ' + (window.average && window.average.pop || 0) +
        `, GDP: ${Math.floor(window.average?.income)}M (${Math.floor(1000 * 1e6 * window.average?.income / window.average?.pop) / 1000} per capita)` +
        ', Year: ' + (Math.floor(turn / civOrders.length) / 4) +
        ', Dynasty: ' + dynasty_get_mandate();

    if ($('#heatmap').css('display') != 'none') loadheatmap();
};

inspectWarRecs = function () {
    $('#warchance-panel').show();

    let civ = civs[civOrders[i]];
    let civName = civOrders[i];

    AI.calculateWarChances(civ, civName);

    if (!window.tableSetup3) {
        window.tableSetup3 = new Tablesort($('#warchanceTable')[0]);
    }

    var $table = $('#warchanceTable tbody');
    $table.html('');
    Object.keys(civ.neighbors)
        .sort((a, b) => civ.neighbors[b] - civ.neighbors[a])
        .forEach(function (civName) {
            let civ2 = civs[civName];
            let tr = $('<tr/>');
            tr.css('background', civ2.color).css('color', civ2.fontColor);
            tr.append(`<td>${civName}</td>`);
            tr.append(`<td>${civ.neighbors[civName]}</td>`);
            tr.append(`<td>${(civ._warChances[civName] * 100).toFixed(2)}</td>`);
            $table.append(tr)
        });
    window.tableSetup3.refresh();
};

manageMigrants = function () {
    $('#migrants-panel').show();
    if (!window.tableSetup2) {
        window.tableSetup2 = new Tablesort($('#migrantsTable')[0]);
        setTimeout(function () {
            $('#heatmap').css('display', 'none');
        }, 1000);
    }

    let civ = civs[civOrders[i]];

    $('#outGateBtn').text(civ.outGate ? 'Allowing emigration' : 'Disallowing emigration');

    $('#migrants-panel .t1').text(Math.round((1 - civ._migrantInfo.alleviatedFromOut.happiness) * 10000) / 100 + '%');
    $('#migrants-panel .t2').text(Math.round((civ._migrantInfo.unrestFromIn.happiness - 1) * 10000) / 100 + '%');
    $('#migrants-panel .t3').text(Math.round((civ._migrantInfo.unrestFromIn.rchance - 1) * 10000) / 100 + '%');

    var $table = $('#migrantsTable tbody');
    $table.html('');
    Object.keys(civ.neighbors)
        .sort((a, b) => civ.neighbors[b] - civ.neighbors[a])
        .forEach(function (civName) {
            let civ2 = civs[civName];
            let allowIn = !civ?.inGatesDisallowed[civName];
            let allowIn2 = !civ2?.inGatesDisallowed[civOrders[i]];
            let tr = $('<tr/>');
            if (civ._migrantInfo.to[civName] || civ._migrantInfo.from[civName])
                tr.css('background', civ2.color).css('color', civ2.fontColor);
            tr.append(`<td>${civName}</td>`);
            tr.append(`<td>${civ.neighbors[civName]}</td>`);
            tr.append(`<td>${(civ._migrantInfo.to[civName] || [0])[0]}</td>`);
            tr.append(`<td>${civ._migrantInfo.from[civName] || 0}</td>`);
            tr.append(`<td>${(civ._migrantInfo.from[civName] || 0) - ((civ._migrantInfo.to[civName] || [0])[0] || 0)}</td>`);
            tr.append(`<td>${Math.round(civ2.happiness)}</td>`);
            tr.append(`<td>${Math.round((civ._migrantInfo.to[civName] || [0,0])[1] * 100)}</td>`);
            tr.append(`<td>${Math.round(civ2.rchance * 100000) / 1000}</td>`);
            tr.append(`<td>${civ2.outGate ? '' : 'Disallowing emigration;'}${allowIn2 ? '' : ' Disallowing immigrants from us'}</td>`);
            tr.append(`<td><button>${allowIn ? 'Allowing entrance' : 'Disallowing entrance'}</button></td>`);
            tr.find('button').click(() => {
                civ.inGatesDisallowed = civ.inGatesDisallowed || {};
                civ.inGatesDisallowed[civName] = !civ.inGatesDisallowed[civName];
                manageMigrants();
            });
            $table.append(tr)
        });
    window.tableSetup2.refresh();
};

refreshTable = function () {
    if (!window.tableSetup) {
        window.tableSetup = new Tablesort($('#statsTable')[0]);
        setTimeout(function () {
            $('#heatmap').css('display', 'none');
        }, 1000);
    }
    var $table = $('#statsTable tbody');
    $table.html('');
    civOrders.forEach(function (civName) {
        let civ = civs[civName];
        let tr = $('<tr/>');
        if ((!civ.ai) || civ.ii >= 5)
            tr.css('background', civ.color).css('color', civ.fontColor);
        tr.click(function () {
            civ.highlight = !civ.highlight;
            refreshTable();
        });
        let power = Math.min(Math.max(0, Math.sqrt(Math.sqrt(Math.sqrt((civ.deposit + civ.money) / 2)) +
            Math.min(2, civ.popchangepercRA / 5) + (civ.pmb - 1) * 2 + (civ.emb - 1) * 2 + Math.min(2, civ.incomeRAdiffsRA / 2) +
            civ.income / 10 + civ.politic / 3 + ((civ.ii / 1000 + 0.2) * civ.ii * civ.urban / 100) - 3 +
            civ.technology / 10 + Math.min(130, civ.happiness) / 10 + Math.min(100000000 / 50000, civ.pop / 50000)) +
            - Math.min(0.05, civ.rchance) * 100), 100) || NaN;

        if (civ._oldpower1)
          power = power * 0.3 + civ._oldpower1 * 0.7;
        if (civ._oldpower2)
          power = power * 0.7 + civ._oldpower2 * 0.3;

        civ.power = power;

        civ._oldpower2 = civ._oldpower1;
        civ._oldpower1 = civ.power;
        if (civ.mandate)
            tr.css("font-weight", "bold");
        if (civ.mandateInAcquirement)
            tr.css("font-style", "italic");
        tr.append(`<td>${civName}</td>`);
        const culture = popv2_culture_get_culture_obj(civName);

        if ((!civ.ai) || civ.ii >= 5)
            tr.append(`<td style="background: ${culture.color}; color: ${culture.fontColor};">${civ.culture}</td>`);
        else
            tr.append(`<td>${civ.culture}</td>`);

        tr.append(`<td>${Math.round(civ.ii)}</td>`);
        tr.append(`<td class="extra">${civ._avgpm || ''}</td>`);
        tr.append(`<td class="extra">${civ._avgem || ''}</td>`);
        tr.append(`<td class="extra">${civ.pmb || ''}</td>`);
        tr.append(`<td class="extra">${civ.emb || ''}</td>`);
        tr.append(`<td class="extra">${civ.teb || ''}</td>`);
        tr.append(`<td>${Math.round(civ.urban * 100) / 100 || ''}</td>`)
        tr.append(`<td>${Math.round(civ.pop / civ.ii) || ''}</td>`)
        tr.append(`<td class="extra">${Math.round(civ.imodDueToReserve * 100) || ''}</td>`)
        tr.append(`<td class="extra">${Math.round(civ.income / civ.pop * 1e6) || ''}</td>`)
        tr.append(`<td class="extra">${civ.incomeRAdiffsRA || ''}</td>`)
        tr.append(`<td>${Math.round(civ.deposit) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.technology * 100) / 100 || ''}</td>`)
        tr.append(`<td>${(civ.years) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.happiness) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.pop) || ''}</td>`)
        tr.append(`<td class="extra">${civ.popchangepercRA || ''}</td>`)
        tr.append(`<td>${Math.round(civ.military) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.newMoney - civ.oldMoney) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.income) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.politic) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.money) || ''}</td>`);
        tr.append(`<td>${Math.round(civ.rchance * 100000) / 1000 || ''}</td>`);
        tr.append(`<td class="extra">${Math.round((civ.migrantsIn || civ._migrantsInLast || 0) - (civ.migrantsOutSuccessful || civ._migrantsOutSuccessfulLast || 0)) || ''}</td>`);
        tr.append(`<td class="extra">${Math.round(civ.gov?.cohesion * 100) || ''}</td>`);
        tr.append(`<td>${Math.round(civ.power * 100) / 100 || ''}</td>`);
        $table.append(tr)
    });
    window.tableSetup.refresh();
}
