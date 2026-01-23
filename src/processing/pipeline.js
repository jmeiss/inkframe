import sharp from 'sharp';
import { resizeImage } from './resize.js';
import { applyFloydSteinberg, quantizeOnly } from './dither.js';
import { buildImageUrl } from '../album/fetcher.js';
import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Main image processing pipeline.
 * Takes a photo object and produces a processed image optimized for the e-paper display.
 */

// Cache for the currently processed image
let currentImageCache = null;

/**
 * Download an image from URL.
 *
 * @param {string} url - Image URL
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImage(url) {
  logger.debug('Downloading image', { url: url.substring(0, 80) + '...' });

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Process an image through the full pipeline.
 *
 * Pipeline steps:
 * 1. Build optimized URL with Google's size parameters
 * 2. Download the image
 * 3. Resize to display dimensions with center crop
 * 4. Apply color quantization and dithering
 *
 * @param {Object} photo - Photo object with url, width, height, timestamp
 * @param {Object} options - Processing options
 * @param {boolean} options.raw - Skip dithering, return resized only
 * @returns {Promise<Object>} { buffer: Buffer, metadata: Object }
 */
export async function processImage(photo, options = {}) {
  const { raw = false } = options;
  const { displayWidth, displayHeight, ditherEnabled } = config;

  logger.info('Processing image', {
    raw,
    dither: ditherEnabled && !raw,
    timestamp: photo.timestamp?.toISOString(),
  });

  try {
    // Build URL with Google's size parameters for pre-scaling
    // This reduces download size and processing time
    const optimizedUrl = buildImageUrl(photo.url, displayWidth * 2, displayHeight * 2, true);

    // Download the image
    const imageBuffer = await downloadImage(optimizedUrl);

    // Resize to exact display dimensions
    const resizedBuffer = await resizeImage(imageBuffer);

    // Get dimensions for dithering
    const metadata = await sharp(resizedBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    let outputBuffer;

    if (raw) {
      // Raw mode: just quantize without dithering
      outputBuffer = await quantizeOnly(resizedBuffer, width, height);
    } else if (ditherEnabled) {
      // Full processing: apply Floyd-Steinberg dithering
      outputBuffer = await applyFloydSteinberg(resizedBuffer, width, height);
    } else {
      // Dithering disabled: just quantize
      outputBuffer = await quantizeOnly(resizedBuffer, width, height);
    }

    const result = {
      buffer: outputBuffer,
      metadata: {
        width,
        height,
        timestamp: photo.timestamp,
        originalUrl: photo.url,
        processedAt: new Date(),
        dithered: ditherEnabled && !raw,
      },
    };

    // Update cache
    if (config.imageCacheEnabled) {
      currentImageCache = result;
    }

    logger.info('Image processing complete', {
      size: outputBuffer.length,
      dithered: ditherEnabled && !raw,
    });

    return result;
  } catch (error) {
    logger.error('Image processing failed', { error: error.message });
    throw error;
  }
}

/**
 * Get the currently cached processed image.
 *
 * @returns {Object|null} Cached image result or null if no cache
 */
export function getCurrentImage() {
  return currentImageCache;
}

/**
 * Clear the image cache.
 */
export function clearImageCache() {
  currentImageCache = null;
  logger.info('Image cache cleared');
}

/**
 * Generate a placeholder error image.
 *
 * @param {string} message - Error message to display
 * @returns {Promise<Buffer>} PNG buffer with error message
 */
export async function generateErrorImage(message = 'Error loading image') {
  const { displayWidth, displayHeight } = config;

  // Create a simple error image with text
  // Using SVG for text rendering, then convert to PNG
  const svg = `
    <svg width="${displayWidth}" height="${displayHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="24" fill="black" text-anchor="middle">
        ⚠️
      </text>
      <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="18" fill="black" text-anchor="middle">
        ${message}
      </text>
    </svg>
  `;

  const buffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return buffer;
}

export default {
  processImage,
  getCurrentImage,
  clearImageCache,
  generateErrorImage,
};
