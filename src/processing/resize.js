import sharp from "sharp";
import config from "../config.js";
import logger from "../utils/logger.js";

// Valid crop position strategies
const VALID_POSITIONS = ['center', 'attention', 'entropy', 'north', 'south', 'east', 'west'];

/**
 * Resize an image to fit the display dimensions using smart crop.
 *
 * @param {Buffer} inputBuffer - Input image buffer
 * @param {Object} options - Resize options
 * @param {string} options.position - Crop position strategy (default: entropy)
 * @returns {Promise<Buffer>} Resized image buffer
 */
export async function resizeImage(inputBuffer, options = {}) {
  const { displayWidth, displayHeight } = config;
  const position = VALID_POSITIONS.includes(options.position) ? options.position : 'attention';

  logger.debug("Resizing image", {
    width: displayWidth,
    height: displayHeight,
    position,
  });

  const resized = await sharp(inputBuffer)
    .resize(displayWidth, displayHeight, {
      fit: "cover",
      position,
    })
    .removeAlpha()
    .toBuffer();

  return resized;
}

export { VALID_POSITIONS };

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
