// Compare average terrain productivity. Population potential carries more weight in war planning.
function relativeLandValue(parent, region) {
    function average(total, tiles) { return total > 0 && tiles > 0 ? total / tiles : 1; }
    const population = average(region.pm, region.ii) / average(parent.pm, parent.ii);
    const economy = average(region.em, region.ii) / average(parent.em, parent.ii);
    return Math.max(0.08, Math.min(4, population ** 2 * Math.sqrt(economy)));
}

function rebellionSample(items, weight) {
    let selected;
    let sum = 0;
    for (const item of items) {
        const w = weight(item);
        if (!(w > 0)) continue;
        sum += w;
        if (Math.random() * sum < w) selected = item;
    }
    return selected;
}

function rebellionCells(parentName) {
    const cells = new Map();
    const owners = new Set();
    data.forEach((line, row) => line.forEach((tile, col) => {
        if (!tile?.color) return;
        owners.add(tile.color);
        if (tile.color !== parentName) return;
        const population = popv2.map[row][col];
        const cultures = population?.pop || {};
        const majority = Object.keys(cultures).reduce((best, k) => cultures[k] > (cultures[best] || 0) ? k : best, null);
        const cell = { row, col, tile, cultures, majority, population: population?.totPop || 0,
            history: population?.hist || {}, totalHistory: population?.totHist || 0,
            pm: res_pop_mod(row, col), em: res_econ_mod(row, col) };
        cells.set(row + ':' + col, cell);
    }));
    return { cells, owners };
}

function rebellionPartitions(cells, seeds) {
    // Positive integer traversal costs let us visit the frontier in distance order.
    const frontier = [seeds.map((seed, group) => ({ cell: seed, group }))];
    const claimed = new Set();
    const groups = seeds.map(() => []);
    for (let distance = 0; distance < frontier.length; distance++) {
        for (const { cell, group } of frontier[distance] || []) {
            if (claimed.has(cell) || groups[group].length >= (seeds[group].tileLimit ?? Infinity)) continue;
            claimed.add(cell);
            groups[group].push(cell);
            for (const [r, c] of Military.getNeighbors(cell.row, cell.col)) {
                const next = cells.get(r + ':' + c);
                if (!next || claimed.has(next)) continue;
                const culture = seeds[group].movementCulture;
                const share = (next.cultures[culture] || 0) / Math.max(1, next.population);
                const history = (next.history[culture] || 0) / Math.max(1, next.totalHistory);
                const terrain = 1 / Math.max(0.35, Math.sqrt(next.pm * next.em));
                const cost = Math.max(1, Math.round(4 * terrain * (2.5 - share - 0.5 * history)));
                (frontier[distance + cost] ??= []).push({ cell: next, group });
            }
        }
    }
    return groups;
}

function rebellionProfile(cells) {
    const profile = { ii: cells.length, pm: 0, em: 0, pop: 0, income: 0, realIncome: 0, gdpIncomeMod: INCOMEMOD, preReserveIncome: 0, _poptable: {} };
    for (const cell of cells) {
        profile.pm += cell.pm;
        profile.em += cell.em;
        profile.pop += cell.population;
        profile.income += cell.tile._econ || 0;
        profile.realIncome += cell.tile._realIncome ?? tileIncomeFactors(cell.tile, cell.population, cell.em).real;
        profile.preReserveIncome += cell.tile._preReserveIncome ?? cell.tile._econ ?? 0;
        for (const [culture, pop] of Object.entries(cell.cultures)) {
            profile._poptable[culture] = (profile._poptable[culture] || 0) + pop;
        }
    }
    profile._poptable_tot = profile.pop;
    profile.culture = gov_majority(profile);
    return profile;
}

