import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Weighted random photo selection with history tracking and navigation support.
 */

// Track shown photos for avoiding repetition in random selection
const recentHistory = [];

// Navigation history: ordered list of shown photos for prev/next navigation
const navigationHistory = [];
let navigationIndex = -1; // Current position in navigation history

/**
 * Categorize photos into recent and old based on their timestamps.
 */
function categorizePhotos(photos) {
  const now = Date.now();
  const thresholdMs = config.recentThresholdDays * 24 * 60 * 60 * 1000;
  const cutoffDate = now - thresholdMs;

  const recent = [];
  const old = [];

  for (const photo of photos) {
    if (!photo.timestamp) {
      old.push(photo);
      continue;
    }

    const photoTime = photo.timestamp.getTime();
    if (photoTime >= cutoffDate) {
      recent.push(photo);
    } else {
      old.push(photo);
    }
  }

  return { recent, old };
}

/**
 * Filter out recently shown photos from a list.
 */
function filterRecentlyShown(photos) {
  const historySet = new Set(recentHistory);
  return photos.filter(photo => !historySet.has(photo.url));
}

/**
 * Select a random photo from an array.
 */
function selectRandom(photos) {
  if (photos.length === 0) return null;
  const index = Math.floor(Math.random() * photos.length);
  return photos[index];
}

/**
 * Add a photo URL to the recent history (for avoiding repetition).
 */
function addToHistory(url) {
  recentHistory.push(url);
  while (recentHistory.length > config.historySize) {
    recentHistory.shift();
  }
}

/**
 * Add a photo to the navigation history (for prev/next navigation).
 */
function addToNavigationHistory(photo) {
  // If we're not at the end, truncate forward history
  if (navigationIndex < navigationHistory.length - 1) {
    navigationHistory.length = navigationIndex + 1;
  }

  navigationHistory.push(photo);
  navigationIndex = navigationHistory.length - 1;

  // Limit navigation history size
  const maxNavHistory = config.historySize * 2;
  if (navigationHistory.length > maxNavHistory) {
    navigationHistory.shift();
    navigationIndex--;
  }

  logger.debug('Navigation history updated', {
    index: navigationIndex,
    total: navigationHistory.length,
  });
}

/**
 * Pick a random photo using weighted selection based on photo age.
 */
export function pickPhoto(photos) {
  if (!photos || photos.length === 0) {
    logger.warn('No photos available to pick from');
    return null;
  }

  const { recent, old } = categorizePhotos(photos);
  logger.debug('Photo categories', {
    total: photos.length,
    recent: recent.length,
    old: old.length,
  });

  const availableRecent = filterRecentlyShown(recent);
  const availableOld = filterRecentlyShown(old);

  logger.debug('Available after history filter', {
    recent: availableRecent.length,
    old: availableOld.length,
  });

  if (availableRecent.length === 0 && availableOld.length === 0) {
    logger.info('All photos recently shown, clearing history');
    recentHistory.length = 0;
    return pickPhoto(photos);
  }

  let selectedPhoto = null;
  const roll = Math.random() * 100;

  if (roll < config.recentWeight && availableRecent.length > 0) {
    selectedPhoto = selectRandom(availableRecent);
    logger.debug('Selected from recent photos');
  } else if (availableOld.length > 0) {
    selectedPhoto = selectRandom(availableOld);
    logger.debug('Selected from old photos');
  } else {
    selectedPhoto = selectRandom(availableRecent);
    logger.debug('Fallback: selected from recent (old category empty)');
  }

  if (selectedPhoto) {
    addToHistory(selectedPhoto.url);
    addToNavigationHistory(selectedPhoto);
  }

  return selectedPhoto;
}

/**
 * Get the previous photo in navigation history.
 * Returns null if at the beginning of history.
 */
export function getPreviousPhoto() {
  if (navigationIndex <= 0) {
    logger.debug('At beginning of navigation history');
    return null;
  }

  navigationIndex--;
  const photo = navigationHistory[navigationIndex];
  logger.debug('Navigated to previous', { index: navigationIndex });
  return photo;
}

/**
 * Get the next photo in navigation history.
 * Returns null if at the end of history (use pickPhoto for new random).
 */
export function getNextPhoto() {
  if (navigationIndex >= navigationHistory.length - 1) {
    logger.debug('At end of navigation history');
    return null;
  }

  navigationIndex++;
  const photo = navigationHistory[navigationIndex];
  logger.debug('Navigated to next', { index: navigationIndex });
  return photo;
}

/**
 * Get the current photo without navigation.
 */
export function getCurrentPhoto() {
  if (navigationIndex < 0 || navigationIndex >= navigationHistory.length) {
    return null;
  }
  return navigationHistory[navigationIndex];
}

/**
 * Check if we can go back in history.
 */
export function canGoPrevious() {
  return navigationIndex > 0;
}

/**
 * Check if we can go forward in history.
 */
export function canGoNext() {
  return navigationIndex < navigationHistory.length - 1;
}

/**
 * Clear the selection history.
 */
export function clearHistory() {
  recentHistory.length = 0;
  logger.info('Selection history cleared');
}

/**
 * Clear navigation history.
 */
export function clearNavigationHistory() {
  navigationHistory.length = 0;
  navigationIndex = -1;
  logger.info('Navigation history cleared');
}

/**
 * Get current history status.
 */
export function getHistoryStatus() {
  return {
    size: recentHistory.length,
    maxSize: config.historySize,
  };
}

/**
 * Get navigation status.
 */
export function getNavigationStatus() {
  return {
    index: navigationIndex,
    total: navigationHistory.length,
    canGoPrevious: canGoPrevious(),
    canGoNext: canGoNext(),
  };
}

export default {
  pickPhoto,
  getPreviousPhoto,
  getNextPhoto,
  getCurrentPhoto,
  canGoPrevious,
  canGoNext,
  clearHistory,
  clearNavigationHistory,
  getHistoryStatus,
  getNavigationStatus,
};
