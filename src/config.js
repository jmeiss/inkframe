import 'dotenv/config';

/**
 * Configuration loaded from environment variables with sensible defaults.
 */
export const config = {
  // Google Photos album URL (required)
  albumUrl: process.env.GOOGLE_PHOTOS_ALBUM_URL || '',

  // Image selection weights
  recentThresholdDays: parseInt(process.env.RECENT_THRESHOLD_DAYS, 10) || 90,
  recentWeight: parseInt(process.env.RECENT_WEIGHT, 10) || 80,
  oldWeight: parseInt(process.env.OLD_WEIGHT, 10) || 20,
  historySize: parseInt(process.env.HISTORY_SIZE, 10) || 20,

  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',

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

  if (config.recentWeight + config.oldWeight !== 100) {
    errors.push('RECENT_WEIGHT + OLD_WEIGHT must equal 100');
  }

  if (config.recentWeight < 0 || config.recentWeight > 100) {
    errors.push('RECENT_WEIGHT must be between 0 and 100');
  }

  if (config.oldWeight < 0 || config.oldWeight > 100) {
    errors.push('OLD_WEIGHT must be between 0 and 100');
  }

  return errors;
}

export default config;
