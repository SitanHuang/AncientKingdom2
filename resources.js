// ####### tile-based development #######
//
// terrain info is stored as a property of data array (map load/save doesn't affect, reload every game)
//
// 4dof all sea tile -> ocean
// 4dof next to any ocean -> beach
// 4 dof next to beach -> beach front (high econ modifier)
// 8 dof next to land -> field (high pop modifier)

function ter_get(row, col, prop) {
  data._ter = data._ter || {};
  return data._ter[row + ',' + col + '.' + prop];
}

function ter_set(row, col, prop, dat) {
  data._ter = data._ter || {};
  data._ter[row + ',' + col + '.' + prop] = dat;
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
  let cache = ter_get(row, col, 'em');

  if (cache) return cache;

  let mod = 0.7;
  let sea = _res_count_sea(row, col);

  if (_res_is_field(row, col))
    mod += 0.3;

  if (_res_is_beachfront(row, col))
    mod += 1;

  mod = mod + sea * sea / 8 * 0.5; // up to 3.1

  ter_set(row, col, 'em', mod);
  return mod;
}

function res_pop_mod(row, col) {
  let cache = ter_get(row, col, 'pm');

  if (cache) return cache;

  let mod = 0.65;

  let fields = _res_count_field(row, col);

  // if (_res_is_field(row, col))
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

  ter_set(row, col, 'pm', mod);
  return mod;
}
