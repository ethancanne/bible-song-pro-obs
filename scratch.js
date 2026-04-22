const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:5511');

ws.on('open', function open() {
  console.log('Connected');
  // Send HELLO
  ws.send(JSON.stringify({
    type: 'RS_ENVELOPE',
    version: 1,
    senderId: 'test_client',
    ts: Date.now(),
    payload: { type: 'HELLO' }
  }));
});

ws.on('message', function incoming(data) {
  console.log(`Received: ${data}`);
});

ws.on('close', function close(code, reason) {
  console.log(`Disconnected: \${code} \${reason}`);
  process.exit(1);
});

ws.on('error', function error(e) {
  console.error('Socket error:', e);
});
