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
  } catch (err) {
    console.warn(`[WARN] Failed to parse TIME_BUCKETS="${envValue}": ${err.message}, using defaults`);
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
  port: parseInt(process.env.API_PORT || process.env.PORT, 10) || 3001,
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

  // Holidays countdown overlay (sorted chronologically, with explicit timezone)
  holidays: [
    { date: '2026-10-16T18:30:00+02:00', label: 'Vacances Toussaint in' },
    { date: '2026-11-07T20:20:00+01:00', label: 'Portugal in' },
    { date: '2026-12-18T18:30:00+01:00', label: 'Vacances Noël in' },
    { date: '2027-01-18T00:00:00+01:00', label: 'Anniversaire John in' },
    { date: '2027-02-12T00:00:00+01:00', label: 'Anniversaire Alice in' },
    { date: '2027-02-19T18:30:00+01:00', label: "Vacances d'Hiver in" },
    { date: '2027-04-16T18:30:00+02:00', label: 'Vacances Printemps in' },
    { date: '2027-06-19T00:00:00+02:00', label: 'Anniversaire Mariana in' },
    { date: '2027-07-02T18:30:00+02:00', label: "Vacances d'Été in" },
  ],

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

  for (const [i, h] of config.holidays.entries()) {
    if (isNaN(new Date(h.date).getTime())) {
      errors.push(`holidays[${i}].date is not a valid date: "${h.date}"`);
    }
    if (!h.label) {
      errors.push(`holidays[${i}].label is missing`);
    }
  }

  return errors;
}

export default config;
