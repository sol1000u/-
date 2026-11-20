// 简单的静态文件服务器，用于预览 Cocos Creator web-mobile 构建产物
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8091;
const ROOT = path.join(__dirname, 'build', 'web-mobile');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  
  const filePath = path.join(ROOT, urlPath);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      console.log('[404]', urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
    console.log('[200]', urlPath);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎮 游戏预览服务器已启动！`);
  console.log(`📂 根目录: ${ROOT}`);
  console.log(`🌐 访问地址: http://localhost:${PORT}/\n`);
});
