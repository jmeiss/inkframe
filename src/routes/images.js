import { Router } from 'express';
import config from '../config.js';
import logger from '../utils/logger.js';
import { getPhotos } from '../album/cache.js';
import { pickPhoto, pickPhotoForPrefetch, recordInNavigationHistory, getPreviousPhoto, getNextPhoto, peekPreviousPhoto } from '../selection/picker.js';
import { processImage, getCurrentImage, generateErrorImage, consumeNextImageCache, storeNextImageCache, setCurrentImageCache, peekNextImageCache } from '../processing/pipeline.js';
import { sendImage, sendErrorImage } from '../middleware/serveImage.js';

const router = Router();

let prefetchInProgress = false;

function triggerBackgroundPrefetch(photos, options = {}) {
  if (prefetchInProgress || !config.imageCacheEnabled) return;
  prefetchInProgress = true;
  // Pick WITHOUT adding to nav history — nav history is updated only when served
  (async () => {
    const photo = pickPhotoForPrefetch(photos);
    if (!photo) return;
    const result = await processImage(photo, { ...options, skipCache: true });
    storeNextImageCache(result, photo);
  })()
    .catch(err => logger.warn('Background prefetch failed', { error: err.message }))
    .finally(() => { prefetchInProgress = false; });
}

/**
 * Pick a photo and process it, retrying up to maxRetries times with different photos.
 */
async function pickAndProcess(photos, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const photo = pickPhoto(photos);
    if (!photo) return null;

    try {
      return await processImage(photo, options);
    } catch (error) {
      lastError = error;
      logger.warn(`Image processing failed (attempt ${attempt}/${maxRetries})`, {
        error: error.message,
        photoUrl: photo.url?.substring(0, 80),
      });
    }
  }
  throw lastError;
}

/**
 * GET /image
 * Returns a processed random image optimized for the e-paper display.
 */
