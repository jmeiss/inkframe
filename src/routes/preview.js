import { Router } from 'express';
import config from '../config.js';
import { getCurrentImage, processImage, generateErrorImage } from '../processing/pipeline.js';
import { VALID_POSITIONS } from '../processing/resize.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /preview/meta
 * JSON metadata for the current image (consumed by Vite frontend).
 */
router.get('/preview/meta', (req, res) => {
  const cached = getCurrentImage();
  const metadata = cached?.metadata || {};

  const timestamp = metadata.timestamp
    ? metadata.timestamp.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  const processedAt = metadata.processedAt
    ? metadata.processedAt.toLocaleString()
    : null;

  res.json({
    timestamp,
    processedAt,
    dithered: metadata.dithered ?? false,
    width: metadata.width || 800,
    height: metadata.height || 480,
  });
});

/**
 * GET /test-crop/image
 * Returns the current photo processed with a specific crop position.
 */
router.get('/test-crop/image', async (req, res, next) => {
  try {
    const cached = getCurrentImage();
    if (!cached || !cached.metadata?.photoUrl) {
      const errorImage = await generateErrorImage('No photo loaded');
      return res.type('image/png').send(errorImage);
    }

    const position = req.query.position || 'entropy';
    if (!VALID_POSITIONS.includes(position)) {
      return res.status(400).json({ error: `Invalid position. Valid: ${VALID_POSITIONS.join(', ')}` });
    }
    const photo = {
      url: cached.metadata.photoUrl,
      timestamp: cached.metadata.timestamp,
    };

    const result = await processImage(photo, { raw: true, crop: position, skipCache: true });
    res.set('Cache-Control', 'no-store');
    res.type('image/png').send(result.buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
