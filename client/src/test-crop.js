// Derive the PATH_SECRET from the current URL (same logic as preview.js)
const pathSegments = window.location.pathname.split('/').filter(Boolean);
const base = pathSegments[0] && pathSegments[1] === 'preview'
  ? `/${pathSegments[0]}`
  : import.meta.env.VITE_PATH_SECRET ? `/${import.meta.env.VITE_PATH_SECRET}` : '';

const CROP_POSITIONS = ['center', 'attention', 'entropy', 'north', 'south', 'east', 'west'];

const grid = document.getElementById('crop-grid');
const dateEl = document.getElementById('photo-date');
const loadNewBtn = document.getElementById('load-new');

async function loadCrops() {
  // Fetch metadata for the photo date
  try {
    const res = await fetch(`${base}/preview/meta`);
    if (res.ok) {
      const meta = await res.json();
      dateEl.textContent = `Photo date: ${meta.timestamp || 'Unknown'}`;
    }
  } catch (err) {
    console.warn('Failed to load metadata:', err);
    dateEl.textContent = 'Photo date: could not load';
  }

  // Build crop cards
  grid.innerHTML = CROP_POSITIONS.map((pos, i) => `
    <div class="crop-card">
      <h2>${pos}</h2>
      <img src="${base}/test-crop/image?position=${pos}&t=${Date.now()}-${pos}" alt="${pos} crop">
    </div>
  `).join('');
}

loadNewBtn.addEventListener('click', async () => {
  loadNewBtn.disabled = true;
  loadNewBtn.textContent = 'Loading...';
  try {
    const res = await fetch(`${base}/image?refresh=1`);
    if (res.ok) {
      loadCrops();
    } else {
      console.warn(`Refresh failed: ${res.status}`);
    }
  } finally {
    loadNewBtn.disabled = false;
    loadNewBtn.textContent = 'Load New Photo';
  }
});

loadCrops();
