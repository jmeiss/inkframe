import { Router } from 'express';
import config from '../config.js';
import logger from '../utils/logger.js';
import { getPhotos } from '../album/cache.js';
import { pickPhoto, getPreviousPhoto, getNextPhoto } from '../selection/picker.js';
import { processImage, getCurrentImage, generateErrorImage } from '../processing/pipeline.js';
import { sendImage, sendErrorImage } from '../middleware/serveImage.js';

const router = Router();

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

    const cached = getCurrentImage();
    if (cached && !forceRefresh && config.imageCacheEnabled) {
      logger.debug('Serving cached image');
      return sendImage(res, cached.buffer);
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
    let photo = getNextPhoto();

    if (!photo) {
      const photos = await getPhotos();
      if (photos.length === 0) {
        return res.status(404).json({ error: 'No photos in album' });
      }
      photo = pickPhoto(photos);
    }

    if (!photo) {
      return res.status(404).json({ error: 'Failed to select photo' });
    }

    await processImage(photo, { raw });
    res.json({ success: true });
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
    let photo = getNextPhoto();

    if (!photo) {
      const photos = await getPhotos();
      if (photos.length === 0) {
        return sendErrorImage(res, 'No photos in album');
      }
      photo = pickPhoto(photos);
    }

    if (!photo) {
      return sendErrorImage(res, 'Failed to select photo');
    }

    const result = await processImage(photo, { raw });
    sendImage(res, result.buffer);
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

export default router;
