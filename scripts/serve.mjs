import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
const server = http.createServer(async (request, response) => {
    try {
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, { Allow: 'GET, HEAD' }).end();
            return;
        }
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (pathname.split('/').some(segment => segment.startsWith('.'))) {
            response.writeHead(403).end();
            return;
        }
        const file = await realpath(path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`));
        if (!file.startsWith(root + path.sep)) {
            response.writeHead(403).end();
            return;
        }
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
        response.writeHead(error instanceof URIError ? 400 : 404).end();
    }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(8080, '127.0.0.1', () => console.log('Gesture Particles: http://127.0.0.1:8080 (Ctrl+C to stop)'));
