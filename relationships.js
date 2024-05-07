declareWar = function(civName1, civName2, ig, par, majorWar) {
    let civ1 = civs[civName1];
    let civ2 = civs[civName2];
    if ((civ1.war && civ1.war[civName2]) || (civ2.war && civ2.war[civName1]) || (ig ? false : Math.random() < 0.8))
        return false;
    if (ig ? false : (civ1.politic <= 8 || Math.random() > 0.8))
        return false;
    //if (civ1.ii / (data.length * data[0].length) > 0.5 && Math.random() < 0.9) return false;
    //if (civ1.ii / (data.length * data[0].length) > 0.07 && Math.random() < 0.9) return false;
    const odppc1 = 1 + (civ1.gov.mods.ODPPC || 0);
    const odppc2 = 1 + (civ2.gov.mods.ODPPC || 0);
    let diff1 = civ1.politic * 2 / 3 * odppc1;
    civ1.politic = Math.max(1, civ1.politic - diff1);
    let diff2 = civ2.politic * 1 / 2 * odppc2;
    civ2.politic = Math.max(1, civ2.politic - diff2);
    civ1.war = civ1.war ? civ1.war : {};
    civ2.war = civ2.war ? civ2.war : {};

    // 10 politic = max 14 moves per turn; minor war = 10%, major war=80%

    let maxII = Math.max(civ1.ii, civ2.ii) || 50;
    let turnsForFullII = maxII / 10;

    let turns = 1 + Math.round(Math.random() * 2) +
        (Math.ceil(randn_bm() * turnsForFullII * 0.1)) +
        Math.ceil((majorWar || 0) * (randn_bm() * turnsForFullII * 0.8));

    civ2.war[civName1] = civ1.war[civName2] = turns + 0.5;

    if (!civ1.ai || !civ2.ai)
        msg_alert(civName1 + " declared " + (majorWar ? "major " : "") + "war on " + (civName2 + "(" + civ1.war[civName2] / 4) + " years) " + (par || ''), [civName1, civName2]);
    else
        push_msg(civName1 + " declared " + (majorWar ? "major " : "") + "war on " + (civName2 + "(" + civ1.war[civName2] / 4) + " years) " + (par || ''), [civName1, civName2]);
    Object.getOwnPropertyNames(civ2.war).forEach(x=>{
        if (civ2.war[x] <= -4 && civs[x].ii > 0 && civ2.war[x] % 1 == 0) {
            declareWar(civName1, x, true, par || `As a result between ${civName1} - ${civName2} war`, majorWar);
        }
    }
    );
    Object.getOwnPropertyNames(civ1.war).forEach(x=>{
        if (civ1.war[x] <= -4 && civs[x].ii > 0 && civ1.war[x] % 1 == 0) {
            declareWar(civName2, x, true, par || `As a result between ${civName1} - ${civName2} war`, majorWar);
        }
    }
    );
    if ((!civ1.ai || !civ2.ai) && (civOrders[i] == civName1 || civOrders[i] == civName2))
        showInfo();

    gov_opinion_aggressive_war(civ1, civName1, civ1.gov);
    gov_refresh(civ1, civName1);
    return true;
}
;

