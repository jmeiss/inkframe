import sharp from 'sharp';
import { resizeImage } from './resize.js';
import { applyFloydSteinberg } from './dither.js';
import { buildImageUrl } from '../album/fetcher.js';
import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Format a timestamp as relative time + date string.
 * Returns { relative, dateStr } for separate styling.
 */
function formatRelativeTime(timestamp) {
  const now = new Date();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  // Use calendar days (midnight-to-midnight) for day-level comparisons
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const photoDay = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
  const diffDays = Math.round((today - photoDay) / (1000 * 60 * 60 * 24));
  const diffMonths = (now.getFullYear() - timestamp.getFullYear()) * 12 + (now.getMonth() - timestamp.getMonth());
  const diffYears = now.getFullYear() - timestamp.getFullYear();

  const dateStr = timestamp.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const diffWeeks = Math.floor(diffDays / 7);

  let relative;
  if (diffMin < 1) relative = 'Just now';
  else if (diffMin < 60) relative = `${diffMin} min ago`;
  else if (diffHours < 24) relative = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  else if (diffDays === 1) relative = 'Yesterday';
  else if (diffDays < 14) relative = `${diffDays} days ago`;
  else if (diffWeeks <= 4) relative = `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  else if (diffMonths < 12) relative = `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  else relative = `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;

  return { relative, dateStr };
}

/**
 * Create an SVG overlay bar at the bottom with date (left) and countdown (right).
 *
 * @param {Date} timestamp - Photo timestamp
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {Buffer} SVG buffer
 */
function createOverlay(timestamp, imageWidth, imageHeight) {
  const padding = 12;
  const fontSize = 16;
  const barHeight = fontSize + padding * 2;
  const y = imageHeight - barHeight;

  // Build left text (relative time + date)
  let leftSvg = '';
  if (config.dateOverlayEnabled && timestamp) {
    const { relative, dateStr } = formatRelativeTime(timestamp);
    leftSvg = `<text x="${padding}" y="${y + padding + fontSize - 3}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" fill="white"><tspan font-weight="bold">${relative}</tspan> (${dateStr})</text>`;
  }

  // Build right text (holidays countdown)
  let rightSvg = '';
  const now = new Date();
  let nextHoliday = null;
  let nextDate = null;
  for (const h of config.holidays) {
    const d = new Date(h.date);
    if (d > now) { nextHoliday = h; nextDate = d; break; }
  }

  if (nextHoliday) {
    const diffMs = nextDate - now;
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let countdownText;
    if (daysLeft < 3) {
      const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
      countdownText = `${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`;
    } else {
      countdownText = `${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
    }

    rightSvg = `<text x="${imageWidth - padding}" y="${y + padding + fontSize - 3}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" fill="white" text-anchor="end">${nextHoliday.label} <tspan font-weight="bold">${countdownText}</tspan></text>`;
  } else if (config.holidays.length > 0) {
    logger.debug('All holidays are in the past — update config.holidays to re-enable countdown');
  }

  if (!leftSvg && !rightSvg) return null;

  const svg = `
    <svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${y}" width="${imageWidth}" height="${barHeight}" fill="rgba(0,0,0,0.6)"/>
      ${leftSvg}
      ${rightSvg}
    </svg>
  `;

  return Buffer.from(svg);
}

/**
 * Main image processing pipeline.
 * Takes a photo object and produces a processed image optimized for the e-paper display.
 */

// Cache for the currently processed image
let currentImageCache = null;

// Ring buffer of recent processing errors for diagnostics
const recentErrors = [];
const MAX_RECENT_ERRORS = 10;

function recordError(step, error, context = {}) {
  recentErrors.push({
    time: new Date().toISOString(),
    step,
    error: error.message,
    ...context,
  });
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.shift();
  }
}

export function getRecentErrors() {
  return recentErrors;
}

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
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Expected image content-type, got: ${contentType}`);
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
 * @param {string} options.crop - Crop position strategy (center, attention, entropy, north, etc.)
 * @returns {Promise<Object>} { buffer: Buffer, metadata: Object }
 */
export async function processImage(photo, options = {}) {
  const { raw = false, crop, skipCache = false } = options;
  const { displayWidth, displayHeight, ditherEnabled } = config;

  logger.info('Processing image', {
    raw,
    crop: crop || 'default',
    dither: ditherEnabled && !raw,
    timestamp: photo.timestamp?.toISOString(),
  });

  const photoUrl = photo.url?.substring(0, 80);
  let step = 'build-url';

  try {
    // Build URL with Google's size parameters for pre-scaling
    // Use Google's smart crop (-p) to get a better initial crop, then Sharp refines it
    const optimizedUrl = buildImageUrl(photo.url, displayWidth * 2, displayHeight * 2, 'smart');

    // Download the image
    step = 'download';
    const imageBuffer = await downloadImage(optimizedUrl);

    // Resize to exact display dimensions
    step = 'resize';
    const resizedBuffer = await resizeImage(imageBuffer, { position: crop });

    // Get dimensions for dithering
    step = 'metadata';
    const metadata = await sharp(resizedBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    let outputBuffer;

    // Apply overlays (date and/or countdown)
    step = 'overlay';
    let imageWithOverlay = resizedBuffer;
    const overlay = createOverlay(photo.timestamp, width, height);
    if (overlay) {
      imageWithOverlay = await sharp(resizedBuffer)
        .composite([{ input: overlay, top: 0, left: 0 }])
        .toBuffer();
    }

    step = 'dither';
    if (raw || !ditherEnabled) {
      // Raw mode or dithering disabled: just return image as PNG
      outputBuffer = await sharp(imageWithOverlay).png().toBuffer();
    } else {
      // Full processing: apply Floyd-Steinberg dithering
      outputBuffer = await applyFloydSteinberg(imageWithOverlay, width, height);
    }

    const result = {
      buffer: outputBuffer,
      metadata: {
        width,
        height,
        timestamp: photo.timestamp,
        photoUrl: photo.url,
        originalUrl: photo.url, // Alias for backwards compatibility
        processedAt: new Date(),
        dithered: ditherEnabled && !raw,
      },
    };

    // Update cache (unless skipCache is set)
    if (config.imageCacheEnabled && !skipCache) {
      currentImageCache = result;
    }

    logger.info('Image processing complete', {
      size: outputBuffer.length,
      dithered: ditherEnabled && !raw,
    });

    return result;
  } catch (error) {
    recordError(step, error, { photoUrl });
    logger.error('Image processing failed', { step, error: error.message, photoUrl });
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
  getRecentErrors,
};
