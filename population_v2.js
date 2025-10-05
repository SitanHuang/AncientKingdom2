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
      obj.totPop = obj.pop[culture] = Math.round(Math.max(tile.pop || 0, 20000 * res_pop_mod(row, col) * (Math.random() + 0.5)));
      obj.hist[culture] = Math.min(20000, Math.max(200000, obj.totPop * 2)) * 200 * 4;
      // }

      return obj;
    }));
 }
}

function popv2_record_history(row, col) {
  const obj = popv2.map[row][col];

  obj.totHist = 0;

  for (const key in obj.pop) {
    obj.hist[key] = (obj.hist[key] || 0) + obj.pop[key];
    obj.totHist += obj.hist[key];
  }
}

function popv2_clamp_max(row, col, max) {
  const obj = popv2.map[row][col];
  if (!obj || !max) return;

  const overflow = obj.totPop - max;

  if (overflow > 0) {
    popv2_apply_delta(row, col, -overflow, { assimulationRate: 0 });
  }
}

function popv2_get_dominant_culture(row, col) {
  const obj = popv2?.map?.[row]?.[col];
  if (!obj || !obj.pop) return undefined;

  let best;
  let bestVal = -Infinity;

  for (const [culture, val] of Object.entries(obj.pop)) {
    if (val > bestVal) {
      bestVal = val;
      best = culture;
    }
  }

  return bestVal > 0 ? best : undefined;
}

POPV2_ASSIMULATION_RATE = 0.02;
POPV2_HISTORICAL_MOMENTUM = 0.80;

function popv2_apply_delta(row, col, delta, opts={}) {
  let assimulationRate = opts.assimulationRate ?? POPV2_ASSIMULATION_RATE;

  const tile = data[row][col];
  if (!tile || !delta) return;

  const ownerCul = tile.color ? popv2_culture_get_or_create_civ(tile.color) : null;

  let obj = popv2.map[row][col];

  if (!obj) {
    obj = popv2.map[row][col] = {
      pop: {
        // MUST have all the keys in hist, even if 0 pop
      },
      hist: {

      },
      totPop: 0,
    };

    obj.totPop = obj.pop[ownerCul] = Math.round(Math.max(tile.pop || 0, 20000 * res_pop_mod(row, col) * (Math.random() + 0.5)));
    obj.hist[ownerCul] = Math.min(20000, Math.max(200000, obj.totPop * 2)) * 200 * 4;
  }

  if (ownerCul) {
    obj.hist[ownerCul] = obj.hist[ownerCul] || 0;
  }

  const existingCultures = Object.keys(obj.hist);

  delta = Math.max(delta, -obj.totPop + 2500); // clamp to prevent negative pops

  if (delta < 0) {
    assimulationRate = 0;
  }

  const reservedPartial = Math.round(ownerCul ? delta * assimulationRate : 0);
  const reducedDelta = delta - reservedPartial;

  const useHistorical = obj.totHist > 0 && delta > 0;
  const weightsArr = Array(existingCultures.length).fill(0);
  let weightsSum = 0;

  // function

  for (let i = 0; i < existingCultures.length; i++) {
    const culture = existingCultures[i];
    obj.pop[culture] = obj.pop[culture] || 0;

    const curPerc = obj.pop[culture] / Math.max(obj.totPop, 1);

    let weight = curPerc;
    if (useHistorical) {
      const histPerc = (obj.hist[culture] || 0) / obj.totHist;
      weight = curPerc * (1 - POPV2_HISTORICAL_MOMENTUM) +
        histPerc * POPV2_HISTORICAL_MOMENTUM;
    }

    weightsArr[i] = weight;
    weightsSum += weight;
  }

  if (weightsSum === 0) weightsSum = 1;

  let newTotPop = 0;

  for (let i = 0; i < existingCultures.length; i++) {
    const culture = existingCultures[i];

    const percUsed = useHistorical ? weightsArr[i] / weightsSum : weightsArr[i];

    const partial = Math.max(
      Math.round(reducedDelta * percUsed),
      -obj.pop[culture]
    );

    obj.pop[culture] += partial;

    if (ownerCul === culture) {
      obj.pop[culture] += reservedPartial;
    }

    newTotPop += obj.pop[culture];
  }

  obj.totPop = newTotPop;
}

