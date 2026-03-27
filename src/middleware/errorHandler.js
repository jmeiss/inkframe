import logger from '../utils/logger.js';
import { generateErrorImage } from '../processing/pipeline.js';

/**
 * Express error handler that returns error images for image routes
 * and JSON for API routes.
 */
export function imageErrorHandler(err, req, res, next) {
  logger.error('Request error', { path: req.path, error: err.message });

  const wantsImage = req.path.includes('/image') ||
    req.path.endsWith('/next') ||
    req.path.endsWith('/previous');

  if (wantsImage) {
    generateErrorImage(err.message || 'Processing error')
      .then(buf => res.type('image/png').send(buf))
      .catch(() => res.status(500).json({ error: 'Failed to generate image' }));
  } else {
    res.status(500).json({ error: err.message });
  }
}
