function rollingAverage(pastData, newElement, len=4) {
  pastData.push(newElement);
  if (pastData.length > len) {
    pastData.shift();
  }
  const sum = pastData.reduce((acc, val) => acc + val, 0);
  const avg = sum / pastData.length;
  return avg;
}

function size(arr) {
  if (!Array.isArray(arr)) {
    throw new Error("Input must be an array");
  }

  let dimensions = [];
  while (Array.isArray(arr)) {
    dimensions.push(arr.length);
    arr = arr[0];
  }
  return dimensions;
}

function arrayDeepEqual(arr1, arr2) {
  if (arr1 === arr2) return true;
  if (!Array.isArray(arr1) || !Array.isArray(arr2)) return false;
  if (arr1.length !== arr2.length) return false;

  for (let i = 0; i < arr1.length; i++) {
    if (Array.isArray(arr1[i]) && Array.isArray(arr2[i])) {
      if (!deepEqual(arr1[i], arr2[i])) return false;
    } else if (arr1[i] !== arr2[i]) {
      return false;
    }
  }
  return true;
}

function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}
function idealTextColor(bgColor) {

  var nThreshold = 105;
  var components = typeof bgColor.R == 'number' ? bgColor : getRGBComponents(bgColor);
  var bgDelta = (components.R * 0.299) + (components.G * 0.587) + (components.B * 0.114);

  return ((255 - bgDelta) < nThreshold) ? "#000000" : "#ffffff";
}

function cssColorToRGB(color) {
  const canvas = cssColorToRGB._canvas || document.createElement('canvas');
  const ctx = cssColorToRGB._ctx || canvas.getContext('2d');
  cssColorToRGB._canvas = canvas;
  cssColorToRGB._ctx = ctx;

  // Assign the fillStyle; the browser will parse/normalize the color
  ctx.fillStyle = color;
  // If invalid, fillStyle remains unchanged or set to '#000000'
  const parsed = ctx.fillStyle;

  const hex = parsed.slice(1);
  const bigint = parseInt(hex, 16);
  const R = (bigint >> 16) & 255;
  const G = (bigint >> 8) & 255;
  const B = bigint & 255;

  return { R, G, B };
}

function getRGBComponents(color) {

  var r = color.substring(1, 3);
  var g = color.substring(3, 5);
  var b = color.substring(5, 7);

  return {
    R: parseInt(r, 16),
    G: parseInt(g, 16),
    B: parseInt(b, 16)
  };
}

function mixColors(colors, {
  baseColor=250,
  scale = 0.55,
} = {}) {
  let totalPerc = 0;
  for (const [_, perc] of colors) {
    totalPerc += perc;
  }
  const whitePerc = 1 - totalPerc;

  let r = 0, g = 0, b = 0;
  for (const [color, perc] of colors) {
    r += color.R * perc;
    g += color.G * perc;
    b += color.B * perc;
  }
  r += 255 * whitePerc;
  g += 255 * whitePerc;
  b += 255 * whitePerc;

  r = Math.round(r);
  g = Math.round(g);
  b = Math.round(b);

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  const toHex = (c) => {
    const hex = c.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return { R: r, G: g, B: b };
}