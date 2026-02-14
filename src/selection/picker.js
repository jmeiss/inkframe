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
 * Categorize photos into time-based buckets.
 * Each bucket has a maxDays threshold and a selection weight.
 * Photos are placed into the first bucket whose maxDays they fall within.
 */
function categorizePhotos(photos) {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const buckets = config.timeBuckets.map(b => ({ ...b, photos: [] }));

  for (const photo of photos) {
    if (!photo.timestamp) {
      // No timestamp → put in the last (catch-all) bucket
      buckets[buckets.length - 1].photos.push(photo);
      continue;
    }

    const ageDays = (now - photo.timestamp.getTime()) / DAY_MS;

    let placed = false;
    for (const bucket of buckets) {
      if (ageDays <= bucket.maxDays) {
        bucket.photos.push(photo);
        placed = true;
        break;
      }
    }
    if (!placed) {
      buckets[buckets.length - 1].photos.push(photo);
    }
  }

  return buckets;
}

/**
 * Find photos taken "on this day" in previous years.
 * Matches photos within a window of days around today's month/day.
 */
function findOnThisDayPhotos(photos, windowDays = 3) {
  const today = new Date();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();
  const thisYear = today.getFullYear();

  return photos.filter(photo => {
    if (!photo.timestamp) return false;

    const photoYear = photo.timestamp.getFullYear();
    // Skip photos from the current year
    if (photoYear === thisYear) return false;

    const photoMonth = photo.timestamp.getMonth();
    const photoDay = photo.timestamp.getDate();

    // Check if within window of days
    // Create dates in the same year for comparison
    const todayInYear = new Date(2000, todayMonth, todayDay);
    const photoInYear = new Date(2000, photoMonth, photoDay);

    const diffMs = Math.abs(todayInYear - photoInYear);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Handle year wrap-around (e.g., Dec 31 vs Jan 1)
    const daysInYear = 365;
    const wrappedDiff = Math.min(diffDays, daysInYear - diffDays);

    return wrappedDiff <= windowDays;
  });
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
 * If onThisDayEnabled is true, prioritizes photos from this day in previous years.
 */
export function pickPhoto(photos) {
  if (!photos || photos.length === 0) {
    logger.warn('No photos available to pick from');
    return null;
  }

  // Check for "On this day" photos first
  if (config.onThisDayEnabled) {
    const onThisDayPhotos = findOnThisDayPhotos(photos, config.onThisDayWindowDays || 3);
    const availableOnThisDay = filterRecentlyShown(onThisDayPhotos);

    logger.debug('On this day photos', {
      total: onThisDayPhotos.length,
      available: availableOnThisDay.length,
    });

    // 50% chance to show "on this day" photo if available
    if (availableOnThisDay.length > 0 && Math.random() < 0.5) {
      const selectedPhoto = selectRandom(availableOnThisDay);
      selectedPhoto.isOnThisDay = true;
      addToHistory(selectedPhoto.url);
      addToNavigationHistory(selectedPhoto);
      logger.info('Selected "On this day" photo', {
        year: selectedPhoto.timestamp.getFullYear(),
      });
      return selectedPhoto;
    }
  }

  const buckets = categorizePhotos(photos);
  logger.debug('Photo buckets', {
    total: photos.length,
    buckets: buckets.map(b => ({
      maxDays: b.maxDays === Infinity ? '∞' : b.maxDays,
      weight: b.weight,
      count: b.photos.length,
    })),
  });

  // Filter recently shown from each bucket
  const availableBuckets = buckets.map(b => ({
    ...b,
    available: filterRecentlyShown(b.photos),
  }));

  const totalAvailable = availableBuckets.reduce((sum, b) => sum + b.available.length, 0);

  if (totalAvailable === 0) {
    logger.info('All photos recently shown, clearing history');
    recentHistory.length = 0;
    return pickPhoto(photos);
  }

  // Weighted random selection across buckets.
  // If a bucket is empty, redistribute its weight proportionally to non-empty buckets.
  const nonEmptyBuckets = availableBuckets.filter(b => b.available.length > 0);
  const activeWeight = nonEmptyBuckets.reduce((sum, b) => sum + b.weight, 0);

  let selectedPhoto = null;
  const roll = Math.random() * activeWeight;
  let cumulative = 0;

  for (const bucket of nonEmptyBuckets) {
    cumulative += bucket.weight;
    if (roll < cumulative) {
      selectedPhoto = selectRandom(bucket.available);
      logger.debug('Selected from bucket', {
        maxDays: bucket.maxDays === Infinity ? '∞' : bucket.maxDays,
      });
      break;
    }
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
