// Stacy Moon — DeepSeek CORS Proxy
// Run: node proxy.js

const http = require('http');

const PORT = 3000;

http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const options = {
      hostname: 'api.deepseek.com',
      port: 443,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || '',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const proxy = require('https').request(options, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxy.on('error', err => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: { message: err.message } }));
    });

    proxy.write(body);
    proxy.end();
  });
}).listen(PORT, () => {
  console.log('Stacy Moon proxy running on http://localhost:' + PORT);
});
