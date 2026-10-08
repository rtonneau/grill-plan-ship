#!/usr/bin/env node
// A tiny HTTP server for tests that need a stub listening in its own
// process: a parent test calling a script via spawnSync blocks its own
// event loop while the child runs, so a stub server bound in the parent's
// own process could never answer a request from that child. Running the
// stub in a separate process sidesteps that entirely.
//
// Usage: node http-stub-server.js '<json response body>'
// Prints "PORT <n>" to stdout once listening.
const http = require('http');

const body = process.argv[2];
const server = http.createServer((req, res) => {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => res.end(body));
});
server.listen(0, '127.0.0.1', () => {
  console.log(`PORT ${server.address().port}`);
});
