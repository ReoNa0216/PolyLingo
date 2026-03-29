/**
 * PolyLingo Proxy Server
 * CORS proxy for fetching ZDF news and other German news sources
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'PolyLingo Proxy',
    version: '1.1.0',
    endpoints: [
      '/api/zdf/rss - Get ZDF RSS feed (German)',
      '/api/zdf/article?url=XXX - Get ZDF article content',
      '/api/chinadaily/rss - Get China Daily RSS feed (English)',
      '/api/chinadaily/rss?category=world - Category: world|business|culture|sports|travel',
      '/api/chinadaily/article?url=XXX - Get China Daily article content',
      '/api/proxy?url=XXX - Generic proxy'
    ]
  });
});

// Get ZDF RSS feed
app.get('/api/zdf/rss', async (req, res) => {
  try {
    const rssUrl = 'https://www.zdf.de/rss/zdf/nachrichten';
    const response = await axios.get(rssUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    res.set('Content-Type', 'application/xml');
    res.send(response.data);
  } catch (error) {
    console.error('ZDF RSS Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch ZDF RSS',
      message: error.message 
    });
  }
});

// Get ZDF article content
app.get('/api/zdf/article', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract article content
    const title = $('h1').first().text().trim();
    
    // Try different selectors for article content
    let content = '';
    const contentSelectors = [
      '.zdfplayer-teaser-title', // ZDF specific
      '.zdfplayer-teaser-text',
      'article p',
      '.article-content p',
      '.content p',
      'main p',
      '.body-text p'
    ];
    
    for (const selector of contentSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        content = elements.map((i, el) => $(el).text().trim()).get().join('\n\n');
        if (content.length > 200) break; // Found good content
      }
    }
    
    res.json({
      title,
      content: content.substring(0, 5000), // Limit content length
      url,
      source: 'ZDF'
    });
    
  } catch (error) {
    console.error('Article fetch error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch article',
      message: error.message 
    });
  }
});

// Get China Daily RSS feed
app.get('/api/chinadaily/rss', async (req, res) => {
  try {
    const { category = 'world' } = req.query;
    
    // Available categories: world, business, culture, sports, travel
    const validCategories = ['world', 'business', 'culture', 'sports', 'travel'];
    const cat = validCategories.includes(category) ? category : 'world';
    
    const rssUrl = `https://www.chinadaily.com.cn/rss/${cat}_rss.xml`;
    console.log('Fetching China Daily RSS:', rssUrl);
    
    const response = await axios.get(rssUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.chinadaily.com.cn/'
      },
      // 使用响应编码
      responseEncoding: 'utf8'
    });
    
    console.log('China Daily RSS fetched successfully, size:', response.data.length);
    
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (error) {
    console.error('China Daily RSS Error:', error.message);
    console.error('Error details:', error.response?.status, error.response?.statusText);
    res.status(500).json({ 
      error: 'Failed to fetch China Daily RSS',
      message: error.message,
      status: error.response?.status,
      url: `https://www.chinadaily.com.cn/rss/${req.query.category || 'world'}_rss.xml`
    });
  }
});

// Get China Daily article content
app.get('/api/chinadaily/article', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  console.log('Fetching China Daily article:', url);
  
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      maxRedirects: 5
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract article content
    const title = $('h1').first().text().trim();
    
    // Try different selectors for China Daily article content
    let content = '';
    const contentSelectors = [
      '#Content p',           // China Daily specific
      '.article-content p',
      '#article-content p',
      'article p',
      '.content p',
      '.main-content p',
      '.detail-content p'
    ];
    
    for (const selector of contentSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        content = elements.map((i, el) => $(el).text().trim()).get().join('\n\n');
        if (content.length > 200) break;
      }
    }
    
    // Also try to get summary/description if content is short
    if (content.length < 100) {
      const metaDesc = $('meta[name="description"]').attr('content');
      if (metaDesc) content = metaDesc;
    }
    
    console.log('China Daily article parsed:', { title: title?.substring(0, 50), contentLength: content.length });
    
    res.json({
      title,
      content: content.substring(0, 5000),
      url,
      source: 'China Daily'
    });
    
  } catch (error) {
    console.error('China Daily article fetch error:', error.message);
    console.error('Error details:', error.response?.status, error.response?.statusText);
    res.status(500).json({ 
      error: 'Failed to fetch article',
      message: error.message,
      status: error.response?.status,
      url
    });
  }
});

// Generic proxy endpoint
app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    res.send(response.data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ 
      error: 'Proxy request failed',
      message: error.message 
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`PolyLingo Proxy server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
});
