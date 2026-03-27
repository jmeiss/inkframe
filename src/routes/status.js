import { Router } from 'express';
import config from '../config.js';
import logger from '../utils/logger.js';
import { getCacheStatus, refresh as refreshAlbum } from '../album/cache.js';
import { getHistoryStatus, getNavigationStatus } from '../selection/picker.js';
import { getRecentErrors } from '../processing/pipeline.js';

const router = Router();

/**
 * GET /health
 * Server status with album info, selection state, and config.
 */
router.get('/health', async (req, res) => {
  const cacheStatus = getCacheStatus();
  const historyStatus = getHistoryStatus();
  const recentErrors = getRecentErrors();

  res.json({
    status: 'ok',
    album: {
      photoCount: cacheStatus.photoCount,
      lastRefresh: cacheStatus.lastRefresh,
      cacheAgeMinutes: cacheStatus.cacheAgeMinutes,
      isRefreshing: cacheStatus.isRefreshing,
    },
    selection: {
      historySize: historyStatus.size,
      historyMaxSize: historyStatus.maxSize,
    },
    config: {
      timeBuckets: config.timeBuckets.map(b => ({
        maxDays: b.maxDays === Infinity ? 'older' : `≤${b.maxDays}d`,
        weight: b.weight,
      })),
      albumRefreshIntervalMinutes: config.albumRefreshIntervalMinutes,
      ditherEnabled: config.ditherEnabled,
    },
    recentErrors: recentErrors.length > 0 ? recentErrors : undefined,
  });
});

/**
 * GET /navigation
 * Navigation state for UI button feedback.
 */
router.get('/navigation', (req, res) => {
  const navStatus = getNavigationStatus();
  res.json({
    canGoPrevious: navStatus.canGoPrevious,
    canGoNext: true,
    historyIndex: navStatus.index,
    historyTotal: navStatus.total,
  });
});

/**
 * POST /refresh-album
 * Force refresh the album photo list cache.
 */
router.post('/refresh-album', async (req, res) => {
  try {
    await refreshAlbum();
    const status = getCacheStatus();
    res.json({
      success: true,
      photoCount: status.photoCount,
      lastRefresh: status.lastRefresh,
    });
  } catch (error) {
    logger.error('Failed to refresh album', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
