import logger from '../utils/logger.js';
import { generateErrorImage, getCurrentImage } from '../processing/pipeline.js';

/**
 * Express error handler that returns error images for image routes
 * and JSON for API routes. An image route keeps showing the last photo
 * when there is one (e.g. Google Photos unreachable): the frame retries
 * at its next refresh instead of displaying the error.
 */
export function imageErrorHandler(err, req, res, next) {
  logger.error('Request error', { path: req.path, error: err.message });

  const wantsImage = req.path.includes('/image') ||
    req.path.endsWith('/next') ||
    req.path.endsWith('/previous');

  if (wantsImage) {
    const last = getCurrentImage();
    if (last?.buffer) return res.type('image/png').send(last.buffer);
    generateErrorImage(err.message || 'Processing error')
      .then(buf => res.type('image/png').send(buf))
      .catch(() => res.status(500).json({ error: 'Failed to generate image' }));
  } else {
    res.status(500).json({ error: err.message });
  }
}