function popv2_get_totpop(row, col) {
  return popv2?.map?.[row]?.[col]?.totPop || 0;
}
function popv2_get_tothist(row, col) {
  return popv2?.map?.[row]?.[col]?.totHist || 0;
}

POPV2_FLAG_USE_UNI_CULTURE = false;

function popv2_culture_get_or_create_civ(civName) {
  const civ = civs[civName];
  if (!civ.culture) {
    civ.culture = POPV2_FLAG_USE_UNI_CULTURE ? 'DefaultCulture' : civName;

    popv2_culture_reinit_culture(civ.culture);
  }

  return civ.culture;
}

function popv2_culture_get_culture_obj(civName) {
  const civ = civs[civName];

  if (!popv2.cultures[civ.culture]) {
    popv2_culture_get_or_create_civ(civName);
  }

  return popv2.cultures[civ.culture];
}

function popv2_culture_reinit_culture(name, mods={}) {
  const civ = civs[name];
  const color = popv2?.cultures?.[name]?.color || civ?.color || mods.color || '#5e5e5e';
  const colorRGB = cssColorToRGB(color);

  const maxChannel = Math.max(colorRGB.R, colorRGB.G, colorRGB.B);
  const threshold = 255 * 0.75;

  if (maxChannel > threshold) {
    // Clamp the intensity so it shows on white canvas
    colorRGB.R = Math.round(colorRGB.R * threshold / maxChannel);
    colorRGB.G = Math.round(colorRGB.G * threshold / maxChannel);
    colorRGB.B = Math.round(colorRGB.B * threshold / maxChannel);
  }

  return popv2.cultures[name] = Object.assign({
    fontColor: civ?.fontColor || idealTextColor(color),
    color,
    colorRGB,
    name
  }, mods);
}

function poptable_hook(self) {
  self._poptable = {}; // <- dont change this
  self._poptable_tot = 0;
}

function poptable_add_from_pt(self, row, col) {
  const tile = popv2?.map?.[row]?.[col];
  if (tile) {
    poptable_add(self, tile.pop);
  }
}
function poptable_add_hist_from_pt(self, row, col) {
  const tile = popv2?.map?.[row]?.[col];
  if (tile) {
    poptable_add(self, tile.hist);
  }
}

function poptable_get_popObj_from_poptable(self) {
  return self._poptable;
}
function poptable_add(self, popObj) {
  for (const key in popObj) {
    self._poptable[key] = (self._poptable[key] || 0) + popObj[key];
    self._poptable_tot += popObj[key];
  }
}

function poptable_gen_table(self) {
  const total = self._poptable_tot;
  return Object.entries(self._poptable)
    .map(([culture, pop]) => ({
      culture,
      population: pop,
      percent: pop / total
    }));
}

function poptable_debug(self) {
  console.table(
    poptable_gen_table(self)
      .map(x => { x.percent = (x.percent * 100).toFixed(2) + '%'; return x; })
      .sort((a, b) => b.population - a.population)
  );
}

function poptable_gen_Tablesort(self, $element, {showButton=false}={}) {
  if (!$element.data('tableSort'))
    $element.data('tableSort', new Tablesort($element[0]));

  const tableSort = $element.data('tableSort');

  const $table = $element.find('tbody');
  $table.html('');
  poptable_gen_table(self)
    .map(x => { x.percent = (x.percent * 100).toFixed(2) + '%'; return x; })
    .sort((a, b) => b.population - a.population)
    .forEach(function ({culture, population, percent}) {
      const cultureObj = popv2_culture_reinit_culture(culture);
      let tr = $('<tr/>');
      tr.css('background', cultureObj.color).css('color', cultureObj.fontColor);
      tr.append(`<td>${culture}</td>`);
      tr.append(`<td>${population}</td>`);
      tr.append(`<td>${percent}</td>`);
      if (showButton) {
        tr.append(`<td>
          <button onclick="gp=!gp;gp_culture='${culture}';drawCanvas()">Show</button>
        </td>`);
      }
      $table.append(tr)
    });

  tableSort.refresh();
}

  // getResultantColor(max) {
  //   max = Math.max(1, max || this.total);

  //   return mixColors(Object.entries(this.pop).map(([key, val]) => {
  //     const culture = popv2_culture_reinit_culture(key);
  //     return [
  //       culture.colorRGB,
  //       val / max
  //     ];
  //   }));
  // }