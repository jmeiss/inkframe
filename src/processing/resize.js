import sharp from 'sharp';
import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Resize an image to fit the display dimensions using center crop.
 *
 * @param {Buffer} inputBuffer - Input image buffer
 * @returns {Promise<Buffer>} Resized image buffer
 */
export async function resizeImage(inputBuffer) {
  const { displayWidth, displayHeight } = config;

  logger.debug('Resizing image', { width: displayWidth, height: displayHeight });

  const resized = await sharp(inputBuffer)
    .resize(displayWidth, displayHeight, {
      fit: 'cover',      // Scale to cover entire area
      position: 'center', // Center crop
    })
    .removeAlpha()       // Remove alpha channel (e-paper doesn't support transparency)
    .toBuffer();

  return resized;
}

/**
 * Get image metadata.
 *
 * @param {Buffer} inputBuffer - Input image buffer
 * @returns {Promise<Object>} Image metadata
 */
export async function getImageMetadata(inputBuffer) {
  return sharp(inputBuffer).metadata();
}

export default { resizeImage, getImageMetadata };
