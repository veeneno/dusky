const express = require('express');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

// GET /api/giphy/search?q=termo&type=gifs|stickers — proxy pra API do GIPHY. a api key fica só aqui
// no servidor, nunca é exposta pro navegador (senão qualquer um podia usar sua key direto).
router.get('/search', requireAuth, async (req, res) => {
  if (!config.giphyApiKey) {
    return res.status(503).json({ error: 'GIPHY não configurado no servidor' });
  }

  const kind = req.query.type === 'stickers' ? 'stickers' : 'gifs';
  const q = (req.query.q || '').toString().trim().slice(0, 100);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const endpoint = q
    ? `https://api.giphy.com/v1/${kind}/search?api_key=${encodeURIComponent(config.giphyApiKey)}&q=${encodeURIComponent(q)}&limit=25&offset=${offset}&rating=pg-13&lang=pt`
    : `https://api.giphy.com/v1/${kind}/trending?api_key=${encodeURIComponent(config.giphyApiKey)}&limit=25&offset=${offset}&rating=pg-13`;

  try {
    const giphyRes = await fetch(endpoint);
    if (!giphyRes.ok) throw new Error(`HTTP ${giphyRes.status}`);
    const data = await giphyRes.json();

    const gifs = (data.data || []).map((g) => ({
      id: g.id,
      title: g.title || '',
      preview: (g.images.fixed_width_small || g.images.fixed_width || g.images.original).url,
      url: g.images.original.url,
      width: Number(g.images.original.width) || null,
      height: Number(g.images.original.height) || null,
    }));

    res.json({ gifs });
  } catch (err) {
    console.error('[giphy] erro na busca:', err.message);
    res.status(502).json({ error: 'não deu pra buscar gifs agora' });
  }
});

module.exports = router;