router.get('/image', async (req, res, next) => {
  try {
    const raw = req.query.raw === '1';
    const forceRefresh = req.query.refresh === '1';
    const crop = req.query.crop;

    if (!forceRefresh && config.imageCacheEnabled) {
      // Serve prefetched image if ready (advances to next photo instantly)
      const next = consumeNextImageCache();
      if (next) {
        logger.debug('Serving prefetched image');
        if (next._photo) recordInNavigationHistory(next._photo);
        setCurrentImageCache(next);
        sendImage(res, next.buffer);
        getPhotos().then(photos => triggerBackgroundPrefetch(photos, { raw, crop })).catch(() => {});
        return;
      }

      // Fall back to current cached image; kick off prefetch for next call
      const cached = getCurrentImage();
      if (cached) {
        logger.debug('Serving cached image');
        sendImage(res, cached.buffer);
        getPhotos().then(photos => triggerBackgroundPrefetch(photos, { raw, crop })).catch(() => {});
        return;
      }
    }

    const photos = await getPhotos();
    if (photos.length === 0) {
      return sendErrorImage(res, 'No photos in album');
    }

    const result = await pickAndProcess(photos, { raw, crop });
    if (!result) {
      return sendErrorImage(res, 'Failed to select photo');
    }

    sendImage(res, result.buffer);
    triggerBackgroundPrefetch(photos, { raw, crop });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /image/current
 * Returns the currently cached processed image without selecting a new one.
 */
router.get('/image/current', async (req, res, next) => {
  try {
    const cached = getCurrentImage();
    if (cached) {
      return sendImage(res, cached.buffer);
    }

    // No cached image — generate one
    const photos = await getPhotos();
    if (photos.length === 0) {
      return sendErrorImage(res, 'No photos in album');
    }

    const photo = pickPhoto(photos);
    if (!photo) {
      return sendErrorImage(res, 'Failed to select photo');
    }

    const result = await processImage(photo);
    sendImage(res, result.buffer);
    triggerBackgroundPrefetch(photos, {});
  } catch (error) {
    next(error);
  }
});

/**
 * POST /next
 * Navigate forward: pick from history or select a new random photo.
 * Returns JSON with navigation state.
 */
router.post('/next', async (req, res, next) => {
  try {
    const raw = req.query.raw === '1';
    const historyPhoto = getNextPhoto();

    if (historyPhoto) {
      // Navigating forward through existing history — no prefetch needed
      await processImage(historyPhoto, { raw });
      return res.json({ success: true });
    }

    // At end of history: use prefetched image if ready, else process fresh
    const prefetched = consumeNextImageCache();
    if (prefetched) {
      logger.debug('POST /next serving prefetched image');
      if (prefetched._photo) recordInNavigationHistory(prefetched._photo);
      setCurrentImageCache(prefetched);
      res.json({ success: true });
      getPhotos().then(photos => triggerBackgroundPrefetch(photos, { raw })).catch(() => {});
      return;
    }

    const photos = await getPhotos();
    if (photos.length === 0) {
      return res.status(404).json({ error: 'No photos in album' });
    }
    const photo = pickPhoto(photos);
    if (!photo) {
      return res.status(404).json({ error: 'Failed to select photo' });
    }

    await processImage(photo, { raw });
    res.json({ success: true });
    triggerBackgroundPrefetch(photos, { raw });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /previous
 * Navigate backward in history.
 * Returns JSON with navigation state.
 */
router.post('/previous', async (req, res, next) => {
  try {
    const raw = req.query.raw === '1';
    const photo = getPreviousPhoto();

    if (!photo) {
      return res.json({ success: true, atBeginning: true });
    }

    await processImage(photo, { raw });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /next, GET /previous (backwards compat)
 * Legacy endpoints that return images directly.
 */
router.get('/next', async (req, res, next) => {
  try {
    const raw = req.query.raw === '1';
    const historyPhoto = getNextPhoto();

    if (historyPhoto) {
      const result = await processImage(historyPhoto, { raw });
      return sendImage(res, result.buffer);
    }

    const prefetched = consumeNextImageCache();
    if (prefetched) {
      logger.debug('GET /next serving prefetched image');
      if (prefetched._photo) recordInNavigationHistory(prefetched._photo);
      setCurrentImageCache(prefetched);
      sendImage(res, prefetched.buffer);
      getPhotos().then(photos => triggerBackgroundPrefetch(photos, { raw })).catch(() => {});
      return;
    }

    const photos = await getPhotos();
    if (photos.length === 0) {
      return sendErrorImage(res, 'No photos in album');
    }
    const photo = pickPhoto(photos);
    if (!photo) {
      return sendErrorImage(res, 'Failed to select photo');
    }

    const result = await processImage(photo, { raw });
    sendImage(res, result.buffer);
    triggerBackgroundPrefetch(photos, { raw });
  } catch (error) {
    next(error);
  }
});

router.get('/previous', async (req, res, next) => {
  try {
    const raw = req.query.raw === '1';
    const photo = getPreviousPhoto();

    if (!photo) {
      const cached = getCurrentImage();
      if (cached) return sendImage(res, cached.buffer);
      return sendErrorImage(res, 'No previous image');
    }

    const result = await processImage(photo, { raw });
    sendImage(res, result.buffer);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /image/peek/next
 * Returns the prefetched next image without consuming it (for preview strip).
 * 204 if not ready yet.
 */
router.get('/image/peek/next', (req, res) => {
  const next = peekNextImageCache();
  if (!next) return res.status(204).end();
  res.set('Cache-Control', 'no-store');
  sendImage(res, next.buffer);
});

/**
 * GET /image/peek/previous
 * Returns the previous navigation history image without navigating (for preview strip).
 * 204 if at the beginning of history.
 */
router.get('/image/peek/previous', async (req, res, next) => {
  try {
    const photo = peekPreviousPhoto();
    if (!photo) return res.status(204).end();
    const result = await processImage(photo, { skipCache: true });
    res.set('Cache-Control', 'no-store');
    sendImage(res, result.buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
