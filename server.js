const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5500;

// --- Volume-backed asset storage ---
// Images downloaded from external APIs are persisted to /data/assets/
// so they survive MiniMax CDN expiry and deployment restarts.
const ASSETS_DIR = process.env.ASSETS_DIR || path.join(__dirname, 'data', 'assets');

// Ensure the directory exists (idempotent)
function ensureAssetsDir() {
  try { fs.mkdirSync(ASSETS_DIR, { recursive: true }); } catch (e) { /* exists */ }
}
ensureAssetsDir();

// POST /api/asset — download an external image and store it locally.
// Body: { url: "https://..." }
// Returns: { id: "abc123.png", url: "/api/asset/abc123.png" }
app.post('/api/asset', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });

    // Generate a stable filename from the URL hash
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const ext = url.match(/\.(png|jpg|jpeg|webp)(\?|$)/i)?.[1] || 'png';
    const filename = hash + '.' + ext;
    const filepath = path.join(ASSETS_DIR, filename);

    // If already cached on disk, return it directly
    if (fs.existsSync(filepath)) {
      return res.json({ id: filename, url: '/api/asset/' + filename, cached: true });
    }

    // Download from external source
    const resp = await fetch(url);
    if (!resp.ok) return res.status(502).json({ error: 'download failed', status: resp.status });

    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(filepath, buf);

    console.log('[asset] stored ' + filename + ' (' + (buf.length / 1024).toFixed(1) + ' KB)');
    res.json({ id: filename, url: '/api/asset/' + filename, cached: false });
  } catch (e) {
    console.error('[asset] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/asset/:id — serve a stored asset
app.get('/api/asset/:id', (req, res) => {
  const filepath = path.join(ASSETS_DIR, req.params.id);
  // Prevent directory traversal
  if (!filepath.startsWith(ASSETS_DIR)) return res.status(403).end();
  if (!fs.existsSync(filepath)) return res.status(404).end();
  res.sendFile(filepath);
});

// Serve static files from dreamread/ subdirectory
app.use(express.static(path.join(__dirname, 'dreamread')));

// Expose server-configured secrets so the frontend can use them as defaults.
app.get('/api/config', (_req, res) => {
  const env = (k) => {
    const val = process.env[k];
    if (val === '-' || val === undefined || val === '') return '';
    return val;
  };
  res.json({
    llm_base:  env('LLM_BASE_URL'),
    llm_key:   env('LLM_API_KEY'),
    llm_model: env('LLM_MODEL'),
    mm_img:    env('MM_IMG_KEY'),
    mm_voice:  env('MM_VOICE_KEY')
  });
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dreamread', 'index.html'));
});

app.listen(PORT, () => {
  console.log('活页 Folio on port ' + PORT);
  console.log('[asset] dir:', ASSETS_DIR);
});
