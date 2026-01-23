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

  // Alternative approach: look for image URLs with timestamps in the page data
  // Structure: ["id", ["url", width, height, ...]], timestamp, ...
  if (photos.length === 0) {
    // First extract all URLs with dimensions
    const urlPattern = /\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[^"]+)",(\d+),(\d+)/g;
    let match;
    const seen = new Set();
    const photoData = [];

    while ((match = urlPattern.exec(html)) !== null) {
      const [fullMatch, url, width, height] = match;
      // Skip videos and duplicates
      if (parseInt(width) > 200 && parseInt(height) > 200 && !seen.has(url) && !isVideoUrl(url)) {
        seen.add(url);
        photoData.push({
          url,
          width: parseInt(width),
          height: parseInt(height),
          matchIndex: match.index,
        });
      }
    }

    // Now find timestamps - they appear after ]],  following each photo entry
    // Look for 13-digit timestamps near each URL
    for (const photo of photoData) {
      // Search for timestamp in the ~500 chars after the URL match
      const searchStart = photo.matchIndex;
      const searchEnd = Math.min(searchStart + 500, html.length);
      const searchText = html.substring(searchStart, searchEnd);

      // Pattern: ]],timestamp, where timestamp is 13 digits starting with 17 (year 2024+)
      const tsMatch = searchText.match(/\]\],(\d{13}),/);
      let timestamp = null;
      if (tsMatch) {
        const ts = parseInt(tsMatch[1]);
        // Validate it's a reasonable timestamp (2020-2030 range in ms)
        if (ts > 1577836800000 && ts < 1893456000000) {
          timestamp = new Date(ts);
        }
      }

      photos.push({
        url: photo.url,
        width: photo.width,
        height: photo.height,
        timestamp,
      });
    }
  }

  return photos;
}

/**
 * Check if a URL is likely a video rather than a photo.
 * Videos in Google Photos have specific URL patterns.
 */
function isVideoUrl(url) {
  // Video URLs often contain these patterns
  return url.includes('/video/') ||
         url.includes('=m18') ||   // Video stream parameter
         url.includes('=m22') ||   // Video stream parameter
         url.includes('=m37') ||   // Video stream parameter
         url.includes('/dv/');     // Direct video
}

/**
 * Check if a data entry appears to be a video based on structure.
 * Videos typically have additional nested arrays with video-specific data.
 */
function isVideoEntry(data) {
  // Videos often have a nested array at index 3 or later containing video metadata
  // like duration, format info, etc.
  if (!Array.isArray(data) || data.length < 4) return false;

  // Check for video duration indicator (usually a number representing seconds)
  // Videos have duration data, photos don't
  for (let i = 3; i < Math.min(data.length, 10); i++) {
    const item = data[i];
    // Video entries often have arrays with video codec/format info
    if (Array.isArray(item) && item.length > 0) {
      // Look for video-specific patterns like [null, "video/mp4", ...]
      for (const subItem of item) {
        if (typeof subItem === 'string' &&
            (subItem.includes('video/') || subItem.includes('mp4') || subItem.includes('webm'))) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Recursively extract photo data from the nested Google Photos data structure.
 * Structure: [null, [[id, [url, w, h, ...], timestamp, ...], ...]]
 */
function extractPhotosFromData(data, photos, depth = 0) {
  if (depth > 15 || !data) return;

  if (Array.isArray(data)) {
    // Check if this is a photo entry: [id, [url, w, h, ...], timestamp, ...]
    // The image data is in data[1] as [url, width, height, ...]
    if (data.length >= 3 &&
        typeof data[0] === 'string' &&  // Photo ID
        Array.isArray(data[1]) &&        // Image data array
        data[1].length >= 3 &&
        typeof data[1][0] === 'string' &&
        data[1][0].includes('googleusercontent.com') &&
        typeof data[1][1] === 'number' &&
        typeof data[1][2] === 'number') {

      const url = data[1][0];
      const width = data[1][1];
      const height = data[1][2];

      // Skip videos
      if (isVideoUrl(url) || isVideoEntry(data)) {
        return;
      }

      // Timestamp is at index 2 of the parent array (this array)
      let timestamp = null;
      if (typeof data[2] === 'number') {
        const ts = data[2];
        if (ts > 1577836800000 && ts < 1893456000000) {
          timestamp = new Date(ts);
        } else if (ts > 1000000000000000 && ts < 2000000000000000) {
          timestamp = new Date(ts / 1000);
        }
      }

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
 * Google Photos timestamps can be in milliseconds (13 digits) or microseconds (16 digits).
 */
function findTimestamp(data, depth = 0) {
  if (depth > 5 || !data) return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'number') {
        // 13-digit milliseconds (2020-2030 range)
        if (item > 1577836800000 && item < 1893456000000) {
          return new Date(item);
        }
        // 16-digit microseconds (legacy format)
        if (item > 1000000000000000 && item < 2000000000000000) {
          return new Date(item / 1000);
        }
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

  const photosWithTimestamp = photos.filter(p => p.timestamp).length;
  logger.info('Album fetched', { photoCount: photos.length, withTimestamp: photosWithTimestamp });

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
/**
 * Build a Google Photos image URL with size parameters.
 *
 * Google Photos URLs support various parameters:
 * - =wXXX - width
 * - =hXXX - height
 * - -c - center crop
 * - -no - no crop (letterbox)
 * - -p - smart crop (Google's algorithm)
 *
 * @param {string} baseUrl - The base image URL
 * @param {number} width - Desired width
 * @param {number} height - Desired height
 * @param {string} cropMode - Crop mode: 'center', 'smart', or 'none'
 * @returns {string} URL with size parameters
 */
export function buildImageUrl(baseUrl, width, height, cropMode = 'none') {
  // Remove any existing size parameters
  const cleanUrl = baseUrl.replace(/=[^/]*$/, '');

  let cropParam;
  switch (cropMode) {
    case 'center':
      cropParam = '-c';
      break;
    case 'smart':
      cropParam = '-p';
      break;
    case 'none':
    default:
      cropParam = '-no';
      break;
  }

  return `${cleanUrl}=w${width}-h${height}${cropParam}`;
}

export default { fetchAlbum, buildImageUrl };
