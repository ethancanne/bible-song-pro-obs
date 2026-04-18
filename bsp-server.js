#!/usr/bin/env node
/**
 * Bible Song Pro — LAN Network Broadcast Server
 * -----------------------------------------------
 * Serves BSP_display.html and BSP_display2.html over HTTP so remote
 * computers on the same LAN can connect and see live slide updates.
 * Runs a WebSocket relay on the SAME port — no npm install required.
 *
 * Usage:
 *   node bsp-server.js              (default port 5511)
 *   node bsp-server.js --port 5512  (custom port)
 *
 * In the BSP Panel → RemoteShow: set Relay Host = <your LAN IP>, Relay Port = chosen port.
 * Remote displays: http://<your LAN IP>:<port>/BSP_display.html
 */
'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');

// ─── Configuration ──────────────────────────────────────────────────────────
const DEFAULT_PORT = 5511;
const port = (() => {
  const idx = process.argv.indexOf('--port');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  }
  return DEFAULT_PORT;
})();

const ROOT = __dirname; // serve files from the project folder

// ─── MIME types ─────────────────────────────────────────────────────────────
const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',
  '.mp4':   'video/mp4',
  '.webm':  'video/webm',
  '.mp3':   'audio/mpeg',
  '.wav':   'audio/wav',
  '.ogg':   'audio/ogg',
  '.txt':   'text/plain; charset=utf-8',
  '.md':    'text/plain; charset=utf-8',
};

function getMime(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// ─── LAN IP detection ───────────────────────────────────────────────────────
function getLanIps() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of (ifaces[name] || [])) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// ─── WebSocket frame codec ──────────────────────────────────────────────────
function wsAcceptKey(key) {
  return crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

/**
 * Decode one WebSocket frame from a Buffer.
 * Returns { opcode, payload, consumed } or null if incomplete.
 */
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0];
  const b1 = buf[1];
  const opcode = b0 & 0x0f;
  const masked  = (b1 & 0x80) !== 0;
  let payloadLen = b1 & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < offset + 2) return null;
    payloadLen = buf.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLen === 127) {
    if (buf.length < offset + 8) return null;
    // High 32 bits ignored — no slide message will exceed 4 GB
    payloadLen = buf.readUInt32BE(offset + 4);
    offset += 8;
  }

  if (masked) {
    if (buf.length < offset + 4 + payloadLen) return null;
    const mask = buf.slice(offset, offset + 4);
    offset += 4;
    const payload = Buffer.allocUnsafe(payloadLen);
    for (let i = 0; i < payloadLen; i++) payload[i] = buf[offset + i] ^ mask[i % 4];
    return { opcode, payload, consumed: offset + payloadLen };
  } else {
    if (buf.length < offset + payloadLen) return null;
    return { opcode, payload: buf.slice(offset, offset + payloadLen), consumed: offset + payloadLen };
  }
}

/** Encode a UTF-8 text frame (server → client, unmasked). */
function encodeTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x81; header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

function encodePongFrame(payload) {
  const len = Math.min(payload.length, 125);
  return Buffer.concat([Buffer.from([0x8a, len]), payload.slice(0, len)]);
}

function encodeCloseFrame() {
  return Buffer.from([0x88, 0x00]);
}

// ─── Client registry ────────────────────────────────────────────────────────
/** @type {Set<import('net').Socket>} */
const clients = new Set();

/**
 * Last known slide state JSON string — replayed to newly connecting displays
 * so they immediately show the current slide even if the panel sent it minutes ago.
 */
let lastSlideState = null;
let lastSlideStateD2 = null;

/** Broadcast a raw JSON string to all clients except the sender. */
function broadcast(rawJson, senderSocket) {
  const frame = encodeTextFrame(rawJson);
  for (const client of clients) {
    if (client === senderSocket) continue;
    try { client.write(frame); } catch (_) {}
  }
}

/** Register a newly-upgraded WebSocket socket and wire up frame handling. */
function addClient(socket) {
  clients.add(socket);
  log(`Client connected   [${socket.remoteAddress}]  (${clients.size} connected)`);

  // Replay the last known slide state so new viewers catch up instantly
  if (lastSlideState) {
    try { socket.write(encodeTextFrame(lastSlideState)); } catch (_) {}
  }
  if (lastSlideStateD2) {
    try { socket.write(encodeTextFrame(lastSlideStateD2)); } catch (_) {}
  }

  let buf = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    while (true) {
      const frame = decodeFrame(buf);
      if (!frame) break;
      buf = buf.slice(frame.consumed);

      switch (frame.opcode) {
        case 0x01: { // Text frame
          const text = frame.payload.toString('utf8');
          let handledPing = false;
          // Cache slide-state messages so new joiners are immediately in sync
          try {
            const msg = JSON.parse(text);
            const checkMsg = msg && msg.type === 'RS_ENVELOPE' && msg.payload ? msg.payload : msg;
            
            if (checkMsg && checkMsg.type === 'PING') {
              handledPing = true;
              const pongPayload = { type: 'PONG', ts: Date.now() };
              const pong = (msg && msg.type === 'RS_ENVELOPE')
                ? { type: 'RS_ENVELOPE', version: 1, senderId: 'server', sessionId: msg.sessionId || '', ts: Date.now(), payload: pongPayload }
                : pongPayload;
              try { socket.write(encodeTextFrame(JSON.stringify(pong))); } catch (_) {}
            } else if (checkMsg && (checkMsg.type === 'UPDATE' || checkMsg.type === 'SYNC_STATE' || checkMsg.type === 'CLEAR')) {
              if (checkMsg.target === 'display2') {
                lastSlideStateD2 = text;
              } else {
                lastSlideState = text;
              }
            }
          } catch (_) {}
          
          if (!handledPing) {
            broadcast(text, socket);
          }
          break;
        }
        case 0x08: // Close frame
          try { socket.write(encodeCloseFrame()); } catch (_) {}
          socket.destroy();
          return;
        case 0x09: // Ping → Pong
          try { socket.write(encodePongFrame(frame.payload)); } catch (_) {}
          break;
        default:
          break; // binary / continuation frames: ignore
      }
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
    log(`Client disconnected [${socket.remoteAddress}]  (${clients.size} connected)`);
  });

  socket.on('error', () => {
    clients.delete(socket);
  });
}

