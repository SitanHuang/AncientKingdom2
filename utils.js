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

/**
 * Consider a white canvas. Multiple colors are painted onto this white canvas.
 * The COLOR of the result is meshed using softmax of the colors' associated
 * weights. The INTENSITY of the result is normalized using the intensityNorm
 * function, and clamped to [minIntensity, maxIntensity].
 *
 * softMaxWeight increases the effect of the largest input component having
 * disproportionally larger probabilities relative to the other colors.
 *
 * Note that the sum of colors' associated weights are [0, 1]
 */
function mixColors(colors, {
  minIntensity=0,
  maxIntensity=1,
  softMaxWeight=2,
  intensityNorm = (x, B = 3.4, C = 0) =>
    (2 / Math.PI) * Math.atan(x * B + C) + 1 - (2 / Math.PI) * Math.atan(B + C)
} = {}) {
  let totalPerc = 0;
  for (const [, perc] of colors) {
    totalPerc += perc;
  }

  // Compute normalized intensity and clamp
  let intensity = intensityNorm(totalPerc);
  intensity = Math.min(maxIntensity, Math.max(minIntensity, intensity));

  // No colors = pure white
  if (totalPerc === 0) {
    return { R: 255, G: 255, B: 255 };
  }

  // Normalize per-color weights
  const normPercs = colors.map(([, perc]) => perc / totalPerc);

  // Softmax over normalized weights
  const exps = normPercs.map(p => Math.exp(p * softMaxWeight));
  const expSum = exps.reduce((sum, e) => sum + e, 0);
  const softWeights = exps.map(e => e / expSum);

  // Compute the pure-color mix
  let rCol = 0, gCol = 0, bCol = 0;
  for (let i = 0; i < colors.length; i++) {
    const [color] = colors[i];
    const w = softWeights[i];
    rCol += color.R * w;
    gCol += color.G * w;
    bCol += color.B * w;
  }

  // Blend with white based on intensity
  let r = rCol * intensity + 255 * (1 - intensity);
  let g = gCol * intensity + 255 * (1 - intensity);
  let b = bCol * intensity + 255 * (1 - intensity);

  // Round and clamp
  r = Math.round(Math.min(255, Math.max(0, r)));
  g = Math.round(Math.min(255, Math.max(0, g)));
  b = Math.round(Math.min(255, Math.max(0, b)));

  return { R: r, G: g, B: b };
}