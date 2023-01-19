readMap();
TIMEOUT_DELAY = 150;
ready = function () {
    drawCanvas();

    $('canvas').bind('mousewheel', function (e) {
        e.preventDefault();
        if (e.originalEvent.wheelDelta / 120 > 0) {
            BLOCK_SIZE++;
        } else {
            BLOCK_SIZE--;
        }
        drawCanvas()
    }).click(function (e) {
        onClick(Math.floor(e.pageY / BLOCK_SIZE), Math.floor(e.pageX / BLOCK_SIZE));
    });

    prepareTurn();
    refreshTable();
};

var i = -1;
var civOrders = Object.keys(civs).sort();

var buyClick = null;

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
                    getNeighbors(row, col, function (l, r, c) {
                        if (!l.color) {
                            data[r][c] = {
                                color: civName,
                                type: type
                            };
                        }
                    })
                }
                data[row][col] = {
                    color: civName,
                    type: type
                };
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

    if (civ.money < m || civ.politic < p) {
        alert("Failed. " + m + " money needed, " + p + " PP needed.")
    } else {
        civ.money -= m;
        civ.politic -= p;
        civ.technology++;
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

move = function (cn1, pickedUp, p2, ai) {
    var row2 = p2[0];
    var col2 = p2[1];

    var l2 = data[row2][col2];
    var ddffeend = l2.type.draw.toString();

    var cn2 = l2.color;
    var c1 = civs[cn1];
    var c2 = civs[cn2];

    var type = $.extend(true, {}, types.military);
    type.val = pickedUp.type.val;

    var result = [type.val, 0];

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
        result = battle(pickedUp.type.val, l2.type.defend, c1.technology, c2.technology);
    } else {
        var m1 = pickedUp.type.val;
        var m2 = l2.type.val / 2;
        var t1 = c1.technology;
        var t2 = c2.technology;

        if (l2._oldcolor == cn1) // if taking own territory back
            t1 = t1 * 1.50;
        else
            t1 = t1 * 0.75;

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

        if (c2) {
            if (result[0]) {
              c2.money -= result[0] / 25;
              c2.logistics = c2.logistics ? c2.logistics + result[0] / 25 : result[0] / 25;

              let rate = Math.min(0.99, Math.max(0.8, 1 - result[0] * 500 * (1 + (c1.ii || 0) / 1000) / c1.pop)) || 0.97;
              let rate2 = Math.min(0.99, Math.max(0.8, 1 - data[row2][col2].pop / c2.pop)) || 0.97;
              c2.happiness *= rate2;
              c2._hapDec *= rate2;
              c1.happiness *= rate;
              c1._hapDec *= rate;
            }
            if (((c2.money < -50 || c2.politic < 0) && Math.random() < Math.min(1, 1 - c2.happiness / 100) * 0.3
                && c2.ii < 150 && c2.military < 50 && c2.deposit + c2.money < (c2.ii * c2.urban / 10) * 0.6) ||
                (ddffeend == types.capital.draw.toString() && Math.random() < 0.1)) {
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
    civ.deposit = Math.min((civ.ii * civ.urban / 10), (civ.deposit ? civ.deposit : 1) * 1.10);
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

    let oldMoney = civ.money;

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

    civ.pm = 0;
    civ.em = 0;
    civ.pmb = 0;
    civ.emb = 0;
    let pmbi = 0;
    let embi = 0;

    let maginitude = Math.random() < 0.02 ? 0.2 * Math.random() : (Math.random() < 0.001 ? 0.4 : 0);
    if (maginitude && civ.ii > 2)
        push_msg(`Natural disasters in ${civName} is causing famines killing ${maginitude * 100 | 0}% of population.`, [civName, ...Object.keys(civ.neighbors)]);

    let neighbors = {};
    let totalNeighbors = 0;
    let nextDecline = oldpop * maginitude;
    nextDecline += civ.nextDecline || 0;

    max_pop = 0;
    max_econ = 0;

    iterateMathRandom((row, col) => {
        let d = data[row][col];
        if (d?.pop)
          max_pop = Math.max(max_pop, d.pop);
        if (d?._econ)
          max_econ = Math.max(max_econ, d._econ);

        if (!d || !d.color || !d.type) return;
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
                if (d2?.type && d2?.color != civName) {
                    // d._adj = r == row - 1 && c == col ? 1 :// top
                    //          r == row + 1 && c == col ? 2 : // bottom
                    //          r == row && c == col - 1 ? 3 : 4; // left, right
                    neighbors[d2.color] = (neighbors[d2.color] || 0) + 1;
                    totalNeighbors++;
                }
            });
            d.pop = Math.min(d.pop, 1500000) || 0;
            /*if ((!d.pop || d.pop < 1000) && d.type.defend && !d.type.val) {
                d.pop = d.type.defend * 5000 * Math.random();
            }*/
            d.growth = 0.5;
            if (d && (d.type.draw.toString() == types.city.draw.toString() ||
                        d.type.draw.toString() == types.town.draw.toString() ||
                        d.type.draw.toString() == types.school.draw.toString() ||
                        d.type.draw.toString() == types.headquarter.draw.toString())) {
                d.growth = d.pop < 20000 ? 1.004 : 1.00025;
                nextDecline -= (d.pop < 20000 ? 0.004 : 0.00025) * d.pop * 0.10;
                cityCount++;
            } else if (d && d.type.draw.toString() == types.finance.draw.toString()) {
                d.growth = d.pop < 20000 ? 1.006 : 1.0005;
                nextDecline -= (d.pop < 20000 ? 0.006 : 0.0005) * d.pop * 0.05;
                cityCount+=2;
            } else if (d && d.type.draw.toString() == types.capital.draw.toString()) {
                d.growth = d.pop < 20000 ? 1.012 : 1.001;
                nextDecline -= (d.pop < 20000 ? 0.012 : 0.0001) * d.pop * 0.01;
                cityCount+=2;
            } else if (d && d.type.val > 0) {
                // nextDecline += d.type.val * (civ.ii || 100);
            }

            if (d.growth > 1) {
                civ.pmb += res_pop_mod(row, col);
                pmbi++;
            }

            if ((!d.pop || d.pop < 1000) && d.growth > 1) {
                d.pop = d.type.defend * 5000 * Math.random() * res_pop_mod(row, col);
            }
            let urb = Math.max(1, civ.urban) || 10;
            let decline = d.growth > 1 ? (nextDecline < 0 ? nextDecline / urb * 10 * Math.random() : Math.min(nextDecline, d.pop / 1.5, nextDecline / urb * 10 * Math.random())) : 0;
            decline = Math.min(50000, decline);

            nextDecline -= decline;

            d._d = decline;
            // use carrying capacity equation
            let cap = 600000 * res_pop_mod(row, col);
            let delta = ((d.growth - 1) * d.pop * (1 - d.pop / cap));
            if (delta > 0) {
                delta *= res_pop_mod(row, col);
                delta *= 1.3 * (Math.random() * 2.25 - 0.2);
                delta += d.growth > 1 ? 1000 : 0;
            }
            if (delta > 0)
                nextDecline -= delta / 10;

            delta -= decline;

            let decline2 = decline;
            if (delta < -50) {
                let migrants = -(delta * Math.random() * 0.4 | 0);
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
                            civ2.happiness *= (1 - (_m / (pop)) / 2) || 1;
                            civ2.rchance *= (1 + (_m / pop * 5)) || 1;
                            civ2.rchance = Math.min(civ2.rchance, 0.35);
                            civ2.nextDecline -= _m;

                            if (civ2._migrantInfo) {
                                civ2._migrantInfo.unrestFromIn.happiness *= (1 - (_m / (pop)) / 2) || 1;
                                civ2._migrantInfo.unrestFromIn.rchance *= (1 + (_m / pop * 5)) || 1;
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

            d.pop = Math.max(d.growth > 1 ? 1001 : 0, Math.round(delta + d.pop + 1)) || 0;
            // if (d.pop > 1000000) {
            //   let diff = d.pop - 1000000;
            //   d.pop -= diff;
            //   nextDecline -= diff;
            // }
            civ.pop += d.pop;
            max_pop = Math.max(max_pop, d.pop);

            let _oldmoney = civ.money + 0;
            let _oldtech = civ.technology + 0;
            let _oldhap = civ.happiness + 0;

            d.type.income(civ);

            let change = civ.money - _oldmoney;
            if (change > 0) {
                if (d.growth >= 1) {
                    let nchange = change * d.pop / 200000 * Math.sqrt(res_econ_mod(row, col));
                    d._econ = nchange;
                    civ.money -= change - nchange;
                    income += nchange;
                    civ.emb += res_econ_mod(row, col);
                    embi++;
                } else {
                    income += change;
                    d._econ = change;
                }
                max_econ = Math.max(max_econ, d._econ);
            } else expense -= change;

            change = civ.technology - _oldtech;
            if (change > 0) {
                let nchange = change * d.pop / 150000;
                civ.technology -= change - nchange;
            };

            change = civ.happiness - _oldhap;
            if (change > 0) {
                let nchange = change * d.pop / 150000;
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
    // for (var row = 0; row < data.length; row++) {
    //     var rowData = data[row];
    //     for (var col = 0; col < rowData.length; col++) {

    //     }
    // }
    civ.ii = ii;
    civ.occupiedII = occupiedII;
    civ.nextDecline = nextDecline || 0;
    civ.popchange = Math.round((civ.pop = Math.round(civ.pop)) - oldpop);
    civ.popchangeperc = Math.round(civ.popchange / oldpop * 10000) / 100;
    civ.technology = Math.round(civ.technology * 1000) / 1000;
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
    civ.expense = Math.round((expense + ((((civ.ii / 900 + 0.2) * civ.ii)))) * 100) / 100;
    civ.expense = Math.round((expense + ((((civ.occupiedII / 400 + 0.3) * civ.occupiedII)))) * 100) / 100;
    civ.oldMoney = Math.round(oldMoney * 100) / 100;
    civ.urban = Math.round(cityCount / ii * 10000) / 100;
    civ.cityCount = cityCount;
    civ.money = Math.round((civ.money - ((((civ.ii / 900 + 0.2) * civ.ii)) - ((civ.occupiedII / 400 + 0.3) * civ.occupiedII))
      + (civ.deposit < 0 ? civ.deposit / 10 : 0)) * 100) / 100;
    civ.spentOnUrban = 0;
    if (civ.ii > 50 && civ.urban > 55)
        civ.money -= (civ.spentOnUrban = (civ.urban - 55) * 10)
    civ.newMoney = civ.money;
    if (isNaN(civ.money)) civ.money = 0;
    civ.politic = Math.max(Math.min(Math.round((civ.politic * (civ.happiness / 100) + 5) * 100) / 100 + civ.money / 250, Math.max(civ.ii / 10, 30)), -50);
    // averageData = {happiness: 0, logistics: 0, technology: 0, ii: 0, politic: 0}
    averageData.population += civ.pop;
    averageData.happiness += civ.happiness;
    averageData.logistics += civ.logistics;
    averageData.technology += civ.technology;
    averageData.politic += civ.politic;
    averageData.money += civ.money;
    averageData.income += civ.income;
    civ.logistics = 0;

    if (civ.ii >= 2) {
        let rchance = (20 / Math.max(1, civ.happiness) - 0.1);
        rchance *= (1 + rchance);
        rchance *= 0.0001 * (1 + civ.ii / data.length / data[0].length * 10) * (1 + civ.years / 100);
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
        civ.rchance = rchance > civ.rchance ? rchance : (civ.rchance || 0) * 0.3 + rchance * 0.7;
    } else {
        civ.rchance = 0;
        civ.years = 0;
        civ.technology = 0;
    }

    civ.rchance *= 1 + civ.rchance;
    civ.rchance = Math.min(0.35, civ.rchance);

    // rebel pops: for own civ
    if (Math.random() < civ.rchance) {
        console.log("== triggering rebellion in", civName, "with chance=", civ.rchance);
        push_msg(`Rebellions in ${civName} are attempting an uprising.`, [civName, ...Object.keys(civ.neighbors)]);
        if (popRebel(null, civName))
            civ.rchance *= 0.35;
    }

    // rebel pops: for perished civs
    if (ii <= 2 && turn >= 10 * 4 * civOrders.length && (Math.random() < 0.001
    // || (1 + turn) % (88 * 4 * civOrders.length) <= 14
    ) && civ.technology >= 0) {
       // auto pick target
        console.log("## triggering rebellion for", civName);
        if (Math.random() < 0.7 && civ.birth) {
            let targetCiv = data[civ.birth[0]][civ.birth[1]].color;
            push_msg(`Descendants of ${civName} are attempting an uprising in ${targetCiv}.`, [civName, targetCiv]);
            popRebel(civName, targetCiv, civ.birth);
        } else {
            delete civ.birth;
            popRebel(civName);
        }
    }


    document.getElementById('tickTime').innerText = 'Tick: ' + (new Date().getTime() - _startTime).toFixed("0") + 'ms';
    prepareTurn();


    delete window.pickedUp;
};

// if civ doesnt have birth, will assign birth
popRebel = function (civName, target, source) {
    if (!civName) {
        if (!(civName = civOrders.filter(x => civs[x].ii <= 2 && civs[x].technology >= 0)[0]))
            return false;
    }
    let civ = civs[civName];
    if (!target) {
        let choices = civOrders.filter(x => civs[x].ii >= 2).sort((a, b) => civs[b].ii - civs[a].ii);
        let i = 0;
        while (!target) {
            let chance = (20 / Math.max(1, civs[choices[i]].happiness) - 0.1);
            console.log('Rebel ->', choices[i], chance);
            if (Math.random() < chance)
                target = choices[i];
            if (++i >= choices.length)
                i = 0;
        }
    }
    if (!source) {
        // find target city
        let choices = [];
        for (let r = 0;r < data.length;r++) {
            for (let c = 0;c < data[r].length;c++) {
                let d = data[r][c];
                if (d?.color == target && d?.growth >= 1)
                    choices.push([r, c, d._d + d.pop]);
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

    civs[target].happiness *= 0.6;
    civs[target].politic *= 0.4;

    civ.war = civ.war || {};
    civs[target].war = civs[target].war || {};
    delete civs[target].war[civName];
    delete civ.war[target];

    civ.money = 100 + civ.ii * 5;
    civ.politic = 50;
    civ.happiness = 100;
    civ.rchance = 0;
    civ.years = 0;
    if (civs[target].deposit > 0) {
        civ.deposit = civs[target].deposit * civ.ii / oldii;
        civs[target].deposit -= civ.deposit;
        civ.money += civs[target].money * civ.ii / oldii;
        civs[target].money -= civ.money;
    } else {
        civ.deposit = 1000;
    }


    var sum = 0;

    if (Math.random() < 0.8)
      declareWar(target, civName, true, `as a result of the ${civName} rebellion.`, 9)

    civOrders.forEach(function (civN) {
        sum = Math.max(civs[civN].technology, sum);
    });

    civ.technology = Math.max(1, sum * (Math.random() * 0.4 + 0.5));

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
    $('#turn').html('<h2></h2>');
    $('#turn').show()
        .find('h2')
        .text("Player " + civOrders[i] + "'s turn")
        .css('background', civ.color)
        .css('color', civ.fontColor)
        .parent()
        .append(
            $('<pre></pre>')
                .html(
                    "Money: " + civ.money + "\n" +
                    "Deposit: " + Math.floor(civ.deposit * 100) / 100 + `/${Math.floor(civ.ii * civ.urban / 10)}(+10% interest)\n` +
                    "Technology: " + civ.technology + (civ._techFromAllies ? ` (${civ._techFromAllies} from allies)\n` : "\n") +
                    "Political Powers: " + civ.politic + (civ._polFromAllies ? ` (${Math.round(civ._polFromAllies * 100) / 100} from allies) \n` : '\n') +
                    "Population: " + civ.pop + ` (+${civ.popchange} +${civ.popchangeperc}%)\n` +
                    "Military(Until last turn): " + civ.military + "\n" +
                    `Happiness: ${Math.round(civ.happiness * 100) / 100} % (Rebellion chance: ${Math.round(civ.rchance * 100000) / 1000}%; x${Math.round((civ._hapDec) * 100) / 100} from unnatural deaths)\n` +
                    "Urbanization: " + civ.urban + "% (" + civ.cityCount + ")\n" +
                    `Migrants: ${civ.migrantsOutTotal} total displaced, ${civ.migrantsOutSuccessful} migrated out, ${civ.migrantsIn} in; net=${civ.migrantsIn - civ.migrantsOutSuccessful} <button onclick="manageMigrants()">Manage</button>\n` +
                    "==Statistics==\n" +
                    "        " + (civ.oldMoney) + "\n" +
                    " + Tax  " + civ.income + "\n" +
                    (civ.spentOnUrban > 0 ? ` - Urban overflow $${Math.round(civ.spentOnUrban)}\n` : "") +
                    " - Expense " + Math.round((civ.expense - ((civ.ii / 900 + 0.2) * civ.ii)) * 100) / 100 + "  (Logistics " + civ.logistics + ")\n" +
                    " - Gov  " + Math.round(((civ.ii / 900 + 0.2) * civ.ii) * 100) / 100 + "  (Government Offices in " + civ.ii + " counties, " + civ.occupiedII + " are occupied)\n" +
                    " + Ints " + Math.round(civ.deposit / 1.1 / 10 * 100) / 100 + "  (10% interest from deposit)\n" +
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
};

let _populationData = [];
let _incomeData = [];
let _pwrData = [];
let enableGraph = true;
prepareTurn = function () {
    buyClick = null;
    i++;
    if (i >= civOrders.length) {
        i = 0;
        window.average = {
            happiness: averageData.happiness / civOrders.length,
            logistics: averageData.logistics / civOrders.length,
            technology: averageData.technology / civOrders.length,
            politic: averageData.politic / civOrders.length,
            money: averageData.money / civOrders.length,
            pop: averageData.population,
            income: averageData.income
        };
        console.log(average);

        if (enableGraph) {
            let popObj = {date: new Date(-62167198164000 + 3.154e+10 * Math.floor(turn / civOrders.length) / 4), pop: 0};
            civOrders.forEach(x => {
                let last = 0;
                if (_populationData.length > 4)
                    for (let i = _populationData.length - 1;i >= 0 && i >= _populationData.length - 4;i--) {
                        last += _populationData[i][x]?.pop;
                    }
                last = last || (civs[x].pop * 3);
                popObj[x] = (civs[x].pop + last) / 4 / 1000000;
                popObj.pop += popObj[x];
            });
            _populationData.push(popObj);

            $('#popGraph').html('');
            var pChart = d3_timeseries()
                .width(800)
                .height(600);
            pChart = pChart.addSerie(_populationData,{x:'date',y:'pop'},{interpolate:'monotone', color: 'grey'});
            civOrders.forEach(x => {
                pChart = pChart.addSerie(_populationData,{x:'date',y: x},{interpolate:'monotone', color: civs[x].color, width: 1});
            });
            pChart('#popGraph');

            let incObj = {date: new Date(-62167198164000 + 3.154e+10 * Math.floor(turn / civOrders.length) / 4), inc: 0};
            civOrders.forEach(x => {
                let last = 0;
                if (_incomeData.length > 10)
                    for (let i = _incomeData.length - 1;i >= 0 && i >= _incomeData.length - 1 - 10;i--) {
                        last += _incomeData[i][x]?.income;
                    }
                last = last || (civs[x].income * 10);
                incObj[x] = (civs[x].income + last) / (10 + 1) / 1000;
                incObj.inc += incObj[x];
            });
            _incomeData.push(incObj);

            $('#incGraph').html('');
            var iChart = d3_timeseries()
                .width(800)
                .height(600);
            iChart = iChart.addSerie(_incomeData,{x:'date',y:'inc'},{interpolate:'monotone', color: 'grey'});
            civOrders.forEach(x => {
                iChart = iChart.addSerie(_incomeData,{x:'date',y: x},{interpolate:'monotone', color: civs[x].color, width: 1});
            });
            iChart('#incGraph');

            let pwrObj = {date: new Date(-62167198164000 + 3.154e+10 * Math.floor(turn / civOrders.length) / 4), pwr: 0};
            civOrders.forEach(x => {
                let last = 0;
                if (_pwrData.length > 10)
                    for (let i = _pwrData.length - 1;i >= 0 && i >= _pwrData.length - 1 - 10;i--) {
                        last += _pwrData[i][x]?.power;
                    }
                last = last || (civs[x].power * 10);
                pwrObj[x] = (civs[x].power + last) / (10 + 1);
                pwrObj.pwr += pwrObj[x];
            });
            _pwrData.push(pwrObj);

            $('#pwrGraph').html('');
            var wChart = d3_timeseries()
                .width(800)
                .height(600);
            civOrders.forEach(x => {
                wChart = wChart.addSerie(_pwrData,{x:'date',y: x},{interpolate:'monotone', color: civs[x].color, width: 1});
            });
            wChart('#pwrGraph');
        }


        averageData = {income: 0,happiness: 0, logistics: 0, technology: 0, politic: 0, money: 0, population: 0}
    }
    let civ = civs[civOrders[i]];
    civ.newMoney = civ.money;
    if (civs[civOrders[i]].ai || (civs[civOrders[i]].ii <= 1 && civs[civOrders[i]].technology > 0)) {
        let start = new Date();
        AI.think(civs[civOrders[i]], civOrders[i]);
        AI.think(civs[civOrders[i]], civOrders[i]);
        $('#aiTime').text((new Date() - start) + 'ms');
        $('#panel').hide();
        refreshTable();
        drawCanvas();
        setTimeout(endTurn, TIMEOUT_DELAY || 150);
    } else {
        showInfo();
        refreshTable();
        drawCanvas();
    }

    document.getElementById('year').innerText = 'Population: ' + (window.average && window.average.pop || 0) + `, GDP: ${Math.floor(window.average?.income)}M (${Math.floor(1000 * 1e6 * window.average?.income / window.average?.pop) / 1000} per capita)`  + ', Year: ' + (Math.floor(turn / civOrders.length) / 4);

    if ($('#heatmap').css('display') != 'none') loadheatmap();
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
        tr.append(`<td>${civName}</td>`)
        tr.append(`<td>${Math.round(civ.ii)}</td>`)
        tr.append(`<td class="extra">${civ._avgpm || ''}</td>`);
        tr.append(`<td class="extra">${civ._avgem || ''}</td>`);
        tr.append(`<td class="extra">${civ.pmb || ''}</td>`);
        tr.append(`<td class="extra">${civ.emb || ''}</td>`);
        tr.append(`<td>${Math.round(civ.urban * 100) / 100 || ''}</td>`)
        tr.append(`<td>${Math.round(civ.pop / civ.ii) || ''}</td>`)
        tr.append(`<td class="extra">${Math.round(civ.income / civ.pop * 1e6) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.deposit) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.technology * 100) / 100 || ''}</td>`)
        tr.append(`<td>${(civ.years) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.happiness) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.pop) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.military) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.newMoney - civ.oldMoney) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.income) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.politic) || ''}</td>`)
        tr.append(`<td>${Math.round(civ.money) || ''}</td>`);
        tr.append(`<td>${Math.round(civ.rchance * 100000) / 1000 || ''}</td>`);
        tr.append(`<td>${Math.round((civ.migrantsIn || civ._migrantsInLast || 0) - (civ.migrantsOutSuccessful || civ._migrantsOutSuccessfulLast || 0)) || ''}</td>`);
        tr.append(`<td>${Math.round(civ.power * 100) / 100 || ''}</td>`);
        $table.append(tr)
    });
    window.tableSetup.refresh();
}
