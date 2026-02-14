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
} from './selection/picker.js';
import { processImage, getCurrentImage, generateErrorImage } from './processing/pipeline.js';
import { VALID_POSITIONS } from './processing/resize.js';

const app = express();

// All routes are mounted under /{PATH_SECRET}/ to prevent unauthorized access
const router = express.Router();

/**
 * GET /image
 * Returns a processed random image optimized for the e-paper display.
 *
 * Query params:
 *   raw=1     - Skip dithering, return resized image only
 *   refresh=1 - Force select a new image (don't serve cached)
 *   crop=X    - Crop strategy: center, attention, entropy, north, south, east, west
 */
router.get('/image', async (req, res) => {
  try {
    const raw = req.query.raw === '1';
    const forceRefresh = req.query.refresh === '1';
    const crop = req.query.crop;

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
    const result = await processImage(photo, { raw, crop });

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
router.get('/image/current', async (req, res) => {
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
router.get('/preview', async (req, res) => {
  const autoRefresh = parseInt(req.query.refresh) || 0;
  const cached = getCurrentImage();
  const base = `/${config.pathSecret}`;

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
    <img src="${base}/image/current" alt="Current display image" width="800" height="480">
  </div>
  <div class="metadata">
    <p><strong>Photo date:</strong> ${timestamp}</p>
    <p><strong>Processed at:</strong> ${processedAt}</p>
    <p><strong>Dithered:</strong> ${metadata.dithered ? 'Yes' : 'No'}</p>
    <p><strong>Dimensions:</strong> ${metadata.width || 800} &times; ${metadata.height || 480}</p>
  </div>
  <div class="actions">
    <a href="${base}/previous" class="button" id="prevBtn">&larr; Previous</a>
    <a href="${base}/next" class="button primary">Next &rarr;</a>
  </div>
  <div class="actions">
    <a href="${base}/preview${autoRefresh ? '' : '?refresh=30'}" class="button">
      ${autoRefresh ? 'Stop' : 'Start'} Auto-refresh
    </a>
    <a href="${base}/health" class="button">Health Status</a>
  </div>
  <script>
    const base = '${base}';
    document.querySelectorAll('.actions a[href="' + base + '/previous"], .actions a[href="' + base + '/next"]').forEach(btn => {
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
 * GET /test-crop
 * Returns an HTML page showing the current photo with all crop strategies side-by-side.
 * Useful for comparing how different crop algorithms handle the same image.
 */
router.get('/test-crop', async (req, res) => {
  const cached = getCurrentImage();
  const base = `/${config.pathSecret}`;

  if (!cached || !cached.metadata?.photoUrl) {
    res.status(400).send(`No current image. Visit ${base}/image first to load a photo.`);
    return;
  }

  const timestamp = cached.metadata?.timestamp
    ? cached.metadata.timestamp.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown date';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crop Strategy Comparison</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a1a;
      color: #fff;
      padding: 20px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 10px;
      color: #888;
    }
    .info {
      color: #666;
      margin-bottom: 20px;
      font-size: 0.9rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
    }
    .crop-card {
      background: #2a2a2a;
      border-radius: 8px;
      overflow: hidden;
    }
    .crop-card h2 {
      padding: 10px 15px;
      font-size: 1rem;
      background: #333;
      border-bottom: 1px solid #444;
    }
    .crop-card img {
      display: block;
      width: 100%;
      height: auto;
      image-rendering: pixelated;
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
  <h1>Crop Strategy Comparison</h1>
  <p class="info">Photo date: ${timestamp}</p>
  <div class="grid">
    ${VALID_POSITIONS.map((pos, i) => `
      <div class="crop-card">
        <h2>${pos}</h2>
        <img src="${base}/test-crop/image?position=${pos}&t=${Date.now() + i}" alt="${pos} crop">
      </div>
    `).join('')}
  </div>
  <div class="actions">
    <a href="${base}/image?refresh=1" class="button primary" onclick="setTimeout(() => location.reload(), 500); return true;">Load New Photo</a>
    <a href="${base}/preview" class="button">Back to Preview</a>
  </div>
</body>
</html>
  `.trim();

  res.type('html');
  res.send(html);
});

/**
 * GET /test-crop/image
 * Returns the current photo processed with a specific crop position.
 * Used by the /test-crop comparison page.
 */
router.get('/test-crop/image', async (req, res) => {
  try {
    const cached = getCurrentImage();

    if (!cached || !cached.metadata?.photoUrl) {
      const errorImage = await generateErrorImage('No photo loaded');
      res.type('image/png');
      return res.send(errorImage);
    }

    const position = req.query.position || 'entropy';

    // Re-process the same photo with the specified crop position
    const photo = {
      url: cached.metadata.photoUrl,
      timestamp: cached.metadata.timestamp,
    };

    const result = await processImage(photo, { raw: true, crop: position, skipCache: true });
    res.set('Cache-Control', 'no-store');
    res.type('image/png');
    res.send(result.buffer);
  } catch (error) {
    logger.error('Error serving test-crop image', { error: error.message });
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
 * GET /health
 * Returns JSON with server status information.
 */
router.get('/health', async (req, res) => {
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
      timeBuckets: config.timeBuckets.map(b => ({
        maxDays: b.maxDays === Infinity ? 'older' : `≤${b.maxDays}d`,
        weight: b.weight,
      })),
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
router.get('/next', async (req, res) => {
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
router.get('/previous', async (req, res) => {
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
router.get('/navigation', (req, res) => {
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
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Mount all routes under the secret prefix
app.use(`/${config.pathSecret}`, router);

// Reject all other requests
app.use((req, res) => {
  res.status(404).send('Not found');
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

  const base = `/${config.pathSecret}`;

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
  });

  logger.info('Endpoints (prefixed with PATH_SECRET):');
  logger.info(`  GET  ${base}/image         - Get processed random image`);
  logger.info(`  GET  ${base}/image/current - Get current cached image`);
  logger.info(`  GET  ${base}/next          - Navigate to next image`);
  logger.info(`  GET  ${base}/previous      - Navigate to previous image`);
  logger.info(`  GET  ${base}/preview       - HTML preview page`);
  logger.info(`  GET  ${base}/health        - Server health status`);
}

start().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