// ─── HTTP + WebSocket server ─────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Resolve the URL path to a file
  let urlPath = (req.url || '/').split('?')[0];

  // ── /bsp-info — JSON endpoint used by the panel to get the correct LAN IPs ──
  if (urlPath === '/bsp-info') {
    const lanIps = getLanIps();
    const body = JSON.stringify({ ips: lanIps, port });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',   // allow file:// panel to fetch
      'Cache-Control': 'no-cache',
    });
    res.end(body);
    return;
  }

  if (urlPath === '/' || urlPath === '') urlPath = '/BSP_display.html';

  // Prevent directory-traversal attacks
  const filePath = path.resolve(ROOT, '.' + urlPath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Friendly 404 with links to the two display pages
      const lanIps = getLanIps();
      const ip = lanIps[0] || 'YOUR_LAN_IP';
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><title>BSP Server</title>
<style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{background:#1e1e2e;border-radius:16px;padding:40px 48px;max-width:480px;text-align:center;}
h1{font-size:1.6rem;margin-bottom:8px;}p{color:#aaa;margin-bottom:24px;}
a{display:block;margin:10px 0;padding:14px 24px;background:#4f46e5;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;}
a:hover{background:#6366f1;}</style></head>
<body><div class="box">
<h1>📡 Bible Song Pro Server</h1>
<p>Open a display on this or any computer connected to the same network:</p>
<a href="/BSP_display.html">🖥 Display 1 — BSP_display.html</a>
<a href="/BSP_display2.html">🖥 Display 2 — BSP_display2.html</a>
<p style="margin-top:20px;font-size:0.85em;color:#666;">Serving from: ${ROOT}<br>LAN IP: ${ip}:${port}</p>
</div></body></html>`);
      return;
    }

    res.writeHead(200, {
      'Content-Type':  getMime(filePath),
      'Content-Length': stat.size,
      'Cache-Control':  'no-cache, no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

// Upgrade HTTP connections to WebSocket
server.on('upgrade', (req, socket, _head) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${wsAcceptKey(key)}\r\n\r\n`
  );

  addClient(socket);
});

// ─── Startup ────────────────────────────────────────────────────────────────
function log(...args) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}]`, ...args);
}

server.listen(port, '0.0.0.0', () => {
  const lanIps = getLanIps();
  const primaryIp = lanIps[0] || '<YOUR_LAN_IP>';

  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
  const W = 66;
  const row = (content = '') => `║ ${pad(content, W - 3)} ║`;
  const div = `╠${'═'.repeat(W - 1)}╣`;
  const top = `╔${'═'.repeat(W - 1)}╗`;
  const bot = `╚${'═'.repeat(W - 1)}╝`;

  console.log('');
  console.log(top);
  console.log(row('  📡  Bible Song Pro — LAN Network Broadcast Server'));
  console.log(div);
  console.log(row());
  console.log(row(`  Port: ${port}   |   Project folder: ${path.basename(ROOT)}`));
  console.log(row());
  console.log(row('  ── Open on REMOTE computers ─────────────────────────────────'));
  console.log(row());
  for (const ip of (lanIps.length ? lanIps : [primaryIp])) {
    console.log(row(`    Display 1:  http://${ip}:${port}/BSP_display.html`));
    console.log(row(`    Display 2:  http://${ip}:${port}/BSP_display2.html`));
  }
  console.log(row());
  console.log(row('  ── In BSP Panel → Network Broadcast settings ─────────────'));
  console.log(row());
  console.log(row(`    Relay Host:  ${primaryIp}`));
  console.log(row(`    Relay Port:  ${port}`));
  console.log(row());
  console.log(row('  Press Ctrl+C to stop the server'));
  console.log(row());
  console.log(bot);
  console.log('');
  log('Server ready. Waiting for connections…');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗  Port ${port} is already in use.`);
    console.error(`   Try:  node bsp-server.js --port 5512\n`);
  } else {
    console.error('\n✗  Server error:', err.message, '\n');
  }
  process.exit(1);
});