calculateYears = function(civ, civName) {
    if (civ.war) {
        civ.tributeToMe = {};
        civ.tributeToOther = {};
        /*
        if (civ.war[x] < -5) {
                civ.war[x] += 2;
                if (civ.war[x] % 1 == 0) {
        */
        let civsToTribute = Object.getOwnPropertyNames(civ.war).filter(x => civ.war[x] < -5 && civ.war[x] % 1 == 0 && civs[x].ii > 2).length;
        Object.getOwnPropertyNames(civ.war).forEach((x)=>{
            var civ2 = civs[x];
            civ2.war = civ2.war || {};
            if (!Number.isFinite(civ.war[x])) {
                delete civ.war[x];
                if (civ2.war) delete civ2.war[civName];
                return;
            }
            civ.war[x]--;
            //             if (civ.war[x] == -1) {
            //                 civ.war[x] = Math.round(-30 * 4 * Math.random()) + 0.5;
            //                 if (civ2 && civ2.war)
            //                     civ2.war[civName] = civ.war[x];
            //                 alert(`${civName} - ${x} War ended.`);
            //             }
            if (civ.war[x] >= -0.5 && (civ.war[x] <= 1 || civ.ii <= 2 || civ2.ii <= 2)) {
                civ.war[x] = Math.round(-20 * 4 * Math.random()) - 5.5;
                if (civ2 && civ2.war)
                    civ2.war[civName] = civ.war[x];
                civ.rchance *= 0.8;
                civ.happiness *= 1.1;
                civ2.rchance *= 0.8;
                civ2.happiness *= 1.1;

                push_msg(`${civName} - ${x} War ended.`, [civName, x]);

                // update old colors & borders:
                for (let row = 0;row < data.length;row++) {
                    for (let col = 0;col < data[row].length;col++) {
                        let r = data[row][col];
                        if ((r?._oldcolor == x && r?.color == civName) ||
                            (r?._oldcolor == civName && r?.color == x)) {
                            delete r._oldcolor;
                            delete r._oct;
                        }
                    }
                }
            }
            if (civ.war[x] < -5) {
                civ.war[x] += 2;
                if (civ.war[x] % 1 == 0) {
                    if (civ2.ii > 2) {
                        var income1 = Math.max(0, (civ.income - civ.govExp) / civsToTribute * 0.333 || 0);
                        // var income2 = Math.max(0, civ2.income / 20);
                        if (civ2.politic > 5) {
                            civ._polFromAllies += civ2.politic / 10 / civsToTribute;
                            civ.politic += civ2.politic / 10 / civsToTribute;
                        }
                        civ.money -= income1;
                        civ2.money += income1;
                        if (civ2.technology > civ.technology) {
                            let diff = civ2.technology - civ.technology;
                            diff = Math.round((Math.sqrt(diff + 1) - 1) * 100 * Math.random() / 10) / 100;
                            civ._techFromAllies += diff;
                            civ.technology += diff;
                        }
                        //                 civ.tributeToOther = civ.tributeToOther || {};
                        //                 civ.tributeToMe = civ.tributeToMe || {};
                        civ2.tributeToOther = civ2.tributeToOther || {};
                        civ2.tributeToMe = civ2.tributeToMe || {};

                        civ.tributeToOther[x] = income1;
                        civ2.tributeToMe[civName] = income1;
                    }

                    if (civ.war[x] >= -5) {
                        delete civ.war[x];
                        delete civ2.war[civName];
                        push_msg(`${civName} - ${x} Alliance ended.`, [civName, x]);
                    }
                } else if (civ.war[x] >= -5) {
                    delete civ.war[x];
                    delete civ2.war[civName];
                }

            }
            // civ2.war = civ2.war || {};
            civ2.war[civName] = civ.war[x];
        }
        );
    }
}
;

isAtWar = function(civ, civName) {
    if (civ.war && civ.war[civName]) {
        return civ.war[civName] >= 0;
    }
    return false;
}
isAlliance = function(civ, civName) {
    if (civ.war && civ.war[civName]) {
        let x = civ.war[civName]
        return x <= -5 && x % 1 == 0;
    }
    return false;
}
;
isPeace = function(civ, civName) {
    if (civ.war && civ.war[civName]) {
        let x = civ.war[civName]
        return x <= -5 && x % 1 != 0;
    }
    return false;
}
;

function giveMoneyTo(civName, civName2, money, against) {
    if (isNaN(money) || money <= 0)
        return;
    var civ = civs[civName];
    var civ2 = civs[civName2];
    if (!civ || !civ2)
        return;
    civ.money = civ.money || 0;
    if (civ.money < money) {
        if (!civ.ai)
            alert('Not enough money!');
        return;
    }
    civ.money -= money;
    civ2.money = civ2.money || 0;
    civ2.money += money;
    console.log(`${civName} had sent $${Math.round(money * 100) / 100} to ${civName2} to help in war effort against ${against}.`);
    if (!civ2.ai) {
        if (against)
            push_msg(`${civName} had sent $${Math.round(money * 100) / 100} to help in war effort against ${against}.`, [civName, civName2])
        else
            push_msg(`${civName} had sent $${Math.round(money * 100) / 100} to help in war effort.`, [civName, civName2])
    }
}

