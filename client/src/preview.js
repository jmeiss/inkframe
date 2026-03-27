// Derive the PATH_SECRET from the current URL.
// In production: served at /{secret}/ui/ — extract the secret segment.
// In dev: Vite proxy handles routing, use VITE_PATH_SECRET env var.
const pathSegments = window.location.pathname.split('/').filter(Boolean);
const base = pathSegments[0] && pathSegments[1] === 'preview'
  ? `/${pathSegments[0]}`
  : import.meta.env.VITE_PATH_SECRET ? `/${import.meta.env.VITE_PATH_SECRET}` : '';

const img = document.getElementById('display-image');
const healthLink = document.getElementById('health-link');
const autoRefreshBtn = document.getElementById('auto-refresh-btn');

let autoRefreshInterval = null;

// Set up links that need the PATH_SECRET
healthLink.href = `${base}/health`;

// Load current image
function loadImage() {
  img.src = `${base}/image/current?t=${Date.now()}`;
}

// Fetch and display metadata
async function loadMeta() {
  try {
    const res = await fetch(`${base}/preview/meta`);
    if (!res.ok) {
      console.warn(`Metadata fetch failed: ${res.status}`);
      return;
    }
    const meta = await res.json();

    document.getElementById('meta-timestamp').textContent = meta.timestamp || 'Unknown date';
    document.getElementById('meta-processed-at').textContent = meta.processedAt || 'Never';
    document.getElementById('meta-dithered').textContent = meta.dithered ? 'Yes' : 'No';
    document.getElementById('meta-dimensions').textContent =
      `${meta.width || 800} \u00d7 ${meta.height || 480}`;
  } catch (err) {
    console.warn('Failed to load metadata:', err);
  }
}

// Navigation buttons
document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const res = await fetch(`${base}/${btn.dataset.nav}`, { method: 'POST' });
      if (res.ok) {
        loadImage();
        // Wait a bit for processing to finish before refreshing metadata
        setTimeout(loadMeta, 500);
      } else {
        console.warn(`Navigation failed: ${res.status}`);
      }
    } finally {
      btn.disabled = false;
    }
  });
});

// Auto-refresh toggle
autoRefreshBtn.addEventListener('click', () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    autoRefreshBtn.textContent = 'Start Auto-refresh';
  } else {
    autoRefreshInterval = setInterval(() => {
      loadImage();
      loadMeta();
    }, 30000);
    autoRefreshBtn.textContent = 'Stop Auto-refresh';
  }
});

// Initial load
loadImage();
loadMeta();
