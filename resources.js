// ####### tile-based development #######
//
// terrain info is stored as a property of data array (map load/save doesn't affect, reload every game)
//
// 4dof all sea tile -> ocean
// 4dof next to any ocean -> beach
// 4 dof next to beach -> beach front (high econ modifier)
// 8 dof next to land -> field (high pop modifier)

function _ter_get(row, col, prop) {
  data._ter = data._ter || {};
  return data._ter[row + ',' + col + '.' + prop];
}

function _ter_set(row, col, prop, dat) {
  data._ter = data._ter || {};
  data._ter[row + ',' + col + '.' + prop] = dat;
}

function _ter_gen() {
  console.time("_ter_gen: map must have changed");
  popv2 = null;
  popv2_init();

  const funcs = [
    [_res_econ_mod_raw, 'e', 2, 3, 2, 1, 1],
    [_res_pop_mod_raw, 'p', 5, 8, 3, 2.5, 1.3]
  ];

  for (const [func, prop, r, p, R, climateFactor, c] of funcs) {
    const raw = data.map((r, row) => r.map((c, col) => c && func(row, col)));

    raw.forEach((row, i) => row.forEach((cell, j) => {
      if (cell === null) return;

      let divisor = 0;
      let sumOfSquares = 0;
      for (let x = Math.max(0, i - r); x <= Math.min(data.length - 1, i + r); x++) {
        for (let y = Math.max(0, j - r); y <= Math.min(row.length - 1, j + r); y++) {
          if (raw[x][y] !== null) {
            const dist = Math.sqrt((x - i)**2 + (y - j)**2);
            sumOfSquares += (raw[x][y] ** p) / (dist + 1);
            divisor += 1 / (dist + 1);
          }
        }
      }

      let mod = Math.pow(sumOfSquares / divisor, 1 / R);

      // due to climate (80%: -4%, 90%: -13%, 100%: -40%)
      if (mod > 1)
        mod *= 1 - Math.pow(1 - r / data.length - 0.1, 9) * climateFactor;
      else
        mod -= Math.pow(1 - r / data.length - 0.1, 9) * climateFactor;

      mod *= c;
      mod = Math.max(0.08, mod);

      _ter_set(i, j, prop, mod);
    }));
  }
  console.timeEnd("_ter_gen");
}

function _res_econ_mod_raw(row, col) {
  let mod = 0.7;
  let sea = _res_count_sea(row, col);

  if (_res_is_field(row, col))
    mod += 0.3;

  if (_res_is_beachfront(row, col))
    mod += 1;

  mod = mod + sea * sea / 8 * 0.5; // up to 3.1

  return mod;
}

function _res_pop_mod_raw(row, col) {
  let mod = 0.65;

  let fields = _res_count_field(row, col);

  if (fields >= 8)
    mod += 0.55;

  if (_res_is_beachfront(row, col))
    mod += 0.1;

  mod = mod + fields * fields / 8 / 8 * 0.3; // up to 1.5 with field

  // due to climate (80%: -4%, 90%: -13%, 100%: -40%)
  if (mod > 1)
    mod *= 1 - Math.pow(1 - row / data.length - 0.1, 9);
  else
    mod -= Math.pow(1 - row / data.length - 0.1, 9);

  return mod;
}


function _res_is_ocean(row, col) {
  // check is sea tile
  if (!data[row] || data[row][col] !== null)
    return false;

  let sea = 0;
  getNeighbors(row, col, (c) => {
    if (c === null)
      sea += 1;
  }, true);

  return sea >= 4;
}

function _res_is_beach(row, col) {
  // check is sea tile
  if (!data[row] || data[row][col] !== null)
    return false;

  let ocean = 0;
  getNeighbors(row, col, (_, _r, _c) => {
    if (_res_is_ocean(_r, _c))
      ocean += 1;
  }, true);

  return ocean;
}

function _res_is_beachfront(row, col) {
  // check is land tile
  if (!data[row] || !data[row][col])
    return false;

  let beach = 0;
  getNeighbors(row, col, (_, _r, _c) => {
    if (_res_is_beach(_r, _c))
      beach += 1;
  }, true);

  return beach;
}

// uses 8 dof to count # of land
function _res_count_field(row, col) {
  // check is land tile
  if (!data[row] || !data[row][col])
    return 0;

  let land = 0;
  // 8 dof
  getNeighbors8(row, col, () => {
    land += 1;
  }, false); // get only land

  return land;
}

// uses 8 dof to count # of sea
function _res_count_sea(row, col) {
  // check is land tile
  if (!data[row] || !data[row][col])
    return 0;

  let sea = 0;
  // 8 dof
  getNeighbors8(row, col, (c) => {
    if (c === null)
      sea += 1;
  }, true);

  return sea;
}

function _res_is_field(row, col) {
  return _res_count_field(row, col) >= 8;
}

function res_econ_mod(row, col) {
  const cache = _ter_get(row, col, 'e');

  if (!cache) {
    _ter_gen();
    return _ter_get(row, col, 'e');
  }

  return cache;
}

function res_pop_mod(row, col) {
  const cache = _ter_get(row, col, 'p');

  if (!cache) {
    _ter_gen();
    return _ter_get(row, col, 'p');
  }

  return cache;
}
