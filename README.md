# Inkframe

A Node.js server that serves optimized images from a Google Photos shared album for display on the Seeed Studio reTerminal E1002 (7.3" 6-color ACeP e-paper display, 800×480 resolution).

## Features

- **Google Photos Integration**: Scrapes public shared albums without requiring API keys
- **Smart Image Selection**: Weighted random selection favoring recent photos, with history tracking to avoid repetition
- **E-Paper Optimization**: Full image processing pipeline with color quantization and Floyd-Steinberg dithering for the 6-color ACeP palette
- **Simple API**: REST endpoints for fetching images, previewing, and monitoring
- **Physical Button Support**: Navigate through images using the reTerminal's hardware buttons
- **Docker Support**: Ready to deploy with Docker and docker-compose

## Quick Start with Docker

1. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Add your Google Photos shared album URL to `.env`:
   ```
   GOOGLE_PHOTOS_ALBUM_URL=https://photos.app.goo.gl/your-album-id
   ```

3. Start the server:
   ```bash
   docker-compose up -d
   ```

4. Open the preview page: http://localhost:3000/preview

## Manual Setup

### Requirements

- Node.js 20+
- npm

### Installation

```bash
npm install
```

### Configuration

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Set at minimum the `GOOGLE_PHOTOS_ALBUM_URL` variable.

### Running

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Getting a Google Photos Shared Album URL

1. Open Google Photos on the web
2. Go to **Albums** and select or create an album
3. Click the **Share** button (icon with person and +)
4. Click **Create link**
5. Copy the link (format: `https://photos.app.goo.gl/xxxxx`)

**Note**: The album must be shared with a link. Private albums won't work.

## API Reference

### GET /image

Returns a processed random image optimized for the e-paper display.

**Query Parameters:**
- `raw=1` - Skip dithering, return quantized image only
- `refresh=1` - Force select a new image (bypass cache)

**Response:** PNG image (800×480)

### GET /image/current

Returns the currently cached image without selecting a new one.

**Response:** PNG image (800×480)

### GET /next

Navigate to the next image. If at the end of navigation history, picks a new random image.
Use this endpoint for the "next" physical button.

**Query Parameters:**
- `raw=1` - Skip dithering

**Response:** PNG image (800×480)

### GET /previous

Navigate to the previous image in history. Returns current image if at the beginning.
Use this endpoint for the "previous" physical button.

**Query Parameters:**
- `raw=1` - Skip dithering

**Response:** PNG image (800×480)

### GET /navigation

Returns navigation status (useful for checking if previous/next is available).

**Response:**
```json
{
  "canGoPrevious": true,
  "canGoNext": true,
  "historyIndex": 3,
  "historyTotal": 5
}
```

### GET /preview

Returns an HTML page showing the current image with metadata.

**Query Parameters:**
- `refresh=N` - Auto-refresh the page every N seconds

### GET /health

Returns server status information.

**Response:**
```json
{
  "status": "ok",
  "album": {
    "photoCount": 150,
    "lastRefresh": "2024-01-15T10:30:00.000Z",
    "cacheAgeMinutes": 15,
    "isRefreshing": false
  },
  "selection": {
    "historySize": 5,
    "historyMaxSize": 20
  },
  "config": {
    "recentThresholdDays": 90,
    "recentWeight": 80,
    "oldWeight": 20,
    "albumRefreshIntervalMinutes": 60,
    "ditherEnabled": true
  }
}
```

### POST /refresh-album

Force refresh the album photo list cache.

**Response:**
```json
{
  "success": true,
  "photoCount": 150,
  "lastRefresh": "2024-01-15T10:30:00.000Z"
}
```

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_PHOTOS_ALBUM_URL` | *(required)* | Shared album URL |
| `RECENT_THRESHOLD_DAYS` | `90` | Days to consider a photo "recent" |
| `RECENT_WEIGHT` | `80` | Percentage chance to pick a recent photo |
| `OLD_WEIGHT` | `20` | Percentage chance to pick an older photo |
| `HISTORY_SIZE` | `20` | Number of recently shown images to track |
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |
| `ALBUM_REFRESH_INTERVAL_MINUTES` | `60` | How often to refresh the photo list |
| `IMAGE_CACHE_ENABLED` | `true` | Cache processed images between requests |
| `DITHER_ENABLED` | `true` | Apply Floyd-Steinberg dithering |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

## SenseCraft HMI Setup

To display images on the reTerminal E1002:

### Option 1: Web Function

1. In SenseCraft HMI, add a **Web** widget
2. Set the URL to `http://YOUR_SERVER_IP:3000/image`
3. Configure refresh interval as needed

### Option 2: Gallery Function

1. Configure the gallery to fetch from a URL
2. Use `http://YOUR_SERVER_IP:3000/image/current` for static display
3. Use `http://YOUR_SERVER_IP:3000/image` to get a new image on each refresh

## Physical Button Setup

The reTerminal has 4 programmable buttons (F1-F4). You can configure them to navigate through images:

### Button Configuration

Map the buttons to make HTTP requests to the server:

| Button | Action | Endpoint |
|--------|--------|----------|
| F1 | Previous image | `GET http://YOUR_SERVER_IP:3000/previous` |
| F2 | Next image | `GET http://YOUR_SERVER_IP:3000/next` |
| F3 | Random image | `GET http://YOUR_SERVER_IP:3000/image?refresh=1` |
| F4 | (optional) | Refresh album: `POST http://YOUR_SERVER_IP:3000/refresh-album` |

### Example: Using curl in a button script

Create scripts that the buttons can execute:

```bash
# /usr/local/bin/photo-previous.sh
#!/bin/bash
curl -s http://localhost:3000/previous > /dev/null
# Trigger display refresh if needed

# /usr/local/bin/photo-next.sh
#!/bin/bash
curl -s http://localhost:3000/next > /dev/null
# Trigger display refresh if needed
```

### Navigation Behavior

- **Next**: Shows next image from history, or picks a new random image if at the end
- **Previous**: Goes back through previously shown images
- Navigation history stores up to 40 images (2× HISTORY_SIZE)
- The `/navigation` endpoint returns JSON with current position for status displays

## Image Processing Pipeline

1. **URL Optimization**: Uses Google's URL parameters to pre-scale images server-side
2. **Resize**: Scale to 800×480 with center crop using Sharp
3. **Color Quantization**: Map pixels to the 6-color ACeP palette (black, white, red, green, blue, yellow)
4. **Floyd-Steinberg Dithering**: Distribute quantization error to neighboring pixels for better visual quality

The dithering can be disabled for faster processing or to see the effect of pure quantization.

## Troubleshooting

### No photos found in album

- Verify the album is shared with a link (not just with specific people)
- Check if the album URL is accessible in a browser
- The album page structure may have changed; check for updates

### Images look wrong

- Ensure `DITHER_ENABLED=true` for best quality
- The 6-color palette is limited; some photos will look better than others
- Photos with high contrast and solid colors work best

### Server fails to start

- Check that `GOOGLE_PHOTOS_ALBUM_URL` is set
- Verify `RECENT_WEIGHT + OLD_WEIGHT = 100`
- Check logs for specific error messages

### Memory issues with large albums

- Albums with thousands of photos are supported but may use more memory
- The server only stores metadata, not the actual images
- Processed images are cached but can be disabled with `IMAGE_CACHE_ENABLED=false`

## Development

### Running Tests

```bash
npm test
```

### Project Structure

```
inkframe/
├── src/
│   ├── index.js              # Express server and routes
│   ├── config.js             # Environment configuration
│   ├── album/
│   │   ├── fetcher.js        # Google Photos scraping
│   │   └── cache.js          # Album metadata cache
│   ├── selection/
│   │   └── picker.js         # Weighted random selection
│   ├── processing/
│   │   ├── pipeline.js       # Main processing pipeline
│   │   ├── resize.js         # Image resizing with Sharp
│   │   ├── quantize.js       # 6-color palette quantization
│   │   └── dither.js         # Floyd-Steinberg dithering
│   └── utils/
│       └── logger.js         # Logging utility
├── test/                     # Unit tests
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## License

MIT
