function popv2_init() {
  // popv2 also set to null when resources.js generates terrain due to changed map
  popv2 = Object.assign({
    map: [[]],
    cultures: {},
  }, popv2);

  // map mismatch -> v1 to v2
  if (!arrayDeepEqual(size(popv2.map), size(data))) {
    _ter_gen(); // triggers popv2 = null

    popv2 = Object.assign({
      map: [[]],
      cultures: {},
    }, popv2);

    popv2.map = Array(data.length).fill(1).map((_, row) => Array(data[0].length).fill(1).map((_, col) => {
      const tile = data[row][col];
      if (!tile)
        return null;

      const obj = {
        pop: {
          // MUST have all the keys in hist, even if 0 pop
        },
        hist: {

        },
        totPop: 0,
      };

      if (!tile.color)
        return obj;

      const culture = popv2_culture_get_or_create_civ(tile.color);

      // if (tile.pop) {
      obj.totPop = obj.pop[culture] = obj.hist[culture] = Math.max(tile.pop || 0, 20000 * res_pop_mod(row, col) * Math.random());
      // }

      return obj;
    }));
 }
}

function popv2_record_history(row, col) {
  const obj = popv2.map[row][col];

  for (const key in obj.pop) {
    obj.hist[key] = (obj.hist[key] || 0) + obj.pop[key];
  }
}

function popv2_clamp_max(row, col, max) {
  const tile = data[row][col];
  if (!tile || !max) return;

  const overflow = tile.totPop - max;

  if (overflow > 0) {
    popv2_apply_delta(row, col, -overflow, { assimulationRate: 0 });
  }
}

function popv2_apply_delta(row, col, delta, { assimulationRate=0.05 }={}) {
  const tile = data[row][col];
  if (!tile || !delta) return;

  const ownerCul = tile.color ? popv2_culture_get_or_create_civ(tile.color) : null;

  const obj = popv2.map[row][col];

  if (ownerCul) {
    obj.hist[ownerCul] = obj.hist[ownerCul] || 0;
  }

  const existingCultures = Object.keys(obj.hist);

  delta = Math.max(delta, -obj.totPop + 1000); // clamp to prevent negative pops

  const reservedPartial = Math.ceil(ownerCul ? delta * assimulationRate : 0);
  const reducedDelta = delta - reservedPartial;

  let newTotPop = 0;

  for (let i = 0;i < existingCultures.length;i++) {
    const culture = existingCultures[i];

    obj.pop[culture] = obj.pop[culture] || 0;

    const perc = obj.pop[culture] / Math.max(obj.totPop, 1);
    const partial = Math.round(reducedDelta * perc);

    obj.pop[culture] += partial;

    if (ownerCul == culture) {
      obj.pop[culture] += reservedPartial;
    }

    newTotPop += obj.pop[culture];
  }

  obj.totPop = newTotPop;
}

function popv2_get_totpop(row, col) {
  return popv2?.map?.[row]?.[col]?.totPop || 0;
}

POPV2_FLAG_USE_UNI_CULTURE = false;

function popv2_culture_get_or_create_civ(civName) {
  const civ = civs[civName];
  if (!civ.culture) {
    civ.culture = POPV2_FLAG_USE_UNI_CULTURE ? 'DefaultCulture' : civName;

    popv2_culture_reinit_civ(civ.culture);
  }

  return civ.culture;
}

function popv2_culture_reinit_civ(name, mods={}) {
  return popv2.cultures[name] = Object.assign({
    name
  }, mods);
}