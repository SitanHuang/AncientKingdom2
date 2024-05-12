function regions_taxEff(civ, civName, row, col) {
  const parts = regions_genCountryParts(civ, civName);
  const part = regions_getPart(civ, civName, row, col);

  if (!part) // new territory not yet updated
    return 0.1;

  let eff = part.capital == 1 ? 1 : (Math.max(Math.min(part.pop / civ.pop, 1), 0.15) || 0); // region supply factor

  eff *= Math.min(1, Math.sqrt(res_pop_mod(row, col) * res_econ_mod(row, col))); // terrain factor

  eff *= 1 - (civ.rchance || 0); // rebel factor
  eff *= Math.max(0.65, civ.gov?.cohesion || 0); // gov legitmacy factor

  const hub = parts.supplyCenter;

  // radial factor from capital
  const r = Math.sqrt(
    Math.pow(hub[0] - row, 2) +
    Math.pow(hub[1] - col, 2)
  );


  eff *= (Math.pow(0.95, r * 0.7 - 2) + 0.2) || 1;

  return eff;
}

function regions_defBonus(civ, civName, row, col) {
  let def = 1;

  def *= Math.regions_taxEff(civ, civName, row, col);

  def *= Math.max(1, 2 - res_pop_mod(row, col));

  def *= Math.max(1, data[row][col]?.pop / 250000) || 1;

  return def;
}

function regions_getPart(civ, civName, row, col) {
  const parts = regions_genCountryParts(civ, civName);
  return parts.parts[parts.map[row + ':' + col]];
}

// allows future expansion into regions with independent policies by limiting
// sizes (user-controlled)
// --> Update only every year
function regions_genCountryParts(civ, civName) {
  if (civ._parts && !(civ._parts.lastUpdated >= 4))
    return civ._parts;

  let civProvs = {};

  let supplyCenter = null;

  // if birth place is owned, then birth place region is capital region
  const useBirth = civ.birth && data[civ.birth[0]][civ.birth[1]].color == civName;

  // find all provinces of a civ
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[0].length; c++) {
      if (data[r][c]?.color == civName) {
        civProvs[r + ':' + c] = -1; // unvisited
      }
    }
  }

  // flood fill parts
  function parseKey(key) {
    return key.split(':').map(Number);
  }

  function getAdjacentTiles(r, c) {
    return [
      `${r - 1}:${c}`, `${r + 1}:${c}`,
      `${r}:${c - 1}`, `${r}:${c + 1}`,
      // use 8x for performance and minimal regions
      `${r - 1}:${c - 1}`, `${r + 1}:${c + 1}`,
      `${r + 1}:${c - 1}`, `${r - 1}:${c + 1}`,
    ];
  }

  function floodFill(startKey, civProvs, regionID) {
    const stack = [startKey];
    const region = [];
    let capital = false;
    let popTot = 0;
    let econTot = 0;

    let largestPop = [0, 0, -1];

    while (stack.length > 0) {
      const currentKey = stack.pop();
      if (civProvs[currentKey] !== -1) // visited or doesn't exist
        continue;

      const parsedKey = parseKey(currentKey);

      civProvs[currentKey] = regionID; // mark as visited & use for region mapping
      region.push(parsedKey);

      const tile = data[parsedKey[0]][parsedKey[1]];

      if ((tile.pop || 0) > largestPop[2])
        largestPop = [parsedKey[0], parsedKey[1], tile.pop];

      if (tile.type) {
        popTot += tile.pop || 0;
        econTot += tile._econ || 0;
        if (useBirth ?
          civ.birth[0] == parsedKey[0] && civ.birth[1] == parsedKey[1] :
          tile.type.draw.toString() == types.capital.draw.toString()) {
            capital = true;
          supplyCenter = parsedKey;
        }
      }

      getAdjacentTiles(...parsedKey).forEach(adjKey => {
        if (civProvs[adjKey] === -1) // unvisited & exists;
          stack.push(adjKey);
      });
    }
    return {
      provs: region,
      capital: capital,
      size: region.length,
      pop: popTot,
      econ: econTot,
      largestProv: largestPop
    };
  }


  const parts = [];

  let IDs = 0;

  let capitalFound = false;

  let largestPop = [0, 0];

  for (let key in civProvs) {
    if (civProvs[key] == -1) {
      let region = floodFill(key, civProvs, IDs++);
      parts.push(region);
      capitalFound = capitalFound || region.capital;
      if (region.pop > largestPop[1])
        largestPop = [parts.length - 1, region.pop];
    }
  }

  if (!capitalFound) {
    parts[largestPop[0]].capital = true;

    if (!supplyCenter) {
      supplyCenter = parts[largestPop[0]].largestProv.slice(0, 2);
    }
  }

  return civ._parts = {
    map: civProvs,
    parts: parts,
    lastUpdated: 0,
    supplyCenter: supplyCenter,
  };
}