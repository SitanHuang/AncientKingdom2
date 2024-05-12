/**
 * Generates a color from a continuous input scale based on defined color ticks.
 * @param {number} value - The input value to map to a color.
 * @param {Array} ticks - Sorted array of objects containing value and corresponding color in hex.
 * @returns {string} - The hexadecimal color code for the input value.
 */
function getColor(value, ticks) {
  if (value <= ticks[0].value) {
    return ticks[0].color; // Return first color if value is less than the first tick
  }

  for (let i = 1; i < ticks.length; i++) {
    if (value <= ticks[i].value) {
      const range = ticks[i].value - ticks[i - 1].value;
      const rangePct = (value - ticks[i - 1].value) / range;
      return interpolateColor(ticks[i - 1].color, ticks[i].color, rangePct);
    }
  }

  return ticks[ticks.length - 1].color; // Return last color if value exceeds last tick
}

/**
 * Interpolates between two hexadecimal colors.
 * @param {string} color1 - Start color in hex format.
 * @param {string} color2 - End color in hex format.
 * @param {number} fraction - Fraction between 0 and 1 representing interpolation point.
 * @returns {string} - Interpolated hexadecimal color.
 */
function interpolateColor(color1, color2, fraction) {
  const color1Rgb = hexToRgb(color1);
  const color2Rgb = hexToRgb(color2);

  const r = Math.round(color1Rgb.r + (color2Rgb.r - color1Rgb.r) * fraction);
  const g = Math.round(color1Rgb.g + (color2Rgb.g - color1Rgb.g) * fraction);
  const b = Math.round(color1Rgb.b + (color2Rgb.b - color1Rgb.b) * fraction);

  return rgbToHex(r, g, b);
}

/**
 * Converts a hexadecimal color to an RGB object.
 * @param {string} hex - The hex color code.
 * @returns {object} - The RGB representation.
 */
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

/**
 * Converts RGB values to a hexadecimal color.
 * @param {number} r - Red value.
 * @param {number} g - Green value.
 * @param {number} b - Blue value.
 * @returns {string} - The hex color code.
 */
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function redYellowBlueScale(val, midPt=0.7) {
  const colorTicks = [
    { value: 0, color: '#FF0000' },   // Red
    { value: midPt, color: '#FFFF00' }, // Yellow
    { value: 1, color: '#0000FF' },    // Blue
    { value: 1.5, color: '#FF00FF' },    // Blue
  ];
  return getColor(val, colorTicks);
}