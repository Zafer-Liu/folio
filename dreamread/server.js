const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5500;

// Static files from current directory
app.use(express.static(__dirname));

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
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('活页 Folio on port ' + PORT);
});
