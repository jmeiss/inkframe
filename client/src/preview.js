const pathSegments = window.location.pathname.split('/').filter(Boolean);
const base = pathSegments[0] && pathSegments[1] === 'preview'
  ? `/${pathSegments[0]}`
  : import.meta.env.VITE_PATH_SECRET ? `/${import.meta.env.VITE_PATH_SECRET}` : '';

const img = document.getElementById('display-image');
const prevImage = document.getElementById('prev-image');
const nextImage = document.getElementById('next-image');
const prevThumb = document.getElementById('prev-thumb');
const nextThumb = document.getElementById('next-thumb');
const healthLink = document.getElementById('health-link');
const autoRefreshBtn = document.getElementById('auto-refresh-btn');

let autoRefreshInterval = null;
let nextPollTimer = null;

healthLink.href = `${base}/health`;

function loadImage() {
  img.onload = loadMeta;
  img.src = `${base}/image/current?t=${Date.now()}`;
}

async function loadMeta() {
  try {
    const res = await fetch(`${base}/preview/meta`);
    if (!res.ok) return;
    const meta = await res.json();
    document.getElementById('meta-timestamp').textContent = meta.timestamp || 'Unknown date';
    document.getElementById('meta-processed-at').textContent = meta.processedAt || 'Never';
    document.getElementById('meta-dithered').textContent = meta.dithered ? 'Yes' : 'No';
    document.getElementById('meta-dimensions').textContent =
      `${meta.width || 800} × ${meta.height || 480}`;
  } catch (err) {
    console.warn('Failed to load metadata:', err);
  }
}

async function loadPrevThumb() {
  try {
    const res = await fetch(`${base}/image/peek/previous?t=${Date.now()}`);
    if (res.status === 204 || !res.ok) {
      prevThumb.classList.add('empty');
      prevImage.src = '';
    } else {
      const blob = await res.blob();
      if (prevImage.src) URL.revokeObjectURL(prevImage.src);
      prevImage.src = URL.createObjectURL(blob);
      prevThumb.classList.remove('empty');
    }
  } catch (err) {
    prevThumb.classList.add('empty');
  }
}

async function loadNextThumb() {
  clearTimeout(nextPollTimer);
  try {
    const res = await fetch(`${base}/image/peek/next?t=${Date.now()}`);
    if (res.status === 204 || !res.ok) {
      nextThumb.classList.add('empty');
      nextImage.src = '';
      // Not ready yet — poll until the background prefetch finishes
      nextPollTimer = setTimeout(loadNextThumb, 2000);
    } else {
      const blob = await res.blob();
      if (nextImage.src) URL.revokeObjectURL(nextImage.src);
      nextImage.src = URL.createObjectURL(blob);
      nextThumb.classList.remove('empty');
    }
  } catch (err) {
    nextThumb.classList.add('empty');
  }
}

async function navigate(direction) {
  const res = await fetch(`${base}/${direction}`, { method: 'POST' });
  if (!res.ok) {
    console.warn(`Navigation failed: ${res.status}`);
    return;
  }
  loadImage();
  loadPrevThumb();
  loadNextThumb();
}

// Clicking a thumbnail navigates to it
[prevThumb, nextThumb].forEach(thumb => {
  thumb.addEventListener('click', () => {
    if (thumb.classList.contains('empty')) return;
    navigate(thumb.dataset.nav);
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
loadImage(); // loadMeta fires via img.onload
loadPrevThumb();
loadNextThumb();
