import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ACEP_PALETTE,
  colorDistanceSquared,
  findClosestColor,
  findClosestColorIndex,
  quantizePixel,
} from '../src/processing/quantize.js';

describe('quantize', () => {
  describe('ACEP_PALETTE', () => {
    it('should have 6 colors', () => {
      assert.strictEqual(ACEP_PALETTE.length, 6);
    });

    it('should include black, white, red, green, blue, yellow', () => {
      assert.deepStrictEqual(ACEP_PALETTE[0], [0, 0, 0]);       // Black
      assert.deepStrictEqual(ACEP_PALETTE[1], [255, 255, 255]); // White
      assert.deepStrictEqual(ACEP_PALETTE[2], [0, 255, 0]);     // Green
      assert.deepStrictEqual(ACEP_PALETTE[3], [0, 0, 255]);     // Blue
      assert.deepStrictEqual(ACEP_PALETTE[4], [255, 0, 0]);     // Red
      assert.deepStrictEqual(ACEP_PALETTE[5], [255, 255, 0]);   // Yellow
    });
  });

  describe('colorDistanceSquared', () => {
    it('should return 0 for identical colors', () => {
      assert.strictEqual(colorDistanceSquared([100, 100, 100], [100, 100, 100]), 0);
    });

    it('should calculate correct squared distance', () => {
      // Distance from black to white: sqrt(255^2 + 255^2 + 255^2) = sqrt(195075)
      // Squared: 195075
      assert.strictEqual(
        colorDistanceSquared([0, 0, 0], [255, 255, 255]),
        255 * 255 * 3
      );
    });

    it('should be symmetric', () => {
      const d1 = colorDistanceSquared([10, 20, 30], [100, 150, 200]);
      const d2 = colorDistanceSquared([100, 150, 200], [10, 20, 30]);
      assert.strictEqual(d1, d2);
    });
  });

  describe('findClosestColor', () => {
    it('should return exact palette colors unchanged', () => {
      assert.deepStrictEqual(findClosestColor(0, 0, 0), [0, 0, 0]);
      assert.deepStrictEqual(findClosestColor(255, 255, 255), [255, 255, 255]);
      assert.deepStrictEqual(findClosestColor(255, 0, 0), [255, 0, 0]);
      assert.deepStrictEqual(findClosestColor(0, 255, 0), [0, 255, 0]);
      assert.deepStrictEqual(findClosestColor(0, 0, 255), [0, 0, 255]);
      assert.deepStrictEqual(findClosestColor(255, 255, 0), [255, 255, 0]);
    });

    it('should map dark gray to black', () => {
      assert.deepStrictEqual(findClosestColor(30, 30, 30), [0, 0, 0]);
    });

    it('should map light gray to white', () => {
      assert.deepStrictEqual(findClosestColor(220, 220, 220), [255, 255, 255]);
    });

    it('should map orange-ish colors to red or yellow', () => {
      // Pure orange (255, 128, 0) - closer to red or yellow?
      const orange = findClosestColor(255, 128, 0);
      // Should be red or yellow (not green, blue, black, or white)
      const isRedOrYellow =
        (orange[0] === 255 && orange[1] === 0 && orange[2] === 0) ||
        (orange[0] === 255 && orange[1] === 255 && orange[2] === 0);
      assert.ok(isRedOrYellow, `Expected red or yellow, got [${orange}]`);
    });

    it('should map cyan to white, green, or blue (equidistant in RGB)', () => {
      // Cyan (0, 255, 255) in the 6-color ACeP palette:
      // - Distance to white (255,255,255): 255^2 + 0 + 0 = 65025
      // - Distance to green (0,255,0): 0 + 0 + 255^2 = 65025
      // - Distance to blue (0,0,255): 0 + 255^2 + 0 = 65025
      // They're equidistant! Algorithm picks first match (white)
      const cyan = findClosestColor(0, 255, 255);
      const isValid =
        (cyan[0] === 255 && cyan[1] === 255 && cyan[2] === 255) || // White
        (cyan[0] === 0 && cyan[1] === 255 && cyan[2] === 0) ||     // Green
        (cyan[0] === 0 && cyan[1] === 0 && cyan[2] === 255);       // Blue
      assert.ok(isValid, `Expected white, green, or blue, got [${cyan}]`);
    });
  });

  describe('findClosestColorIndex', () => {
    it('should return correct indices for palette colors', () => {
      assert.strictEqual(findClosestColorIndex(0, 0, 0), 0);       // Black
      assert.strictEqual(findClosestColorIndex(255, 255, 255), 1); // White
      assert.strictEqual(findClosestColorIndex(0, 255, 0), 2);     // Green
      assert.strictEqual(findClosestColorIndex(0, 0, 255), 3);     // Blue
      assert.strictEqual(findClosestColorIndex(255, 0, 0), 4);     // Red
      assert.strictEqual(findClosestColorIndex(255, 255, 0), 5);   // Yellow
    });
  });

  describe('quantizePixel', () => {
    it('should return color and zero error for palette colors', () => {
      const result = quantizePixel(255, 0, 0);
      assert.deepStrictEqual(result.color, [255, 0, 0]);
      assert.deepStrictEqual(result.error, [0, 0, 0]);
    });

    it('should return correct error for non-palette colors', () => {
      // Gray (128, 128, 128) will likely map to black or white
      const result = quantizePixel(128, 128, 128);
      const [r, g, b] = result.color;
      assert.deepStrictEqual(result.error, [128 - r, 128 - g, 128 - b]);
    });

    it('should always return a valid palette color', () => {
      // Test various colors
      const testColors = [
        [50, 100, 150],
        [200, 100, 50],
        [100, 200, 100],
        [150, 150, 150],
      ];

      for (const [r, g, b] of testColors) {
        const result = quantizePixel(r, g, b);
        const isPaletteColor = ACEP_PALETTE.some(
          (pc) => pc[0] === result.color[0] && pc[1] === result.color[1] && pc[2] === result.color[2]
        );
        assert.ok(isPaletteColor, `[${result.color}] is not a palette color`);
      }
    });
  });
});
