import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';

/**
 * Fetches and parses a Google Photos shared album to extract image URLs and metadata.
 *
 * Google Photos shared albums embed image data in a JavaScript array within the page.
 * The data structure contains image URLs and timestamps that we can extract.
 */

/**
 * Resolve a shortened Google Photos URL to its full URL
 */
async function resolveShortUrl(url) {
  if (!url.includes('photos.app.goo.gl')) {
    return url;
  }

  const response = await fetch(url, { redirect: 'follow' });
  return response.url;
}

/**
 * Extract image data from Google Photos album page HTML.
 *
 * Google Photos embeds album data in a script tag as an array starting with "AF_initDataCallback".
 * The image URLs and metadata are nested deep within this structure.
 */
function parseAlbumHtml(html) {
  const $ = cheerio.load(html);
  const photos = [];

  // Find script tags containing the album data
  $('script').each((_, script) => {
    const content = $(script).html();
    if (!content || !content.includes('AF_initDataCallback')) {
      return;
    }

    // Look for the data array containing image info
    // The format is: AF_initDataCallback({key: '...', data: [...]});
    const dataMatch = content.match(/AF_initDataCallback\(\{[^}]*data:(\[[\s\S]*?\])\s*,\s*sideChannel/);
    if (!dataMatch) {
      return;
    }

    try {
      // Parse the data array - it's valid JSON-like structure
      const dataStr = dataMatch[1];
      const data = JSON.parse(dataStr);

      // Navigate the nested structure to find photo arrays
      // The structure varies but photos are typically in nested arrays
      extractPhotosFromData(data, photos);
    } catch (e) {
      logger.debug('Failed to parse data block', { error: e.message });
    }
  });

  // Alternative approach: look for image URLs directly in the page data
  if (photos.length === 0) {
    const urlPattern = /\["(https:\/\/lh3\.googleusercontent\.com\/[^"]+)",(\d+),(\d+)/g;
    let match;
    const seen = new Set();

    while ((match = urlPattern.exec(html)) !== null) {
      const [, url, width, height] = match;
      // Filter out thumbnails and icons (very small images)
      if (parseInt(width) > 200 && parseInt(height) > 200 && !seen.has(url)) {
        seen.add(url);
        photos.push({
          url: url,
          width: parseInt(width),
          height: parseInt(height),
          timestamp: null, // Will try to extract from nearby data
        });
      }
    }

    // Try to extract timestamps
    extractTimestampsFromHtml(html, photos);
  }

  return photos;
}

/**
 * Recursively extract photo data from the nested Google Photos data structure.
 */
function extractPhotosFromData(data, photos, depth = 0) {
  if (depth > 15 || !data) return;

  if (Array.isArray(data)) {
    // Check if this array looks like a photo entry
    // Photo entries typically have: [url, width, height] as first elements
    // and timestamp somewhere in the structure
    if (data.length >= 3 &&
        typeof data[0] === 'string' &&
        data[0].includes('googleusercontent.com') &&
        typeof data[1] === 'number' &&
        typeof data[2] === 'number') {

      const url = data[0];
      const width = data[1];
      const height = data[2];

      // Look for timestamp in the parent structure
      let timestamp = findTimestamp(data);

      if (width > 200 && height > 200) {
        photos.push({
          url,
          width,
          height,
          timestamp,
        });
      }
      return;
    }

    // Recurse into array elements
    for (const item of data) {
      extractPhotosFromData(item, photos, depth + 1);
    }
  }
}

/**
 * Look for a timestamp value in a data structure.
 * Google Photos timestamps are typically in microseconds since epoch.
 */
function findTimestamp(data, depth = 0) {
  if (depth > 5 || !data) return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      // Timestamps are large numbers (microseconds since 1970)
      // They start with 1 and have 16 digits for dates in 2000s-2020s
      if (typeof item === 'number' && item > 1000000000000000 && item < 2000000000000000) {
        return new Date(item / 1000); // Convert microseconds to milliseconds
      }
      const found = findTimestamp(item, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Try to extract timestamps from HTML when structured parsing fails.
 */
function extractTimestampsFromHtml(html, photos) {
  // Look for timestamp patterns near image URLs
  // This is a fallback and may not always work
  const timestampPattern = /(\d{16})/g;
  const timestamps = [];
  let match;

  while ((match = timestampPattern.exec(html)) !== null) {
    const ts = parseInt(match[1]);
    if (ts > 1000000000000000 && ts < 2000000000000000) {
      timestamps.push(new Date(ts / 1000));
    }
  }

  // Assign timestamps to photos if we have a reasonable match
  if (timestamps.length >= photos.length) {
    // Remove duplicates and sort
    const uniqueTimestamps = [...new Set(timestamps.map(d => d.getTime()))]
      .sort((a, b) => b - a)
      .map(t => new Date(t));

    photos.forEach((photo, i) => {
      if (i < uniqueTimestamps.length) {
        photo.timestamp = uniqueTimestamps[i];
      }
    });
  }
}

/**
 * Fetch a Google Photos shared album and return the list of photos.
 *
 * @param {string} albumUrl - The shared album URL
 * @returns {Promise<Array>} Array of photo objects with url, width, height, timestamp
 */
export async function fetchAlbum(albumUrl) {
  logger.info('Fetching album', { url: albumUrl });

  // Resolve short URLs
  const resolvedUrl = await resolveShortUrl(albumUrl);
  logger.debug('Resolved URL', { resolved: resolvedUrl });

  // Fetch the album page
  const response = await fetch(resolvedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch album: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const photos = parseAlbumHtml(html);

  logger.info('Album fetched', { photoCount: photos.length });

  if (photos.length === 0) {
    logger.warn('No photos found in album. The album may be empty or the page structure may have changed.');
  }

  return photos;
}

/**
 * Build a Google Photos image URL with size parameters.
 *
 * Google Photos URLs support various parameters:
 * - =wXXX - width
 * - =hXXX - height
 * - =c - crop to fit
 * - =no - no crop (letterbox)
 *
 * @param {string} baseUrl - The base image URL
 * @param {number} width - Desired width
 * @param {number} height - Desired height
 * @param {boolean} crop - Whether to crop (true) or letterbox (false)
 * @returns {string} URL with size parameters
 */
export function buildImageUrl(baseUrl, width, height, crop = true) {
  // Remove any existing size parameters
  const cleanUrl = baseUrl.replace(/=[^/]*$/, '');
  const cropParam = crop ? '-c' : '-no';
  return `${cleanUrl}=w${width}-h${height}${cropParam}`;
}

export default { fetchAlbum, buildImageUrl };
