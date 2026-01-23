import { fetchAlbum } from './fetcher.js';
import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * In-memory cache for album photo list with automatic refresh.
 */

let cachedPhotos = [];
let lastRefresh = null;
let refreshTimer = null;
let isRefreshing = false;

/**
 * Get the cached photos, refreshing if necessary.
 */
export async function getPhotos() {
  if (cachedPhotos.length === 0 || needsRefresh()) {
    await refresh();
  }
  return cachedPhotos;
}

/**
 * Check if the cache needs to be refreshed based on the configured interval.
 */
function needsRefresh() {
  if (!lastRefresh) return true;
  const ageMs = Date.now() - lastRefresh.getTime();
  const maxAgeMs = config.albumRefreshIntervalMinutes * 60 * 1000;
  return ageMs > maxAgeMs;
}

/**
 * Force refresh the album cache.
 */
export async function refresh() {
  if (isRefreshing) {
    logger.debug('Refresh already in progress, skipping');
    return;
  }

  isRefreshing = true;
  logger.info('Refreshing album cache');

  try {
    const photos = await fetchAlbum(config.albumUrl);
    cachedPhotos = photos;
    lastRefresh = new Date();
    logger.info('Album cache refreshed', { photoCount: photos.length });
  } catch (error) {
    logger.error('Failed to refresh album cache', { error: error.message });
    // Keep existing cache if refresh fails
    if (cachedPhotos.length === 0) {
      throw error; // Re-throw if we have no fallback
    }
  } finally {
    isRefreshing = false;
  }
}

/**
 * Start automatic refresh timer.
 */
export function startAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  const intervalMs = config.albumRefreshIntervalMinutes * 60 * 1000;
  refreshTimer = setInterval(async () => {
    try {
      await refresh();
    } catch (error) {
      logger.error('Auto-refresh failed', { error: error.message });
    }
  }, intervalMs);

  logger.info('Auto-refresh started', { intervalMinutes: config.albumRefreshIntervalMinutes });
}

/**
 * Stop automatic refresh timer.
 */
export function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    logger.info('Auto-refresh stopped');
  }
}

/**
 * Get cache status information.
 */
export function getCacheStatus() {
  return {
    photoCount: cachedPhotos.length,
    lastRefresh: lastRefresh?.toISOString() || null,
    cacheAgeMinutes: lastRefresh
      ? Math.round((Date.now() - lastRefresh.getTime()) / 60000)
      : null,
    isRefreshing,
  };
}

export default {
  getPhotos,
  refresh,
  startAutoRefresh,
  stopAutoRefresh,
  getCacheStatus,
};
