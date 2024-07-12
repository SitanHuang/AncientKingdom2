
const [map_patch_mode_start, map_patch_mode_end] = (() => {
  let history;

  function _nearest_color(row, col) {
    const colorCount = {};

    getNeighbors(row, col, (cell) => {
      if (cell && cell.color) {
        if (!colorCount[cell.color]) {
          colorCount[cell.color] = 0;
        }
        colorCount[cell.color]++;
      }
    });

    let mostProminentColor = null;
    let maxCount = 0;
    for (let color in colorCount) {
      if (colorCount[color] > maxCount) {
        maxCount = colorCount[color];
        mostProminentColor = color;
      }
    }

    return mostProminentColor;
  }

  function map_patch_mode_start() {
    history = _nearest_color.toString() + '\n';

    buyClick = (row, col) => {
      let cell = data[row][col];

      if (cell === null) { // set to land
        data[row][col] = { color: _nearest_color(row, col), type: types.land };
        history += `data[${row}][${col}] = { color: _nearest_color(${row}, ${col}), type: types.land };\n`;
      } else {
        data[row][col] = null;
        history += `data[${row}][${col}] = null;\n`;
      }

      drawCanvas();
    };
  }
  function map_patch_mode_end() {
    history += 'drawCanvas()';

    buyClick = null;
    console.log(history);
    return history;
  }

  return [map_patch_mode_start, map_patch_mode_end];
})();
