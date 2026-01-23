/**
 * Color quantization for the 6-color ACeP e-paper palette.
 *
 * The Seeed Studio reTerminal E1002 uses a 6-color ACeP display:
 * Black, White, Red, Green, Blue, Yellow
 */

// ACeP 6-color palette (RGB values)
export const ACEP_PALETTE = [
  [0, 0, 0],       // Black
  [255, 255, 255], // White
  [0, 255, 0],     // Green
  [0, 0, 255],     // Blue
  [255, 0, 0],     // Red
  [255, 255, 0],   // Yellow
];

// Palette color names for debugging
export const PALETTE_NAMES = ['Black', 'White', 'Green', 'Blue', 'Red', 'Yellow'];

/**
 * Calculate squared Euclidean distance between two RGB colors.
 * Using squared distance avoids expensive sqrt operations.
 *
 * @param {number[]} c1 - First color [r, g, b]
 * @param {number[]} c2 - Second color [r, g, b]
 * @returns {number} Squared distance
 */
export function colorDistanceSquared(c1, c2) {
  const dr = c1[0] - c2[0];
  const dg = c1[1] - c2[1];
  const db = c1[2] - c2[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Find the closest palette color to a given RGB color.
 *
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number[]} Closest palette color [r, g, b]
 */
export function findClosestColor(r, g, b) {
  const color = [r, g, b];
  let minDist = Infinity;
  let closest = ACEP_PALETTE[0];

  for (const paletteColor of ACEP_PALETTE) {
    const dist = colorDistanceSquared(color, paletteColor);
    if (dist < minDist) {
      minDist = dist;
      closest = paletteColor;
    }
  }

  return closest;
}

/**
 * Find the index of the closest palette color.
 *
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} Index in ACEP_PALETTE
 */
export function findClosestColorIndex(r, g, b) {
  const color = [r, g, b];
  let minDist = Infinity;
  let closestIndex = 0;

  for (let i = 0; i < ACEP_PALETTE.length; i++) {
    const dist = colorDistanceSquared(color, ACEP_PALETTE[i]);
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }

  return closestIndex;
}

/**
 * Quantize a single pixel to the closest palette color.
 * Returns the quantization error for use in dithering.
 *
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {Object} { color: [r,g,b], error: [er,eg,eb] }
 */
export function quantizePixel(r, g, b) {
  const closest = findClosestColor(r, g, b);
  return {
    color: closest,
    error: [r - closest[0], g - closest[1], b - closest[2]],
  };
}

export default {
  ACEP_PALETTE,
  PALETTE_NAMES,
  colorDistanceSquared,
  findClosestColor,
  findClosestColorIndex,
  quantizePixel,
};
