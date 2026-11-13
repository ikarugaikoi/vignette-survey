const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const page = path.join(__dirname, 'dist', 'index.html');
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(page)); }
  else { res.writeHead(404); res.end('Not found'); }
});
server.listen(4180, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4180'));
