function popv2_init() {
  // popv2 also set to null when resources.js generates terrain due to changed map
  popv2 = Object.assign({
    map: [[]],
    cultures: {},
  }, popv2);

  // map mismatch -> v1 to v2
  if (!arrayDeepEqual(size(popv2.map), size(data))) {
    popv2.map = Array(data.length).fill(1).map((_, row) => Array(data[0].length).fill(1).map((_, col) => {
      const tile = data[row][col];
      if (!tile)
        return null;

      const obj = {
        pop: {

        },
        hist: {

        },
        totPop: 0,
      };

      if (!tile.color)
        return obj;

      const culture = popv2_culture_get_or_create_civ(tile.color);

      if (tile.pop) {
        obj.totPop = obj.pop[culture.name] = obj.hist[culture.name] = tile.pop;
      }

      return obj;
    }));
  }
}

function popv2_get_totpop(row, col) {
  return popv2?.map?.[row]?.[col]?.totPop || 0;
}

POPV2_FLAG_USE_UNI_CULTURE = false;

function popv2_culture_get_or_create_civ(civName) {
  const civ = civs[civName];
  if (!civ.culture)
    civ.culture = POPV2_FLAG_USE_UNI_CULTURE ? 'DefaultCulture' : civName;

  return popv2_culture_get_or_create(civ.culture);
}

function popv2_culture_get_or_create(name, mods={}) {
  return popv2.cultures[name] = Object.assign({
    name
  }, mods);
}