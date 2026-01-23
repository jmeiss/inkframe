import express from 'express';
import config, { validateConfig } from './config.js';
import logger from './utils/logger.js';
import { getPhotos, refresh as refreshAlbum, startAutoRefresh, getCacheStatus } from './album/cache.js';
import {
  pickPhoto,
  getPreviousPhoto,
  getNextPhoto,
  getHistoryStatus,
  getNavigationStatus,
  canGoPrevious,
  canGoNext,
} from './selection/picker.js';
import { processImage, getCurrentImage, generateErrorImage } from './processing/pipeline.js';

const app = express();

/**
 * GET /image
 * Returns a processed random image optimized for the e-paper display.
 *
 * Query params:
 *   raw=1     - Skip dithering, return resized image only
 *   refresh=1 - Force select a new image (don't serve cached)
 */
app.get('/image', async (req, res) => {
  try {
    const raw = req.query.raw === '1';
    const forceRefresh = req.query.refresh === '1';

    // Check if we have a cached image and don't need to refresh
    const cached = getCurrentImage();
    if (cached && !forceRefresh && config.imageCacheEnabled) {
      logger.debug('Serving cached image');
      res.type('image/png');
      return res.send(cached.buffer);
    }

    // Get photos from album cache
    const photos = await getPhotos();
    if (photos.length === 0) {
      logger.warn('No photos available');
      const errorImage = await generateErrorImage('No photos in album');
      res.type('image/png');
      return res.send(errorImage);
    }

    // Pick a random photo
    const photo = pickPhoto(photos);
    if (!photo) {
      logger.warn('Failed to pick a photo');
      const errorImage = await generateErrorImage('Failed to select photo');
      res.type('image/png');
      return res.send(errorImage);
    }

    // Process the image
    const result = await processImage(photo, { raw });

    res.type('image/png');
    res.send(result.buffer);
  } catch (error) {
    logger.error('Error serving image', { error: error.message });
    try {
      const errorImage = await generateErrorImage('Processing error');
      res.type('image/png');
      res.send(errorImage);
    } catch (e) {
      res.status(500).json({ error: 'Failed to generate image' });
    }
  }
});

/**
 * GET /image/current
 * Returns the currently cached processed image without selecting a new one.
 */
app.get('/image/current', async (req, res) => {
  try {
    const cached = getCurrentImage();

    if (!cached) {
      // No cached image, generate one
      const photos = await getPhotos();
      if (photos.length === 0) {
        const errorImage = await generateErrorImage('No photos in album');
        res.type('image/png');
        return res.send(errorImage);
      }

      const photo = pickPhoto(photos);
      if (!photo) {
        const errorImage = await generateErrorImage('Failed to select photo');
        res.type('image/png');
        return res.send(errorImage);
      }

      const result = await processImage(photo);
      res.type('image/png');
      return res.send(result.buffer);
    }

    res.type('image/png');
    res.send(cached.buffer);
  } catch (error) {
    logger.error('Error serving current image', { error: error.message });
    try {
      const errorImage = await generateErrorImage('Error');
      res.type('image/png');
      res.send(errorImage);
    } catch (e) {
      res.status(500).json({ error: 'Failed to generate image' });
    }
  }
});

/**
 * GET /preview
 * Returns an HTML page showing the current image with metadata.
 *
 * Query params:
 *   refresh=N - Auto-refresh the page every N seconds
 */
app.get('/preview', async (req, res) => {
  const autoRefresh = parseInt(req.query.refresh) || 0;
  const cached = getCurrentImage();

  const metadata = cached?.metadata || {};
  const timestamp = metadata.timestamp
    ? metadata.timestamp.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown date';

  const processedAt = metadata.processedAt
    ? metadata.processedAt.toLocaleString()
    : 'Never';

  const refreshMeta = autoRefresh
    ? `<meta http-equiv="refresh" content="${autoRefresh}">`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${refreshMeta}
  <title>E-Paper Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a1a;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 20px;
      color: #888;
    }
    .preview-container {
      background: #000;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    img {
      display: block;
      max-width: 100%;
      height: auto;
      image-rendering: pixelated;
    }
    .metadata {
      margin-top: 20px;
      padding: 15px 20px;
      background: #2a2a2a;
      border-radius: 8px;
      font-size: 0.9rem;
    }
    .metadata p {
      margin: 5px 0;
      color: #aaa;
    }
    .metadata strong {
      color: #fff;
    }
    .actions {
      margin-top: 20px;
      display: flex;
      gap: 10px;
    }
    a.button {
      padding: 10px 20px;
      background: #333;
      color: #fff;
      text-decoration: none;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    a.button:hover {
      background: #444;
    }
    a.button.primary {
      background: #0066cc;
    }
    a.button.primary:hover {
      background: #0077ee;
    }
  </style>
</head>
<body>
  <h1>E-Paper Display Preview</h1>
  <div class="preview-container">
    <img src="/image/current" alt="Current display image" width="800" height="480">
  </div>
  <div class="metadata">
    <p><strong>Photo date:</strong> ${timestamp}</p>
    <p><strong>Processed at:</strong> ${processedAt}</p>
    <p><strong>Dithered:</strong> ${metadata.dithered ? 'Yes' : 'No'}</p>
    <p><strong>Dimensions:</strong> ${metadata.width || 800} × ${metadata.height || 480}</p>
  </div>
  <div class="actions">
    <a href="/previous" class="button" id="prevBtn">← Previous</a>
    <a href="/next" class="button primary">Next →</a>
  </div>
  <div class="actions">
    <a href="/preview${autoRefresh ? '' : '?refresh=30'}" class="button">
      ${autoRefresh ? 'Stop' : 'Start'} Auto-refresh
    </a>
    <a href="/health" class="button">Health Status</a>
  </div>
  <script>
    // Update navigation buttons to reload page after action
    document.querySelectorAll('.actions a[href="/previous"], .actions a[href="/next"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await fetch(btn.getAttribute('href'));
        location.reload();
      });
    });
  </script>
