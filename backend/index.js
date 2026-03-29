/**
 * PolyLingo Proxy Server
 * CORS proxy for fetching ZDF news and other German news sources
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins - MUST be first
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
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
      '/api/bbc/rss - Get BBC News RSS feed (English)',
      '/api/bbc/rss?category=world - Category: world|business|technology|science|health',
      '/api/bbc/article?url=XXX - Get BBC article content',
      '/api/npr/rss - Get NPR News RSS feed (English)',
      '/api/npr/rss?category=news - Category: news|world|usa|business|science|health|tech',
      '/api/npr/article?url=XXX - Get NPR article content',
      '/api/guardian/rss - Get The Guardian RSS feed (English)',
      '/api/guardian/rss?category=world - Category: world|uk|us|business|science|technology|culture',
      '/api/guardian/article?url=XXX - Get Guardian article content',
      '/api/asahi/rss - Get 朝日新聞 RSS feed (Japanese)',
      '/api/asahi/article?url=XXX - Get Asahi article content',
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

// Get BBC News RSS feed
app.get('/api/bbc/rss', async (req, res) => {
  try {
    const { category = 'world' } = req.query;
    
    // Available categories
    const validCategories = ['world', 'business', 'technology', 'science', 'health', 'uk', 'politics'];
    const cat = validCategories.includes(category) ? category : 'world';
    
    const rssUrl = `https://feeds.bbci.co.uk/news/${cat}/rss.xml`;
    console.log('Fetching BBC RSS:', rssUrl);
    
    const response = await axios.get(rssUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    console.log('BBC RSS fetched successfully, size:', response.data.length);
    
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (error) {
    console.error('BBC RSS Error:', error.message);
    console.error('Error details:', error.response?.status, error.response?.statusText);
    res.status(500).json({ 
      error: 'Failed to fetch BBC RSS',
      message: error.message,
      status: error.response?.status
    });
  }
});

// Get BBC article content
app.get('/api/bbc/article', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  console.log('Fetching BBC article:', url);
  
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
    const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content');
    
    // Try different selectors for BBC article content
    let content = '';
    const contentSelectors = [
      'article[data-component="text-block"] p',
      '[data-testid="card-text"] p',
      '.ssrcss-1q0x1qg-Paragraph p',
      '.ssrcss-1q0x1qg-Paragraph',
      'article p',
      '[data-component="text-block"] p',
      '.lx-stream-post-body p'
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
      const metaDesc = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content');
      if (metaDesc) content = metaDesc;
    }
    
    console.log('BBC article parsed:', { title: title?.substring(0, 50), contentLength: content.length });
    
    res.json({
      title,
      content: content.substring(0, 5000),
      url,
      source: 'BBC News'
    });
    
  } catch (error) {
    console.error('BBC article fetch error:', error.message);
    console.error('Error details:', error.response?.status, error.response?.statusText);
    res.status(500).json({ 
      error: 'Failed to fetch article',
      message: error.message,
      status: error.response?.status,
      url
    });
  }
});

// Get The Guardian RSS feed (reliable UK news source)
app.get('/api/guardian/rss', async (req, res) => {
  try {
    const { category = 'world' } = req.query;
    
    // The Guardian RSS feeds - very reliable
    const rssMap = {
      'world': 'https://www.theguardian.com/world/rss',
      'uk': 'https://www.theguardian.com/uk/rss',
      'us': 'https://www.theguardian.com/us/rss',
      'business': 'https://www.theguardian.com/business/rss',
      'science': 'https://www.theguardian.com/science/rss',
      'technology': 'https://www.theguardian.com/technology/rss',
      'culture': 'https://www.theguardian.com/culture/rss'
    };
    
    const validCategories = Object.keys(rssMap);
    const cat = validCategories.includes(category) ? category : 'world';
    const rssUrl = rssMap[cat];
    
    console.log('Fetching Guardian RSS:', rssUrl);
    
    const response = await axios.get(rssUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    console.log('Guardian RSS fetched successfully, size:', response.data.length);
    
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (error) {
    console.error('Guardian RSS Error:', error.message);
    console.error('Error details:', error.response?.status, error.response?.statusText);
    res.status(500).json({ 
      error: 'Failed to fetch Guardian RSS',
      message: error.message,
      status: error.response?.status
    });
  }
});

// Get The Guardian article content
app.get('/api/guardian/article', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  console.log('Fetching Guardian article:', url);
  
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
    const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content');
    
    // Try different selectors for Guardian article content
    let content = '';
    const contentSelectors = [
      '.article-body p',           // Guardian specific
      '#maincontent p',
      'article p',
      '.content__article-body p'
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
      const metaDesc = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content');
      if (metaDesc) content = metaDesc;
    }
    
    console.log('Guardian article parsed:', { title: title?.substring(0, 50), contentLength: content.length });
    
    res.json({
      title,
      content: content.substring(0, 5000),
      url,
      source: 'The Guardian'
    });
    
  } catch (error) {
    console.error('Guardian article fetch error:', error.message);
    console.error('Error details:', error.response?.status, error.response?.statusText);
    res.status(500).json({ 
      error: 'Failed to fetch article',
      message: error.message,
      status: error.response?.status,
      url
    });
  }
});

// Get NPR News RSS feed (reliable US news source)
app.get('/api/npr/rss', async (req, res) => {
  try {
    const { category = 'news' } = req.query;
    
    // NPR RSS feeds - very reliable and up-to-date
    const rssMap = {
      'news': 'https://feeds.npr.org/1001/rss.xml',           // Top Stories
      'world': 'https://feeds.npr.org/1004/rss.xml',          // World
      'usa': 'https://feeds.npr.org/1003/rss.xml',            // National
      'business': 'https://feeds.npr.org/1006/rss.xml',       // Business
      'science': 'https://feeds.npr.org/1007/rss.xml',        // Science
      'health': 'https://feeds.npr.org/1128/rss.xml',         // Health
      'tech': 'https://feeds.npr.org/1019/rss.xml'            // Technology
    };
    
    const validCategories = Object.keys(rssMap);
    const cat = validCategories.includes(category) ? category : 'news';
    const rssUrl = rssMap[cat];
    
    console.log('Fetching NPR RSS:', rssUrl);
    
    const response = await axios.get(rssUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    console.log('NPR RSS fetched successfully, size:', response.data.length);
    
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (error) {
    console.error('NPR RSS Error:', error.message);
    console.error('Error details:', error.response?.status, error.response?.statusText);
    res.status(500).json({ 
      error: 'Failed to fetch NPR RSS',
      message: error.message,
      status: error.response?.status
    });
  }
});

// Get NPR article content
app.get('/api/npr/article', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  console.log('Fetching NPR article:', url);
  
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
    const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content');
    
    // Try different selectors for NPR article content
    let content = '';
    const contentSelectors = [
      '#storytext p',           // NPR specific
      '.storytext p',
      'article p',
      '.transcript p',
      '[data-testid="paragraph"]'
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
      const metaDesc = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content');
      if (metaDesc) content = metaDesc;
    }
    
    console.log('NPR article parsed:', { title: title?.substring(0, 50), contentLength: content.length });
    
    res.json({
      title,
      content: content.substring(0, 5000),
      url,
      source: 'NPR'
    });
    
  } catch (error) {
    console.error('NPR article fetch error:', error.message);
    console.error('Error details:', error.response?.status, error.response?.statusText);
    res.status(500).json({ 
      error: 'Failed to fetch article',
      message: error.message,
      status: error.response?.status,
      url
    });
  }
});

// Get Yahoo Japan News RSS feed (Japanese)
// Get Asahi Shimbun RSS feed (Japanese)
app.get('/api/asahi/rss', async (req, res) => {
  try {
    // Asahi Shimbun headlines RSS - provides main news headlines
    const rssUrl = 'https://rss.asahi.com/rss/asahi/newsheadlines.rdf';
    
    console.log('Fetching Asahi RSS:', rssUrl);
    
    const response = await axios.get(rssUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'ja-JP,ja;q=0.9'
      }
    });
    
    console.log('Asahi RSS fetched successfully, size:', response.data.length);
    
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (error) {
    console.error('Asahi RSS Error:', error.message);
    console.error('Error details:', error.response?.status, error.response?.statusText);
    res.status(500).json({ 
      error: 'Failed to fetch Asahi RSS',
      message: error.message,
      status: error.response?.status
    });
  }
});

// Get Asahi article content
app.get('/api/asahi/article', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  console.log('Fetching Asahi article:', url);
  
  try {
    const response = await axios.get(url, {
      timeout: 20000, // Longer timeout for Asahi
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9'
      },
      maxRedirects: 5
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract article content
    let title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content');
    
    // Asahi specific selectors - expanded list
    let content = '';
    const contentSelectors = [
      '.article__content p',        // Asahi modern layout
      '.ArticleBody p',             // Alternative class
      '[data-uuid] p',              // Asahi article body with data attribute
      '.article_body p',
      '.article p',
      'article p',
      '.main p',
      '.content p',
      '.main-content p',
      '.article-text p',
      '#article-body p',
      '.story p',
      '.news p'
    ];
    
    for (const selector of contentSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        content = elements.map((i, el) => $(el).text().trim()).get().join('\n\n');
        if (content.length > 200) break;
      }
    }
    
    // If still no content, try to find any div with article-like content
    if (content.length < 200) {
      // Try finding divs with article-related class names
      const articleDivs = $('div').filter((i, el) => {
        const className = $(el).attr('class') || '';
        return /article|content|body|main/i.test(className);
      });
      
      if (articleDivs.length > 0) {
        // Get the div with most paragraph children
        let bestDiv = null;
        let maxP = 0;
        articleDivs.each((i, el) => {
          const pCount = $(el).find('p').length;
          if (pCount > maxP) {
            maxP = pCount;
            bestDiv = el;
          }
        });
        
        if (bestDiv && maxP > 0) {
          content = $(bestDiv).find('p').map((i, el) => $(el).text().trim()).get().join('\n\n');
        }
      }
    }
    
    // Also try to get summary/description if content is short
    if (content.length < 100) {
      const metaDesc = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content');
      if (metaDesc) content = metaDesc;
    }
    
    console.log('Asahi article parsed:', { title: title?.substring(0, 50), contentLength: content.length, selectors: contentSelectors.join(', ') });
    
    res.json({
      title,
      content: content.substring(0, 5000),
      url,
      source: '朝日新聞'
    });
    
  } catch (error) {
    console.error('Asahi article fetch error:', error.message);
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

// Export for Vercel serverless
module.exports = app;

// Start server if running locally (not on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`PolyLingo Proxy server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/`);
  });
}
