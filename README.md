# Inkframe

A Node.js server that serves optimized images from a Google Photos shared album for display on the Seeed Studio reTerminal E1002 (7.3" 6-color ACeP e-paper display, 800×480 resolution).

## Features

- **Google Photos Integration**: Scrapes public shared albums without requiring API keys
- **Smart Image Selection**: Weighted random selection favoring recent photos, with history tracking to avoid repetition
- **"On This Day" Feature**: Highlights photos from the same day in previous years
- **Date & Countdown Overlays**: Shows photo date and optional countdown to a target date
- **E-Paper Optimization**: Full image processing pipeline with smart cropping and optional Floyd-Steinberg dithering for the 6-color ACeP palette
- **Simple API**: REST endpoints for fetching images, navigation, previewing, and monitoring

## Setup

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

Set at minimum the `GOOGLE_PHOTOS_ALBUM_URL` and `PATH_SECRET` variables:

```bash
# Generate a secret token
openssl rand -hex 16
```

All API routes are prefixed with the secret (e.g., `/{PATH_SECRET}/image`), so endpoints are not discoverable without it.

### Running

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### Running as a Service (macOS)

```bash
npm run service:start    # Start the service
npm run service:stop     # Stop the service
npm run service:restart  # Restart the service
npm run service:status   # Check status
```

## Getting a Google Photos Shared Album URL

1. Open Google Photos on the web
2. Go to **Albums** and select or create an album
3. Click the **Share** button (icon with person and +)
4. Click **Create link**
5. Copy the link (format: `https://photos.app.goo.gl/xxxxx`)

**Note**: The album must be shared with a link. Private albums won't work.

## API Endpoints

All endpoints are prefixed with `/{PATH_SECRET}`. For example, if your secret is `abc123`, the image endpoint is `/abc123/image`.

### GET /{secret}/image

Returns a processed random image optimized for the e-paper display.

**Query Parameters:**
- `raw=1` - Skip dithering, return resized image only
- `refresh=1` - Force select a new image (bypass cache)
- `crop=X` - Crop strategy: `center`, `attention`, `entropy`, `north`, `south`, `east`, `west`

**Response:** PNG image (800×480)

### GET /{secret}/image/current

Returns the currently cached image without selecting a new one.

**Response:** PNG image (800×480)

### GET /{secret}/next

Navigate to the next image. If at the end of navigation history, picks a new random image.

**Query Parameters:**
- `raw=1` - Skip dithering

**Response:** PNG image (800×480)

### GET /{secret}/previous

Navigate to the previous image in history. Returns current image if at the beginning.

**Query Parameters:**
- `raw=1` - Skip dithering

**Response:** PNG image (800×480)

### GET /{secret}/navigation

Returns navigation status as JSON.

**Response:**
```json
{
  "canGoPrevious": true,
  "canGoNext": true,
  "historyIndex": 3,
  "historyTotal": 5
}
```

### GET /{secret}/preview

HTML page showing the current image with metadata and navigation buttons.

**Query Parameters:**
- `refresh=N` - Auto-refresh the page every N seconds

### GET /{secret}/test-crop

HTML page showing the current photo with all 7 crop strategies side-by-side for comparison.

### GET /{secret}/health

Returns server status information as JSON.

**Response:**
```json
{
  "status": "ok",
  "album": {
    "photoCount": 150,
    "lastRefresh": "2026-01-23T10:30:00.000Z",
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

### POST /{secret}/refresh-album

Force refresh the album photo list cache.

**Response:**
```json
{
  "success": true,
  "photoCount": 150,
  "lastRefresh": "2026-01-23T10:30:00.000Z"
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_PHOTOS_ALBUM_URL` | *(required)* | Shared album URL |
| `PATH_SECRET` | *(required)* | Secret token prefixed to all routes |
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |
| `RECENT_THRESHOLD_DAYS` | `90` | Days to consider a photo "recent" |
| `RECENT_WEIGHT` | `80` | Percentage chance to pick a recent photo |
| `OLD_WEIGHT` | `20` | Percentage chance to pick an older photo |
| `HISTORY_SIZE` | `20` | Number of recently shown images to track |
| `ALBUM_REFRESH_INTERVAL_MINUTES` | `60` | How often to refresh the photo list |
| `IMAGE_CACHE_ENABLED` | `true` | Cache processed images between requests |
| `DITHER_ENABLED` | `true` | Apply Floyd-Steinberg dithering |
| `DATE_OVERLAY_ENABLED` | `true` | Show photo date at bottom of image |
| `ON_THIS_DAY_ENABLED` | `true` | Prioritize photos from this day in past years |
| `ON_THIS_DAY_WINDOW_DAYS` | `3` | Days before/after to include for "on this day" |
| `COUNTDOWN_DATE` | *(empty)* | Target date for countdown (format: `YYYY-MM-DD`) |
| `COUNTDOWN_LABEL` | `Holidays` | Label shown before countdown |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |

## SenseCraft HMI Setup

To display images on the reTerminal E1002 using SenseCraft HMI:

1. In SenseCraft HMI, add a **Web** page type
2. Set the URL to your server (e.g., `https://your-host/{PATH_SECRET}/image`)
3. Configure the refresh interval as needed

The server will return a new random image on each request to `/{secret}/image`.

**Note**: SenseCraft HMI's physical buttons have fixed behavior (page navigation) and cannot be configured to trigger custom HTTP requests. For button control, you would need to switch to ESPHome firmware.

## Image Processing Pipeline

1. **URL Optimization**: Uses Google's smart crop (`-p`) to pre-crop images server-side
2. **Resize**: Scale to 800×480 using Sharp with attention-based cropping (focuses on faces/subjects)
3. **Overlays**: Add date and optional countdown bar at the bottom
4. **Color Quantization**: Map pixels to the 6-color ACeP palette (black, white, red, green, blue, yellow)
5. **Floyd-Steinberg Dithering**: Distribute quantization error to neighboring pixels for better visual quality

### Crop Strategies

The `crop` parameter controls how images are cropped to fit the display:

- `attention` (default) - Focuses on faces and prominent features
- `entropy` - Focuses on areas with high detail/complexity
- `center` - Simple center crop
- `north`, `south`, `east`, `west` - Crops from a specific edge

Use `/{secret}/test-crop` to compare all strategies on the current photo.

## Troubleshooting

### No photos found in album

- Verify the album is shared with a link (not just with specific people)
- Check if the album URL is accessible in a browser
- The album page structure may have changed; check for updates

### Images look wrong

- Ensure `DITHER_ENABLED=true` for best quality on e-paper
- The 6-color palette is limited; some photos will look better than others
- Photos with high contrast and solid colors work best
- Try different crop strategies if subjects are getting cut off

### Server fails to start

- Check that `GOOGLE_PHOTOS_ALBUM_URL` and `PATH_SECRET` are set
- Verify `RECENT_WEIGHT + OLD_WEIGHT = 100`
- Check logs for specific error messages

## Project Structure

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
└── package.json
```

## License

MIT
