AGGRESSIVENESS = 0.4;

var AI = {
    think: function(civ, civName) {
        if (civ.ii < 2) return;

        civ.war = civ.war || {};
        if ((Math.random() < 0.1 || (civ.urban > 50 && Math.random() < 0.7)) && !Object.values(civ.war).filter(x => x > 0).length)
            this.tryResearch(civ);

        if (civ.pop > _dynastyPopReq * 0.7 && !civ.mandate && Math.random() < 0.1)
            civ.mandateInAcquirement = 30 * 4; // 30 years

        if (civ.mandateInAcquirement)
            civ.mandateInAcquirement--;

        if (!civ.mandateInAcquirement || civ.mandate || civ.pop < _dynastyPopReq * 0.6)
            delete civ.mandateInAcquirement;

        if (civ.gov && Math.random() < 0.3) {
            // demote all, refresh court
            Object.keys(civ.gov.advisors)
                .forEach(x => gov_demote_to_bureaucrat(civ.gov, x));
            gov_refresh(civ, civName);
        }

        while (civ.gov && Object.keys(civ.gov.advisors).length < GOV_ADVISORS_PER_CIV)
            this.handleGov(civ, civName);

        civ.outGate = true;

        if (civ.inGatesDisallowed && civ.neighbors) {
            for (let cn in civ.neighbors) {
                let c2 = civs[cn];
                if (
                    civ.rchance > 1.25 / 100 || civ.happiness < 40 ||
                    ((civ.mandate || civ.mandateInAcquirement) && Math.random() < 0.90)
                ) {
                    civ.inGatesDisallowed[cn] = true;
                } else if (civ.rchance > 0.75 / 100 || civ.happiness < 50) {
                    civ.inGatesDisallowed[cn] = (c2.nextDecline > civ.pop * 0.005) || (c2.pop > civ.pop * 0.1 && Math.random() > civ.happiness / 100 / 4);
                } else if (civ.rchance > 0.5 / 100 || civ.happiness < 60) {
                    civ.inGatesDisallowed[cn] = (c2.nextDecline > civ.pop * 0.05) || (c2.pop > civ.pop && Math.random() > civ.happiness / 100 / 2);
                } else if (civ.rchance > 0.1 / 100 || civ.happiness < 80) {
                    civ.inGatesDisallowed[cn] = (c2.nextDecline > civ.pop * 0.1) || (c2.pop > civ.pop * 2 && Math.random() > civ.happiness / 100);
                } else if (civ.rchance > 0.05 / 100) {
                    civ.inGatesDisallowed[cn] = Math.random() > civ.happiness / 80;
                } else {
                    delete civ.inGatesDisallowed[cn];
                }
                if (!civ.inGatesDisallowed[cn])
                    delete civ.inGatesDisallowed[cn];
            }
        }

        if (civ.money > 15) {
            civ.deposit = civ.deposit || 0;
            if (civ.deposit < 0) {
                civ.money += civ.deposit + 10;
                civ.deposit = 10;
            }
            /*
             1/27/23: no longer need, index.js automatically does this
            if (Math.round(civ.deposit) == Math.round(civ.ii * civ.urban / 10)) {
                civ.money += civ.deposit * 0.1;
                civ.deposit *= 0.9;
            }
            */
            if (civ.politic < 2) {
                this.tryBuild(civ, civName, civ.money / (Math.ceil(Math.random() * 3)), types.city, 85);
                if (civ.happiness > 70)
                  this.tryBuild(civ, civName, civ.money / (Math.ceil(Math.random() * 3)), types.finance, 105);
            }
            if (civ.ii < 125)
                this.tryBuildLand(civ, civName, civ.money / (Math.floor(Math.random() * 9 + 2)));
            if (civ.war && (civ.ii < 300 || Math.random() < 0.5))
                for (var k in civ.war) {
                    if (civ.war.hasOwnProperty(k) && civ.war[k] > 1) {
                        while (civ.deposit > 150) {
                            civ.money += civ.deposit / 2;
                            civ.deposit -= civ.deposit / 2;
                        }
                        this.tryDefend(civ, civName, civ.money / 1.5);
                        [...civOrders].sort(_ => Math.random() - 0.5).forEach((x) => {
                            if (isAtWar(civs[x], k) && !isAtWar(civ, x) && x != civName) {
                                if (!isPeace(civ, x)) {
                                    if (((civs[x].ii * 0.5 < civ.ii || civs[x].income > civ.income) && Math.random() < 0.9) ||
                                        Math.random() < 0.3 && !civ.mandateInAcquirement)
                                        promptForAlliance(civName, x) || promptForPact(civName, x);
                                    else if (!civ.mandateInAcquirement)
                                        promptForPact(civName, x);
                                }
                                if (civ.neighbors && civs[x].neighbors) {
                                    let totalNeighbors = (civ.neighbors[k] || 0) + (civs[x].neighbors[k] || 0);
                                    if (Math.random() > 0.3 && civ.money > 100)
                                        giveMoneyTo(civName, x, (civ.money - 100) / (1 + Math.random() * 2) * (civs[x].neighbors[k] || 0) / totalNeighbors, k)
                                }
                            }
                            if (isAlliance(civ, k) && isAlliance(civs[x], k) && !isAlliance(civ, x) && !isAtWar(civ, x)) {
                                if (((civs[x].income > civ.income * 0.7) && Math.random() < 0.3) ||
                                    Math.random() < 0.1 ||
                                    (civs[x].income > civ.income * 0.5 && civs[x].ii > civ.ii * 0.5 &&
                                     civs[k].income > civ.income * 0.8 && civs[k].ii > civ.ii * 0.8 && Math.random() < 0.7))
                                    promptForAlliance(civName, x) || promptForPact(civName, x);
                                else
                                    promptForPact(civName, x);
                            }
                        })
                        break;
                    }
                }
            if (!(civ.politic < 2 || civ.money < 50)) {
                this.tryDefend(civ, civName, civ.money / (Math.ceil(Math.random() * 2)));
                // this.tryBuild(civ, civName, civ.money / (Math.ceil(Math.random() * 7)), types.town, 35);
                this.tryBuild(civ, civName, civ.money / (Math.ceil(Math.random() * 5)), types.city, 85, 0.1, 1);
                this.tryBuild(civ, civName, civ.money / (Math.ceil(Math.random() * 20)), types.fort, 25, -1, -1);
                this.tryBuild(civ, civName, civ.money / (Math.ceil(Math.random() * 5)), types.city, 85, 0.1, 1);

                let adjInc = (Math.min(civ.incomesRA, civ.income) - civ.spentOnUrban - civ.govExp);

                if ((!civ.mandateInAcquirement || adjInc > Math.max(60, civ.ii * 2, civ.expense / 0.15)) &&  // max 15% of budget
                    civ.happiness > 60 && adjInc * 0.9 > Math.max(60, civ.ii * 2, civ.expense / 0.30) && // max 30% of budget
                    civ.politic > 15) // prevent politics eaten up by schools
                    this.tryBuild(civ, civName, civ.money / (Math.ceil(Math.random() * 2)), types.school, 105, -0.1, 2, Math.random() > 0.5);
                if (civ.happiness > 70 && (civ.urban < 65 || civ.ii < 70))
                    this.tryBuild(civ, civName, civ.money / (Math.ceil(Math.random() * 2)), types.finance, 105, 5, 1, true);
                if (civ.ii < 100)
                    this.tryBuildLand(civ, civName, civ.money / (Math.floor(Math.random() * 9)));
                this.tryBuild(civ, civName, civ.money / (Math.ceil(Math.random() * 100)), types.gate, 5, -1, -1);
                this.tryDefend(civ, civName, civ.money / (Math.ceil(Math.random() * 2)));
                if (civ.money > 0 && civ.deposit < civ.ii * civ.urban / 10) {
                    let maxdiff = Math.min(civ.ii * civ.urban / 10 - civ.deposit, civ.money / 2);
                    civ.deposit += maxdiff;
                    civ.money -= maxdiff;
                }
            }
        } else {
            // we're in bankrupt
            if (civ.money < 0 && civ.newMoney < civ.oldMoney && civ.gov?.cohesion < 0.15)
                this.tryFixBankrupt(civ, civName);

            while (civ.deposit > 150) {
                civ.money += civ.deposit / 10;
                civ.deposit -= civ.deposit / 10;
            }
            this.tryDefend(civ, civName, civ.money);
        }
    },
    tryFixBankrupt: function(civ, civName) {
        if (!civ._parts?.map) return;

        let deficit = (civ.oldMoney - civ.newMoney) * 2 + 50;

        if (deficit < 0) return;

        if (civ.money < -200)
            deficit *= Math.max(Math.abs(civ.money / deficit), 2);

        let toRemove = Object.keys(civ._parts.map).map(x => {
            const pos = _regions_parseKey(x);
            return [pos[0], pos[1], data[pos[0]][pos[1]]];
        }).filter(x => {
            return x[2]._exp > 1 && (Math.random() > 0.75 || x[2].growth > 1);
        }).sort((a, b) => (a[2].pop - b[2].pop) || (b[2]._exp - a[2]._exp));

        let totFixed = 0;
        let totDispPop = 0;
        let totRemoved = 0;
        for (let x of toRemove) {
            deficit -= x[2]._exp;
            totFixed += x[2]._exp;
            totDispPop += x[2].pop - 1;
            totRemoved++;
            x[2].type = types.land;
            if (deficit < 0)
                break;
            if (totDispPop / civ.pop > 0.01) // not too many population to keep rchance low
                break;
        }

        console.log("AI: Fix bankrupt for ", civName, "removed", totRemoved, "buildings worth expenses $", totFixed, "and pop=", totDispPop);
    },
    // one promotion at a time
    handleGov: function(civ, civName) {
        const gov = civ.gov;
        // const leader = gov.persons[gov.leader];

        const useMandateLogic = civ.mandate || civ.rchance > 0.05 || civ.happiness < 45;

        const modMap = useMandateLogic ? {
            'ORBRD': 8, // rebel chance
            'PIMHR': 2, // unhappiness from migration
            'PDSCR': 3, // disaster chance
        } : (
            civ.mandateInAcquirement ? {
                'MCCCT': 5, // combat strength
                'PIMHR': 10, // unhappiness from migration
                'OMVPC': 10, // movement political cost
                'ORBRD': 5, // rebel chance per round
            } : {
                'PIMHR': 2, // unhappiness from migration
                'OMVPC': 4, // movement political cost
                'ORBRD': 3, // rebel chance per round
            }
        );

        let candidate;
        let candidates = Object.values(gov.persons)
            .filter(x => x.pos == GOV_POSITIONS.BUREAUCRAT)
            .sort((a, b) =>
                (person_custom_mod_value(b, modMap) -
                person_custom_mod_value(a, modMap))
            );

        // // make sure successor of same family is in advisors
        // if (Math.random() < 0.7) {
        //     let advisors = Object.keys(gov.advisors).map(x => gov.persons[x]);
        //     if (!advisors.filter(x => x.family == leader.family).length) {
        //         candidate = candidates.filter(x => x.family == leader.family)[0];
        //     }
        // }

        candidate = candidate || candidates[0];
        if (!candidate)
            return;
        gov_promote_to_advisors(gov, candidate);
        gov_refresh(civ, civName);
    },
    tryResearch: function(civ) {
        var m = 300 + civ.money / 2 + civ.ii / 2 || 0;
        var p = 10 + civ.politic / 2;

        if (civ.money > m && civ.politic > p) {
            research();
        }
    },
    calculateWarChances: function(civ, civName) {
        civ._warChances = {};

        for (let cn in civ.neighbors) {
            var civ2 = civs[cn];
            var alliance = false;

            let warChance = 0;
            if (civ.income * 1.2 > civ2.income)
                warChance += Math.min(0.25, Math.max(0, civ.income / civ2.income / 10)) || 0;
            if (civ.technology * 1.2 > civ2.technology)
                warChance += Math.min(0.25, civ.technology / civ2.technology) || 0;
            if (civ.ii * 1.2 > civ2.ii)
                warChance += Math.min(0.25, Math.max(0, civ.ii / civ2.ii / 10)) || 0;
            if (civ.pop * 1.2 > civ2.pop)
                warChance += Math.min(0.25, Math.max(0, civ.pop / civ2.pop / 10)) || 0;

            let civAdjMoney = (civ.money || 0) + (civ.deposit || 0) + (civ.income || 0) * 4 + (civ.incomesRA || 0) * 4;
            let civ2AdjMoney = (civ2.money || 0) + (civ2.deposit || 0) + (civ2.income || 0) * 4 + (civ2.incomesRA || 0) * 4;

            let minAdjMoney = Math.min(civ2AdjMoney, civAdjMoney); // one way to handle negatives

            civAdjMoney -= minAdjMoney;
            civ2AdjMoney -= minAdjMoney;

            if (civAdjMoney * 1.2 > civ2AdjMoney)
                warChance += Math.min(0.75, Math.max(0, civAdjMoney / civ2AdjMoney / 10)) || 0;

            warChance *= (civ2.rchance || 0) + 1;

            // if (warChance > 0.25) {
            if (civ.em / civ.ii > civ2.em / civ2.ii)
                warChance *= 0.80;
            else
                warChance *= 1.2;
            if (civ.pm / civ.ii * 0.8 > civ2.pm / civ2.ii)
                warChance *= 0.35;
            if (civ.pm / civ.ii > civ2.pm / civ2.ii)
                warChance *= 0.35;
            else
                warChance *= 1.5;
            // }

            if (civ.mandate) {
                warChance *= 0.15;
                warChance = Math.min(warChance, 0.7);
            }

            if (civ.mandateInAcquirement) {
                warChance *= 50;
                warChance = Math.min(warChance, 2);
            }

            warChance *= Math.min(5, Math.max(0, (civ.deposit + civ.money) / (civ.ii * civ.urban / 10 * 2)));

            warChance *= civ.happiness / 100 - 0.2;
            warChance *= AGGRESSIVENESS;
            warChance *= 1 + (civ2.gov?.mods?.OFRHS || 0);

            civ._warChances[cn] = warChance;
        }
    },
    tryDefend: function(civ, civName, maxMoney) {
        if (civ.ii / (data.length * data[0].length) > 0.5 && Math.random() < 0.9) {
            return;
        }
        if (civ.ii / (data.length * data[0].length) > 0.07 && Math.random() < 0.5) {
            return;
        }

        civ._warChances = {};

        for (let cn in civ.neighbors) {
            var civ2 = civs[cn];
            var alliance = false;

            let warChance = 0;
            // if (civ.income * 1.2 > civ2.income)
            //     warChance += Math.min(0.25, Math.max(0, civ.income / civ2.income / 10)) || 0;
            if (civ.technology * 1.2 > civ2.technology)
                warChance += Math.min(0.25, civ.technology / civ2.technology) || 0;
            if (civ.ii * 1.2 > civ2.ii)
                warChance += Math.min(0.25, Math.max(0, civ.ii / civ2.ii / 10)) || 0;
            if (civ.pop * 1.2 > civ2.pop)
                warChance += Math.min(0.25, Math.max(0, civ.pop / civ2.pop / 10)) || 0;

            if (!civ.mandate) {
                let civAdjMoney = (civ.money || 0) + (civ.deposit || 0) + (civ.income || 0) * 4 + (civ.incomesRA || 0) * 4;
                let civ2AdjMoney = (civ2.money || 0) + (civ2.deposit || 0) + (civ2.income || 0) * 4 + (civ2.incomesRA || 0) * 4;

                let minAdjMoney = Math.min(civ2AdjMoney, civAdjMoney); // one way to handle negatives

                civAdjMoney -= minAdjMoney;
                civ2AdjMoney -= minAdjMoney;

                if (civAdjMoney * 1.2 > civ2AdjMoney)
                    warChance += Math.min(0.75, Math.max(0, civAdjMoney / civ2AdjMoney / 10)) || 0;

                warChance *= (civ2.rchance || 0) + 1;
            }

            const oppressedPop = civ2._poptable?.[civ.culture];

            if (civ.mandate && civ.culture != civ2.culture && oppressedPop < 500000) {
                warChance *= 0.10;
                warChance = Math.min(warChance, 0.7);
            }

            if (civ.mandateInAcquirement) {
                warChance *= 50;
                warChance = Math.min(warChance, 10);
            }
            if (warChance > 0.25) {
                if (civ.culture == civ2.culture) {
                    warChance *= 2;
                } else {
                    if (civ.em / civ.ii > civ2.em / civ2.ii)
                        warChance *= 0.80;
                    else
                        warChance *= 1.2;
                    if (civ.pm / civ.ii * 0.8 > civ2.pm / civ2.ii)
                        warChance *= 0.35;
                    if (civ.pm / civ.ii > civ2.pm / civ2.ii)
                        warChance *= 0.35;
                    else
                        warChance *= 1.5;

                    if (oppressedPop > 500000) {
                        warChance *= 1.5 + Math.min(10, Math.max(0, oppressedPop / civ.pop * 10));
                    } else {
                        warChance *= 0.50;
                    }
                }
            }

            warChance *= Math.min(5, Math.max(0, (civ.deposit + civ.money) / (civ.ii * civ.urban / 10 * 2)));

            warChance *= civ.happiness / 100 - 0.2;
            warChance *= AGGRESSIVENESS;
            warChance *= 1 + (civ2.gov?.mods?.OFRHS || 0);

            civ._warChances[cn] = warChance;

            // if (((civ.income > civ2.income * 0.7 && civ.technology > civ2.technology + 1 && civ.income > 100 && civ.deposit > civ.income * 2) || civ.income > civ2.income) && civ.happiness >= 95 && Math.random() > 0.8) {
            if (Math.random() < warChance && civ.income > 100 &&
                Math.random() < (Math.max(0.1, 1 - civ.ii / 700))) {
                const majorWar = civ.culture != civ2.culture && oppressedPop < 500000 ? false : (Math.random() < Math.sqrt(warChance) ? (1 + warChance) : 0);
                if (!declareWar(civName, cn, undefined, undefined, majorWar))
                    return;
            } else if ((civ2.ii * 0.5 < civ.ii || civ2.income > civ.income) && Math.random() > 0.6)
                alliance = true;
              else if (civ.income * 0.5 > civ2.ii && civ.happiness < 60 && Math.random() > 0.8 && (!civ.war || Object.getOwnPropertyNames(civ.war).length <= 4))
                alliance = true;
            if (alliance) {
                civ.AIprompted = civ.AIprompted || {};
                if (!civ.AIprompted[cn] || Math.random() > 0.99) {
                    if (Math.random() > 0.96) promptForAlliance(civName, cn);
                    if (!isPeace(civ, cn)) promptForPact(civName, cn);
                    civ.AIprompted[cn] = true;
                }
            }
        }

        var moneySpent = -10;
        var list = getAllUnits(civName);
        var moveVal = -1;
        for (var ii = 0; ii < list.length; ii++) {

            if (civ.politic < 1) {
                return;
            }

            var item = list[ii];
            var row = item.row;
            var col = item.col;
            var land = item.land;

            if (land.type.val) {
                if (land.type.val > 10)
                    moveVal = land.type.val;
                else {
                    moveVal += land.type.val;
                    land.type = types.land;
                }
                if (Math.random() < 0.1 || (Math.random() < 0.1 && land.type.val > 25))
                    land.type = types.land;
            }

            var neighbor = false;

            getNeighbors(row, col, function(l2, r, c) {
                if (l2) {
                    if (l2.color != civName && l2.type) {
                        let isAl = isAlliance(civ, l2.color);
                        if (isAl) return;
                        if (!isAtWar(civ, l2.color)) {
                            return;
                        }
                        neighbor = true;
                        if (civ.politic < 1) {
                            return;
                        }
                        if (l2.type.defend == types.land.defend && Math.random() < 0.5 && moneySpent + 35 < maxMoney && land.type.defend != types.fort.defend) {
                            civ.money -= 25 * (civ.ii > 225 ? 1.5 : 1);
                            moneySpent += 25 * (civ.ii > 225 ? 1.5 : 1);
                            land.type = (civ.ii > 225 ? types.headquarter : types.fort);
                            return;
                        }
                        var m = l2.type.val ? l2.type.val + Math.round(Math.random() * 15) : l2.type.defend + Math.round(Math.random() * 15);
                        if (moveVal > m / 2) {
                            m = moveVal;
                            land.type = types.land;
                            moneySpent -= m + m / 4;
                            civ.money += m * 1.7;
                        }
                        if (Math.random() < 0.2)
                            moveVal = -1;
                        moneySpent += m * 2;
                        if (moneySpent > maxMoney) {
                            if (l2.type.defend == types.city.defend) {
                                moneySpent -= m * 2 - 2;
                                m = 1;
                            } else
                                return;
                        }
                        civ.logistics += m / 4;
                        civ.money -= m * 2;
                        civ.nextDecline = (civ.nextDecline || 0) + Math.max(0, m * 400 * (1 + (civ.ii || 0) / 1000));
                        civ.nextDecline = Math.min(civ.pop * 0.9 || 0, civ.nextDecline);
                        var result = move(civOrders[i], {
                            civ: civName,
                            type: {
                                val: m
                            }
                        }, [r, c], 'ai');
                        var val = result[0];
                        if (result[1] == 0 /* && (Math.random() < 0.45 || l2.type.defend == types.land.defend)*/
                        ) {
                            list.push({
                                row: r,
                                col: c,
                                land: data[r][c]
                            })
                        }

                        const omvpc = 1 + (civ.gov?.mods?.OMVPC || 0);
                        civ.politic -= 0.7 * omvpc;
                        const mmvct = 1 + (civ.gov?.mods?.MMVCT || 0);
                        civ.money -= val / 25 * mmvct;
                    }
                }
            })

            if (!neighbor && (land.type.defend == types.fort.defend || land.type.defend == types.headquarter.defend) && Math.random() < 0.2) {
                land.type = types.land;
            }
        }

    },
    tryBuild: function(civ, civName, maxMoney, type, price, econMod=1, popMod=1, cityOveride=false) {
        var moneySpent = price;
        let buildList = []; // [[row, col], ...]
        iterateMathRandom(function(row, col) {
            if (Math.random() < 0.25)
                return;

            var land = data[row][col];

            // if (moneySpent > maxMoney || price > civ.money || civ.money < 0)
            //     return;

            if (land &&
                (// !land.color || <- disallow building on unowned land
                    (land.type && land.color == civName
                        && land.type.defend != types.capital.defend
                        && land.type.defend != types.school.defend
                        && land.type.defend != types.finance.defend
                        && (cityOveride || land.type.defend != types.city.defend)))) {
                if (land.type && land.color == civName && land.type.defend == types.fort.defend)
                    return;
                var bool = false;
                var built = false;
                var capital = false;
                var neighbor = false;
                getNeighbors(row, col, function(l2, r, c) {
                    getNeighbors(r, c, function(l) {
                        if (Math.random() < 0.8)
                            return;
                        if (l && l.color != civName)
                            built = true;
                        if (l && l.type && l.type.defend == types.land.defend && Math.random() > 0.70)
                            built = built;
                        else if (l?.type &&
                            l.type.defend != types.land.defend &&
                            l.type.defend != types.capital.defend &&
                            l.type.defend != types.school.defend &&
                            l.type.defend != types.finance.defend &&
                            l.type.defend != types.fort.defend &&
                            l.type.defend != types.gate.defend)
                            built = civ.urban < 30 ?
                                        true :
                                        (civ.urban < 50 &&
                                    (type == types.finance || (Math.random() > 0.6 && type == types.school) || l.type.defend == types.capital.defend) ?
                                            Math.random() > 0.6 : true);
                    });
                    if (l2 && l2.color == civName) {
                        if (l2 && l2.type && l2.type.defend == types.capital.defend)
                            capital = built = true;
                        bool = true;
                        if (l2.type &&
                            l2.type.defend != types.land.defend &&
                            l2.type.defend != types.capital.defend &&
                            l2.type.defend != types.school.defend)
                            built = l2.type.defend == types.city.defend && cityOveride ? built : true;
                    } else if (l2 && l2.color != civName) {
                        neighbor = true;
                    }
                });
                if (neighbor && land.color == civName && type.defend == types.fort.defend && Math.random() > 0.6) {
                    buildList.push([row, col]);
                } else if (bool && !built && !capital) {
                    buildList.push([row, col]);
                }
            }
        });

        const B = 10000;

        buildList.sort((a, b) =>
            // rebuild fallen cities to preserve population:
            Math.log((popv2_get_totpop(b[0], b[1]) + B) / B) -
            Math.log((popv2_get_totpop(a[0], a[1]) + B) / B) +
            ((res_pop_mod(b[0], b[1]) * popMod) + (res_econ_mod(b[0], b[1]) * econMod) + Math.random() * 0.1) -
            ((res_pop_mod(a[0], a[1]) * popMod) + (res_econ_mod(a[0], a[1]) * econMod) + Math.random() * 0.1)
        ).forEach((x) => {
            let currentUrban = civ._aicitycount / civ.ii * 100;
            if (moneySpent > maxMoney || price > civ.money || civ.money < 0 ||
                (Math.min(civ.incomesRA, civ.income) / 3 < (currentUrban - 55) * 10)) // max 30% to urban overflow
                return;
            civ._aicitycount++;

            [row, col] = x;

            const land = data[row][col];

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
            moneySpent += price;
        });
    },
    tryBuildLand: function(civ, civName, maxMoney) {
        var moneySpent = civGetLandPrice(civ);

        if (moneySpent > maxMoney || civ.money < moneySpent)
            return false;

        let buildList = []; // [[row, col], ...]
        iterateMathRandom(function (row, col) {
            if (Math.random() < 0.1)
                return;

            var land = data[row][col];

            if (land && !land.color) {
                var bool = false;
                getNeighbors(row, col, function(l2) {
                    if (l2 && l2.color == civName) {
                        bool = true;
                    }
                });
                if (bool) {
                    buildList.push([row, col]);
                }
            }
        });

        buildList.sort((a, b) =>
            ((res_pop_mod(b[0], b[1]) * 2.0) + (Math.min(2, res_econ_mod(b[0], b[1])) * 1.0) + Math.random() * 0.1) -
            ((res_pop_mod(a[0], a[1]) * 2.0) + (Math.min(2, res_econ_mod(a[0], a[1])) * 1.0) + Math.random() * 0.1)
        ).forEach(([row, col]) => {
            if (moneySpent > maxMoney || civ.money < moneySpent)
                return;

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
        });
    }
};