function popRebel(preferredName, parentName, source, cultural = false, event = {}) {
    const parent = civs[parentName];
    if (!parent?.gov) return false;
    const { cells, owners } = rebellionCells(parentName);
    const dormant = civOrders.filter(name => !owners.has(name) && civs[name].technology >= 0);
    const core = cells.get(parent.birth?.join(':')) || cells.get(Military.getCapital(parentName)?.join(':'));
    if (!core || !dormant.length) return false;
    core.movementCulture = parent.culture;
    const seeds = [core];
    const instability = 1 - (parent.gov.legitimacy ?? 50) / 100;
    for (let i = 0; i < Math.min(4, dormant.length); i++) {
        if (i && (cultural || event.local || Math.random() > instability * cells.size / (cells.size + 30))) break;
        const seed = event.unit ? cells.get(event.unit.row + ':' + event.unit.col) : rebellionSample(cells.values(), cell => {
            if (!cell.majority || seeds.includes(cell)) return 0;
            if (cultural && (cell.majority === parent.culture || (event.culture && cell.majority !== event.culture))) return 0;
            const distance = Math.min(...seeds.map(other => Math.abs(other.row - cell.row) + Math.abs(other.col - cell.col)));
            const support = cell.cultures[cell.majority] / Math.max(1, cell.population);
            const preferred = source && source[0] === cell.row && source[1] === cell.col;
            return Math.sqrt(cell.population) * distance * support * (preferred ? 3 : 1) /
                Math.max(0.1, regions_taxEff(parent, parentName, cell.row, cell.col));
        });
        if (!seed || seed === core) break;
        if (event.local) seed.tileLimit = Math.max(3, Math.ceil(Math.sqrt(cells.size) * (0.5 + Math.random())));
        if (event.culture) {
            const population = parent._poptable[event.culture];
            const share = population / Math.max(1, parent._poptable_tot);
            seed.tileLimit = Math.max(3, Math.ceil(cells.size * share * (0.75 + Math.random())));
        }
        seed.movementCulture = seed.majority;
        seeds.push(seed);
    }
    if (seeds.length < 2) return false;
    const groups = rebellionPartitions(cells, seeds);
    if (groups[0].length < 3) return false;
    const partitions = [];
    for (let i = 1; i < seeds.length; i++) {
        const region = groups[i];
        const profile = rebellionProfile(region);
        if (region.length < 3 || !profile.culture || (cultural && profile.culture !== seeds[i].majority)) continue;
        const name = rebellionSample(dormant, name => {
            const birthplace = cells.get(civs[name].birth?.join(':'));
            return (region.includes(birthplace) ? 5 : 1) * (name === preferredName ? 3 : 1);
        });
        dormant.splice(dormant.indexOf(name), 1);
        partitions.push({ name, region, profile, seed: seeds[i] });
    }
    if (!partitions.length) return false;

    const surrendered = new Set(partitions.flatMap(part => part.region));
    const retained = rebellionProfile([...cells.values()].filter(cell => !surrendered.has(cell)));
    const oldSize = cells.size;
    const treasury = Math.max(0, parent.deposit || 0);
    const wars = Object.values(parent.war || {}).filter(timer => timer > 0).length;
    const decisions = [];
    for (const { name, region, profile, seed } of partitions) {
        const successor = civs[name];
        for (const other of Object.values(civs)) if (other.war) delete other.war[name];
        successor.war = {};
        for (const { tile } of region) {
            tile.color = name;
            tile.acquiredTurn = turn;
            delete tile._oldcolor;
            delete tile._oct;
        }
        const share = profile.ii / oldSize;
        Object.assign(successor, profile, { birth: [seed.row, seed.col], years: 0, rchance: 0,
            happiness: 75, politic: 50, deposit: treasury * share, money: 100 + 5 * profile.ii,
            technology: Math.max(1, parent.technology * (0.65 + 0.35 * Math.random())),
            neighbors: { [parentName]: 1 }, urban: Math.max(1, parent.urban || 1) });
        parent.deposit = Math.max(0, (parent.deposit || 0) - successor.deposit);
        delete successor._parts;
        delete successor.mandate;
        delete successor._hadMandate;
        seed.tile.type = types.capital;
        gov_init(successor, name);
        successor.lastSovereignCulture = profile.culture;
        delete successor.lastRebellion;
        delete successor.culturalPressure;
        delete successor.rebellionProbability;
        successor.gov.legitimacy = 35;
        successor.gov.persons[successor.gov.leader].culture = profile.culture;
        decisions.push({ name, seed });
    }
    const rulingCulture = parent.culture;
    Object.assign(parent, retained, { culture: rulingCulture });
    delete parent._parts;
    parent.lastRebellion = turn;
    parent.happiness *= 0.9;
    gov_opinion_rebel(parent, parentName, parent.gov);
    for (const { name, seed } of decisions) {
        const successor = civs[name];
        if (event.unit) {
            Military.defectDivision(event.unit, name);
            push_msg(event.unit.name + ' has risen against ' + parentName + ' in support of ' + name + '.', [parentName, name]);
        } else if (event.local) {
            push_msg('A provincial uprising in ' + parentName + ' has founded ' + name + '.', [parentName, name]);
        }
        const draft = event.unit ? 0 : Math.floor(seed.population * 0.025);
        if (draft > 0) Military.conscript(name, seed.row, seed.col, draft, { ignoreCost: true });
        parent.neighbors ??= {};
        parent.neighbors[name] = 1;
        const assessment = { ...parent, neighbors: { [name]: 1 } };
        resolveAIForCiv(parent).calculateWarChances(assessment, parentName);
        const propensity = Math.max(0, assessment._warChances[name] || 0);
        const distance = Math.abs(core.row - seed.row) + Math.abs(core.col - seed.col);
        const reach = 1 / (1 + distance / Math.sqrt(parent.ii));
        const strength = Math.sqrt((1000 + (parent.military || 0)) / (1000 + (successor.military || 0)));
        const militaryAdvantage = 2 * strength / (1 + strength);
        const successionWarOdds = successor.culture === rulingCulture ? 3 : 0.7;
        const odds = successionWarOdds * relativeLandValue(parent, successor) * reach * militaryAdvantage *
            (0.5 + parent.gov.legitimacy / 100) * (1 + Math.log1p(propensity)) / (1 + wars * 0.35);
        if (Math.random() < odds / (1 + odds)) {
            declareWar(parentName, name, true, 'over the succession of ' + name, 2);
        } else {
            parent.war ??= {};
            parent.war[name] = successor.war[parentName] = -45.5;
            push_msg(parentName + ' recognizes the independence of ' + name + '.', [parentName, name]);
            for (const unit of Military.getDivisions(parentName)) {
                if (data[unit.row][unit.col]?.color === name) {
                    Military._moveDivision(unit, core.row, core.col);
                    unit.moveTargets = [];
                }
            }
        }
    }
    return true;
}


