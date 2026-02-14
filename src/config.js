import 'dotenv/config';

/**
 * Parse TIME_BUCKETS env var. Format: "30:30,180:25,730:25,0:20"
 * Each entry is maxDays:weight. Use 0 for the catch-all (Infinity) bucket.
 * Returns null if not set or invalid, so the default kicks in.
 */
function parseTimeBuckets(envValue) {
  if (!envValue) return null;
  try {
    const buckets = envValue.split(',').map(entry => {
      const [days, weight] = entry.trim().split(':').map(Number);
      return { maxDays: days === 0 ? Infinity : days, weight };
    });
    const totalWeight = buckets.reduce((sum, b) => sum + b.weight, 0);
    if (totalWeight !== 100) return null;
    return buckets;
  } catch {
    return null;
  }
}

/**
 * Configuration loaded from environment variables with sensible defaults.
 */
export const config = {
  // Google Photos album URL (required)
  albumUrl: process.env.GOOGLE_PHOTOS_ALBUM_URL || '',

  // Image selection weights — time buckets
  // Each bucket defines a max age in days and a weight (probability %).
  // Weights must sum to 100. Photos older than all buckets fall into the last one.
  timeBuckets: parseTimeBuckets(process.env.TIME_BUCKETS) || [
    { maxDays: 30, weight: 30 },
    { maxDays: 180, weight: 25 },
    { maxDays: 730, weight: 25 },
    { maxDays: Infinity, weight: 20 },
  ],
  historySize: parseInt(process.env.HISTORY_SIZE, 10) || 20,

  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  pathSecret: process.env.PATH_SECRET || '',

  // Cache
  albumRefreshIntervalMinutes: parseInt(process.env.ALBUM_REFRESH_INTERVAL_MINUTES, 10) || 60,
  imageCacheEnabled: process.env.IMAGE_CACHE_ENABLED !== 'false',

  // Processing
  ditherEnabled: process.env.DITHER_ENABLED !== 'false',
  outputFormat: process.env.OUTPUT_FORMAT || 'png',
  dateOverlayEnabled: process.env.DATE_OVERLAY_ENABLED !== 'false',

  // "On this day" feature
  onThisDayEnabled: process.env.ON_THIS_DAY_ENABLED !== 'false',
  onThisDayWindowDays: parseInt(process.env.ON_THIS_DAY_WINDOW_DAYS, 10) || 3,

  // Countdown overlay (format: YYYY-MM-DD or empty to disable)
  countdownDate: process.env.COUNTDOWN_DATE || '',
  countdownLabel: process.env.COUNTDOWN_LABEL || 'Holidays',

  // Display dimensions (Seeed Studio reTerminal E1002)
  displayWidth: 800,
  displayHeight: 480,
};

/**
 * Validate required configuration
 */
export function validateConfig() {
  const errors = [];

  if (!config.albumUrl) {
    errors.push('GOOGLE_PHOTOS_ALBUM_URL is required');
  }

  if (!config.pathSecret) {
    errors.push('PATH_SECRET is required (generate one with: openssl rand -hex 16)');
  }

  const totalWeight = config.timeBuckets.reduce((sum, b) => sum + b.weight, 0);
  if (totalWeight !== 100) {
    errors.push(`TIME_BUCKETS weights must sum to 100 (got ${totalWeight})`);
  }

  for (const bucket of config.timeBuckets) {
    if (bucket.weight < 0 || bucket.weight > 100) {
      errors.push(`TIME_BUCKETS: each weight must be 0-100 (got ${bucket.weight})`);
      break;
    }
  }

  return errors;
}

export default config;
