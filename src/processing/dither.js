import sharp from 'sharp';
import { findClosestColor, ACEP_PALETTE } from './quantize.js';
import logger from '../utils/logger.js';

/**
 * Floyd-Steinberg dithering implementation for the 6-color ACeP palette.
 *
 * Floyd-Steinberg distributes quantization error to neighboring pixels:
 *
 *        X   7/16
 *  3/16 5/16 1/16
 *
 * Where X is the current pixel being processed.
 */

/**
 * Clamp a value to the 0-255 range.
 */
function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Apply Floyd-Steinberg dithering to an image buffer.
 *
 * @param {Buffer} inputBuffer - Input image buffer (from sharp)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Promise<Buffer>} Dithered image as PNG buffer
 */
export async function applyFloydSteinberg(inputBuffer, width, height) {
  logger.debug('Applying Floyd-Steinberg dithering', { width, height });

  // Get raw RGB pixel data
  const { data, info } = await sharp(inputBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixels = new Float32Array(data.length);

  // Copy to float array for error accumulation
  for (let i = 0; i < data.length; i++) {
    pixels[i] = data[i];
  }

  // Process each pixel left-to-right, top-to-bottom
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;

      // Get current pixel color (may have accumulated error)
      const oldR = pixels[idx];
      const oldG = pixels[idx + 1];
      const oldB = pixels[idx + 2];

      // Find closest palette color
      const newColor = findClosestColor(
        clamp(oldR),
        clamp(oldG),
        clamp(oldB)
      );

      // Calculate quantization error
      const errR = oldR - newColor[0];
      const errG = oldG - newColor[1];
      const errB = oldB - newColor[2];

      // Set pixel to palette color
      pixels[idx] = newColor[0];
      pixels[idx + 1] = newColor[1];
      pixels[idx + 2] = newColor[2];

      // Distribute error to neighboring pixels using Floyd-Steinberg coefficients
      // Right neighbor: 7/16
      if (x + 1 < width) {
        const rightIdx = idx + channels;
        pixels[rightIdx] += errR * 7 / 16;
        pixels[rightIdx + 1] += errG * 7 / 16;
        pixels[rightIdx + 2] += errB * 7 / 16;
      }

      // Bottom-left neighbor: 3/16
      if (y + 1 < height && x > 0) {
        const blIdx = ((y + 1) * width + (x - 1)) * channels;
        pixels[blIdx] += errR * 3 / 16;
        pixels[blIdx + 1] += errG * 3 / 16;
        pixels[blIdx + 2] += errB * 3 / 16;
      }

      // Bottom neighbor: 5/16
      if (y + 1 < height) {
        const bottomIdx = ((y + 1) * width + x) * channels;
        pixels[bottomIdx] += errR * 5 / 16;
        pixels[bottomIdx + 1] += errG * 5 / 16;
        pixels[bottomIdx + 2] += errB * 5 / 16;
      }

      // Bottom-right neighbor: 1/16
      if (y + 1 < height && x + 1 < width) {
        const brIdx = ((y + 1) * width + (x + 1)) * channels;
        pixels[brIdx] += errR * 1 / 16;
        pixels[brIdx + 1] += errG * 1 / 16;
        pixels[brIdx + 2] += errB * 1 / 16;
      }
    }
  }

  // Convert back to Uint8Array
  const outputData = new Uint8Array(width * height * channels);
  for (let i = 0; i < pixels.length; i++) {
    outputData[i] = clamp(pixels[i]);
  }

  // Create output image with sharp
  const outputBuffer = await sharp(outputData, {
    raw: {
      width,
      height,
      channels,
    },
  })
    .png()
    .toBuffer();

  logger.debug('Dithering complete');
  return outputBuffer;
}

/**
 * Simple quantization without dithering (for raw mode).
 * Maps each pixel to the closest palette color.
 *
 * @param {Buffer} inputBuffer - Input image buffer
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Promise<Buffer>} Quantized image as PNG buffer
 */
export async function quantizeOnly(inputBuffer, width, height) {
  logger.debug('Quantizing without dithering', { width, height });

  const { data, info } = await sharp(inputBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const outputData = new Uint8Array(data.length);

  for (let i = 0; i < data.length; i += channels) {
    const newColor = findClosestColor(data[i], data[i + 1], data[i + 2]);
    outputData[i] = newColor[0];
    outputData[i + 1] = newColor[1];
    outputData[i + 2] = newColor[2];
  }

  const outputBuffer = await sharp(outputData, {
    raw: {
      width,
      height,
      channels,
    },
  })
    .png()
    .toBuffer();

  return outputBuffer;
}

export default { applyFloydSteinberg, quantizeOnly };