function setRebellionModifier() {
    const input = prompt('RCHANCEMOD=', RCHANCEMOD);
    if (input === null || !input.trim()) return;
    const value = Number(input);
    if (Number.isFinite(value) && value >= 0) RCHANCEMOD = value;
}

// Keep the historical scenario scale: 0.0001 base management pressure per quarter.
// The former tenfold size step around 200 tiles is a gradual transition here.
function managementPressure(civ) {
    const happiness = Math.max(1, civ.happiness ?? 100);
    const cohesion = Math.max(0.1, civ.gov.cohesion ?? 1);
    const stress = Math.max(0, 20 / happiness - 0.1) + Math.max(0, 1 - cohesion);
    const sizeFactor = 0.1 + 0.9 / (1 + Math.exp((200 - civ.ii) / 25));
    const areaShare = civ.ii / Math.max(1, data.length * data[0].length);
    const authority = (civ.gov.legitimacy ?? 50) / 100;
    const decline = Math.max(0, -(civ.popchangeperc || 0));
    const growthShock = 1 + Math.min(100, decline * decline);
    const mandate = civ.mandate ? 0.5 + 0.5 * Math.min(1, civ.years / 100) : 1;
    return 0.0001 * stress * (1 + stress) * sizeFactor * (1 + 10 * areaShare) *
        (1 + civ.years / 75) * growthShock * mandate * Math.exp(2 * (1 - cohesion)) *
        (1.5 - authority) * (1 + 0.3 / (1 + Math.max(0, civ.politic) / 5)) *
        Math.max(0.1, 1 + (civ.gov.mods.ORBRD || 0));
}

function culturalMovements(civ) {
    const formerCultures = new Set();
    for (const other of Object.values(civs)) {
        if (other.ii > 0) continue;
        const culture = other.lastSovereignCulture || (other.birth && other.culture);
        if (culture) formerCultures.add(culture);
    }
    const movements = [];
    for (const [culture, population] of Object.entries(civ._poptable || {})) {
        if (!population || culture === civ.culture) continue;
        const share = population / Math.max(1, civ._poptable_tot);
        // Smooth the old 100k population and 5% share gates for restoration movements.
        const scale = population / (100000 + population);
        const restoration = formerCultures.has(culture) ? scale * (0.0025 + share * (1 + share) / 20) : 0;
        movements.push({ culture, pressure: share * scale * 0.012 + restoration });
    }
    return movements;
}

function rebellionQuarter(civ, civName, disaster = 0) {
    if (civ.ii >= 3) civ.lastSovereignCulture = civ.culture;
    const prior = Math.max(0, (civ.rchance || 0) - (civ.culturalPressure || 0));
    const management = Math.min(0.5, 0.7 * prior + 0.3 * managementPressure(civ));
    const movements = culturalMovements(civ);
    const restoration = movements.reduce((sum, movement) => sum + movement.pressure, 0);
    civ.culturalPressure = Math.min(0.5 - management, restoration);
    civ.rchance = management + civ.culturalPressure;

    const reach = civ.ii / (civ.ii + 100);
    const famine = reach * disaster * 0.65;
    const funding = civ.militaryUpkeep?.fundedRatio ?? 1;
    const units = Military.getDivisions(civName).filter(unit =>
        data[unit.row]?.[unit.col]?.color === civName &&
        !(unit.row === civ.birth?.[0] && unit.col === civ.birth?.[1]));
    const discontent = unit => Math.max(0, 1 - unit.morale) + Math.max(0, 1 - funding);
    const garrisonStrain = units.reduce((sum, unit) => sum + discontent(unit), 0);
    const mutiny = reach * 0.004 * garrisonStrain / (1 + units.length);
    const breakdown = management * Math.min(1, 1000 * management);
    const total = breakdown + restoration + famine + mutiny;
    const elapsed = (turn - (civ.lastRebellion ?? -Infinity)) / civOrders.length;
    const recovery = 1 - Math.exp(-Math.max(0, elapsed) / 20);
    civ.rebellionProbability = civ.ii >= 6 ? Math.min(1, recovery * RCHANCEMOD * total) : 0;
    if (Math.random() >= civ.rebellionProbability) return;

    const draw = Math.random() * total;
    let success;
    if (draw < restoration) {
        const movement = rebellionSample(movements, m => m.pressure);
        success = popRebel(null, civName, null, true, { culture: movement.culture });
    } else if (draw < restoration + mutiny) {
        const unit = rebellionSample(units, discontent);
        success = popRebel(null, civName, null, false, { unit, local: true });
    } else {
        const local = draw < restoration + mutiny + famine || Math.random() < reach * 0.35;
        success = popRebel(null, civName, null, false, { local });
    }
    if (success) civ.rchance = civ.culturalPressure + management * 0.35;
}
