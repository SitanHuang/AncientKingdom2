function _cell_nearest_color(row, col) {
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

  if (mostProminentColor)
    return { color: mostProminentColor, type: types.land };
  else
    return { color: null, type: null };
}

const [map_patch_mode_start, map_patch_mode_end] = (() => {
  let history = '';

  function map_patch_mode_start() {
    history += '\n';

    buyClick = (row, col) => {
      let cell = data[row][col];

      if (cell === null) { // set to land
        data[row][col] = _cell_nearest_color(row, col);
        history += `data[${row}][${col}] = _cell_nearest_color(${row}, ${col});\n`;
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

function map_patch_wholemap() {
  let n = [], l = [];
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      (data[r][c] === null ? n : l).push(r.toString(36) + "." + c.toString(36));
    }
  }

  const snippet =
    "(()=>{var d=window.data,b=s=>parseInt(s,36),x=(t)=>t?t.split(','):[]," +
    "n=x(\"" + n.join(",") + "\"),l=x(\"" + l.join(",") + "\"),i,t,r,c;" +
    "for(i=0;i<n.length;i++){t=n[i].split('.');r=b(t[0]);c=b(t[1]);d[r][c]=null;}" +
    "for(i=0;i<l.length;i++){t=l[i].split('.');r=b(t[0]);c=b(t[1]);d[r][c]=_cell_nearest_color(r,c);}" +
    "if(typeof drawCanvas==='function')drawCanvas();})();";

  function copy_on_next_activation(text) {
    const h = async () => {
      document.removeEventListener('click', h, true);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          alert("Patch code copied to clipboard.");
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand("copy");
          ta.remove();
          alert("Patch code copied (fallback).");
        }
      } catch (e) {
        console.error("Copy failed:", e);
        alert("Copy failed:", e);
      }
    };
    document.addEventListener("click", h, { once: true, capture: true });
    alert("Patch ready. Click anywhere on the page to copy.");
  }


  copy_on_next_activation(snippet);
  return snippet;
}