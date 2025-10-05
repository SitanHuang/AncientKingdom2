annex = function (owner, civName) {
    iterateMathRandom((row, col) => {
        let land = data[row][col];
        if (land && land.color == civName)
            land.color = owner
    });
    drawCanvas()
};

function blocWar(list1, list2, years, override=false) {
    !list1.push && (list1 = list1.split(","));
    !list2.push && (list2 = list2.split(","));
    list1.forEach(cn => {
        let civ = civs[cn];
        civ.war = civ.war || {};
        list2.filter(x => x != cn).forEach(cn2 => {
            let civ2 = civs[cn2];
            civ2.war = civ2.war || {};
            if (override || (!civ.war[cn2] && !civ2.war[cn]))
                civ.war[cn2] = civ2.war[cn] = years * 4 + 0.5;
        });
    });
}

function blocUnset(list1, list2, years) {
    !list1.push && (list1 = list1.split(","));
    !list2.push && (list2 = list2.split(","));
    list1.forEach(cn => {
        let civ = civs[cn];
        civ.war = civ.war || {};
        list2.filter(x => x != cn).forEach(cn2 => {
            let civ2 = civs[cn2];
            civ2.war = civ2.war || {};
            delete civ.war[cn2];
            delete civ2.war[cn];
        });
    });
}

function formPact(list, years, override=false) {
    !list.push && (list = list.split(","));
    list.forEach(cn => {
        let civ = civs[cn];
        civ.war = civ.war || {};
        list.filter(x => x != cn).forEach(cn2 => {
            let civ2 = civs[cn2];
            civ2.war = civ2.war || {};
            if (override || (!civ.war[cn2] && !civ2.war[cn]))
                civ.war[cn2] = civ2.war[cn] = -years * 4 - 6.5;
        });
    });
}

function formAlliance(list, years, override = false) {
    !list.push && (list = list.split(","));
    list.forEach(cn => {
        let civ = civs[cn];
        civ.war = civ.war || {};
        list.filter(x => x != cn).forEach(cn2 => {
            let civ2 = civs[cn2];
            civ2.war = civ2.war || {};
            if (override || (!civ.war[cn2] && !civ2.war[cn]))
                civ.war[cn2] = civ2.war[cn] = -years * 4 - 5;
        });
    });
}

addCulture = function (name, color, targetCivs='') {
    popv2 = Object.assign({
        map: [[]],
        cultures: {},
    }, popv2);
    popv2_culture_reinit_culture(name, {
        color: color || getRandomColor()
    });
    applyCulture(name, targetCivs);
};

applyCulture = function (name, targetCivs) {
    targetCivs.split(',').forEach(civName => {
        civs[civName].culture = name;
        Object.values(civs[civName].gov.persons).forEach(x => x.culture = name);
    });
}

function forceHistory(civ, old, _new, retain = 0.0) {
    popv2.map.forEach((row, ri) => row.forEach((col, ci) => {
        if (col && data[ri][ci]?.color == civ) {
            if (col.pop[old] > 1000) {
                // move most of the old values to the new culture
                const retainedPop = Math.floor(col.pop[old] * retain);
                const retainedHist = Math.floor(col.hist[old] * retain);

                const movedPop = col.pop[old] - retainedPop;
                const movedHist = col.hist[old] - retainedHist;

                col.pop[_new] = (col.pop[_new] || 0) + movedPop;
                col.hist[_new] = (col.hist[_new] || 0) + movedHist;

                // leave only the retained fraction in the old culture
                col.pop[old] = retainedPop;
                col.hist[old] = retainedHist;
            }
        }
    }));
}


addCiv = function (name, ai, color) {
    let c = color || getRandomColor();
    let civ = {
        color: c,
        fontColor: idealTextColor(c),
        money: -1,
        technology: -1,
        politic: -1
    }
    civs[name] = civ;
    civOrders = Object.keys(civs).sort();
    ai && (civs[name].ai = true);
    showInfo();
}

function makeAlliance(civsList, years, variation) {
    civsList = civsList.split(",");
    years = Math.round(years || (35 * Math.random())) * 4;
    civsList.forEach(x => {
        let civ = civs[x];
        civ.war = civ.war || {};
        civsList.filter(y => y != x).forEach(y => {
            let civ2 = civs[y];
            civ2.war = civ2.war || {};
            civ.war[y] = civ2.war[x] = -years - 5 - Math.round(Math.random() * (variation || 0));
        });
    });
}
