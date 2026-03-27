import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config, { validateConfig } from './config.js';
import logger from './utils/logger.js';
import { refresh as refreshAlbum, startAutoRefresh, getCacheStatus } from './album/cache.js';
import { imageErrorHandler } from './middleware/errorHandler.js';
import imageRoutes from './routes/images.js';
import previewRoutes from './routes/preview.js';
import statusRoutes from './routes/status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// API routes mounted under /{PATH_SECRET}/
app.use(`/${config.pathSecret}`, imageRoutes);
app.use(`/${config.pathSecret}`, previewRoutes);
app.use(`/${config.pathSecret}`, statusRoutes);

// Centralized error handler
app.use(`/${config.pathSecret}`, imageErrorHandler);

// Health check at root (no secret required) for Docker healthcheck
app.get('/health', async (req, res) => {
  const cacheStatus = getCacheStatus();
  res.json({ status: 'ok', photoCount: cacheStatus.photoCount });
});

// Serve the Vite-built client under /{PATH_SECRET}/preview/
// This keeps the admin UI gated behind the same secret as the API.
if (process.env.NODE_ENV === 'production') {
  const clientDist = join(__dirname, '..', 'client', 'dist');
  app.use(`/${config.pathSecret}/preview`, express.static(clientDist));

  // SPA fallback for the preview routes only
  app.get(`/${config.pathSecret}/preview/*`, (req, res) => {
    res.sendFile(join(clientDist, 'index.html'), (err) => {
      if (err) {
        logger.error('Failed to serve preview UI', { error: err.message });
        res.status(500).send('Preview UI unavailable — client build may be missing');
      }
    });
  });
}

// Reject all other requests
app.use((req, res) => {
  res.status(404).send('Not found');
});

async function start() {
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

  try {
    await refreshAlbum();
  } catch (error) {
    logger.error('Failed initial album fetch', { error: error.message });
    logger.warn('Server will start but may not have photos until album is accessible');
  }

  startAutoRefresh();

  app.listen(config.port, config.host, () => {
    logger.info(`Server listening on http://${config.host}:${config.port}`);
  });

  logger.info('Endpoints (prefixed with PATH_SECRET):');
  logger.info(`  GET  ${base}/image          - Get processed random image`);
  logger.info(`  GET  ${base}/image/current  - Get current cached image`);
  logger.info(`  POST ${base}/next           - Navigate to next image`);
  logger.info(`  POST ${base}/previous       - Navigate to previous image`);
  logger.info(`  GET  ${base}/preview/meta   - Image metadata (JSON)`);
  logger.info(`  GET  ${base}/health         - Server health status`);
  if (process.env.NODE_ENV === 'production') {
    logger.info(`  GET  ${base}/preview/        - Admin preview UI`);
  }
}

start().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
