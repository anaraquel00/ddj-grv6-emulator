const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

app.get('/api/proxy/audio', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url param');
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
    });
    res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');
    response.data.pipe(res);
  } catch (err) {
    res.status(500).send('Proxy error: ' + err);
  }
});

app.listen(5000, () => {
  console.log('Proxy server running on http://localhost:5000');
});