function promptForAlliance(civName, civName2) {
    var civ = civs[civName];
    var civ2 = civs[civName2];
    if (!civ || !civ2)
        return;
    if (isAtWar(civ, civName2))
        return false;
    if (isAlliance(civ, civName2))
        return false;
    var deal = false;
    civ.war = civ.war || {};
    civ2.war = civ2.war || {};
    if (civ2.ai) {
        if (civ2.ii > civ.ii && civ.ii >= civ2.ii * 0.4 && Math.random() > 0.3 && (Math.random() > 0.6 || Object.getOwnPropertyNames(civ2.war).length < 5))
            deal = true;
        else if (civ2.ii < civ.ii)
            deal = true;
        for (let [key, value] of Object.entries(civ.war)) {
            if (key == civName || key == civName2) continue;
            if (isAlliance(civs[key], civName) && isAlliance(civs[key], civName2) &&
                ((civ2.income > civ.income * 0.5 && civ2.ii > civ.ii * 0.5 &&
                 civs[key].income > civ.income * 0.8 && civs[key].ii > civ.ii * 0.8 && Math.random() < 0.6) || Math.random() < 0.1)) {
                deal = true;
                break;
            }
        }
    } else if (!civ2.ai) {
        alert(`Give control to ${civName2}`);
        deal = confirm(`${civName} wants to form an alliance with you.`);
    }

    if (deal) {
        push_msg(`${civName} and ${civName2} formed an alliance for ` + ((civ.war[civName2] = civ2.war[civName] = Math.round(-20 * 4 * Math.random()) - 5) / 4) + ' years', [civName, civName2]);
        const odppc1 = 1 + (civ.gov?.mods?.ODPPC || 0);
        const odppc2 = 1 + (civ2.gov?.mods?.ODPPC || 0);
        civ.politic -= 5 * odppc1;
        civ2.politic -= 5 * odppc2;
        showInfo();
    }

    return deal;
}
function promptForPact(civName, civName2) {
    var civ = civs[civName];
    var civ2 = civs[civName2];
    if (!civ || !civ2)
        return;
    if (isAtWar(civ, civName2))
        return false;
    if (isAlliance(civ, civName2))
        return false;
    var deal = false;
    civ.war = civ.war || {};
    civ2.war = civ2.war || {};
    if (civ2.ai) {
        if (civ2.ii > civ.ii && civ.ii >= civ2.ii * 0.4 && Math.random() > 0.5 && civ2.technology < civ.technology)
            deal = true;
        else if (civ2.ii < civ.ii && Math.random() > 0.5)
            deal = true;
        for (let [key, value] of Object.entries(civ.war)) {
            if (key == civName || key == civName2) continue;
            if ((isAlliance(civs[key], civName) && isAlliance(civs[key], civName2)) ||
                (value > 1 && civ2.war[key] > 1)) {
                deal = true;
                break;
            }
        }
    } else if (!civ2.ai) {
        alert(`Give control to ${civName2}`);
        deal = confirm(`${civName} wants to sign a non-aggression pact with you.`);
    }

    if (deal) {
        push_msg(`${civName} and ${civName2} signed a non-aggression pact for ` + ((civ.war[civName2] = civ2.war[civName] = Math.round(-20 * 4 * Math.random()) - 6.5) / 4) + ' years', [civName, civName2]);
        const odppc1 = 1 + (civ.gov?.mods?.ODPPC || 0);
        const odppc2 = 1 + (civ2.gov?.mods?.ODPPC || 0);
        civ.politic -= 5 * odppc1;
        civ2.politic -= 5 * odppc2;
        showInfo();
    }

    return deal;
}