</body>
</html>
  `.trim();

  res.type('html');
  res.send(html);
});

/**
 * GET /health
 * Returns JSON with server status information.
 */
app.get('/health', async (req, res) => {
  const cacheStatus = getCacheStatus();
  const historyStatus = getHistoryStatus();

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
      recentThresholdDays: config.recentThresholdDays,
      recentWeight: config.recentWeight,
      oldWeight: config.oldWeight,
      albumRefreshIntervalMinutes: config.albumRefreshIntervalMinutes,
      ditherEnabled: config.ditherEnabled,
    },
  });
});

/**
 * GET /next
 * Navigate to the next image.
 * If at end of history, picks a new random image.
 */
app.get('/next', async (req, res) => {
  try {
    const raw = req.query.raw === '1';

    // Try to get next from history
    let photo = getNextPhoto();

    // If at end of history, pick a new random photo
    if (!photo) {
      const photos = await getPhotos();
      if (photos.length === 0) {
        const errorImage = await generateErrorImage('No photos in album');
        res.type('image/png');
        return res.send(errorImage);
      }

      photo = pickPhoto(photos);
    }

    if (!photo) {
      const errorImage = await generateErrorImage('Failed to select photo');
      res.type('image/png');
      return res.send(errorImage);
    }

    const result = await processImage(photo, { raw });
    res.type('image/png');
    res.send(result.buffer);
  } catch (error) {
    logger.error('Error serving next image', { error: error.message });
    try {
      const errorImage = await generateErrorImage('Processing error');
      res.type('image/png');
      res.send(errorImage);
    } catch (e) {
      res.status(500).json({ error: 'Failed to generate image' });
    }
  }
});

/**
 * GET /previous
 * Navigate to the previous image in history.
 * Returns error if at beginning of history.
 */
app.get('/previous', async (req, res) => {
  try {
    const raw = req.query.raw === '1';

    const photo = getPreviousPhoto();

    if (!photo) {
      // At beginning of history - return current image with a hint
      logger.info('At beginning of navigation history');
      const cached = getCurrentImage();
      if (cached) {
        res.type('image/png');
        return res.send(cached.buffer);
      }
      const errorImage = await generateErrorImage('No previous image');
      res.type('image/png');
      return res.send(errorImage);
    }

    const result = await processImage(photo, { raw });
    res.type('image/png');
    res.send(result.buffer);
  } catch (error) {
    logger.error('Error serving previous image', { error: error.message });
    try {
      const errorImage = await generateErrorImage('Processing error');
      res.type('image/png');
      res.send(errorImage);
    } catch (e) {
      res.status(500).json({ error: 'Failed to generate image' });
    }
  }
});

/**
 * GET /navigation
 * Returns JSON with navigation status (for button state feedback).
 */
app.get('/navigation', (req, res) => {
  const navStatus = getNavigationStatus();
  res.json({
    canGoPrevious: navStatus.canGoPrevious,
    canGoNext: true, // Can always go next (will pick new random)
    historyIndex: navStatus.index,
    historyTotal: navStatus.total,
  });
});

/**
 * POST /refresh-album
 * Force refresh the album photo list cache.
 */
app.post('/refresh-album', async (req, res) => {
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
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Start the server.
 */
async function start() {
  // Validate configuration
  const errors = validateConfig();
  if (errors.length > 0) {
    logger.error('Configuration errors', { errors });
    process.exit(1);
  }

  logger.info('Starting server', {
    port: config.port,
    host: config.host,
    albumUrl: config.albumUrl.substring(0, 40) + '...',
  });

  // Initial album fetch
  try {
    await refreshAlbum();
  } catch (error) {
    logger.error('Failed initial album fetch', { error: error.message });
    logger.warn('Server will start but may not have photos until album is accessible');
  }

  // Start auto-refresh
  startAutoRefresh();

  // Start HTTP server
  app.listen(config.port, config.host, () => {
    logger.info(`Server listening on http://${config.host}:${config.port}`);
    logger.info('Endpoints:');
    logger.info('  GET  /image         - Get processed random image');
    logger.info('  GET  /image/current - Get current cached image');
    logger.info('  GET  /next          - Navigate to next image (for button)');
    logger.info('  GET  /previous      - Navigate to previous image (for button)');
    logger.info('  GET  /navigation    - Get navigation status JSON');
    logger.info('  GET  /preview       - HTML preview page');
    logger.info('  GET  /health        - Server health status');
    logger.info('  POST /refresh-album - Force refresh album cache');
  });
}

start().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
