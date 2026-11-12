'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { after, before, test } = require('node:test');
const { main, browserCommand, formatLinks } = require('../cli');

let server;
let apiBase;
const links = [];

before(async () => {
  server = http.createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/api/links') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const link = {
        code: 'aB1234',
        url: input.url,
        shortUrl: `http://short.test/aB1234`,
        hits: 0,
        createdAt: '2026-01-01T00:00:00.000Z'
      };
      links.push(link);
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify(link));
      return;
    }

    if (request.method === 'GET' && request.url === '/api/links') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(links));
      return;
    }

    if (request.method === 'GET' && request.url === '/aB1234') {
      response.writeHead(302, { location: 'https://example.com/path' });
      response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/bad123') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Unknown code.' }));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found.' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiBase = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function capture() {
  let out = '';
  let err = '';
  return {
    stdout: { write: (text) => { out += text; } },
    stderr: { write: (text) => { err += text; } },
    output: () => ({ out, err })
  };
}

function options(captureState, extra = {}) {
  return {
    env: { SNIP_API: apiBase },
    stdout: captureState.stdout,
    stderr: captureState.stderr,
    ...extra
  };
}

test('help and no arguments print usage successfully', async () => {
  for (const args of [[], ['help']]) {
    const output = capture();
    assert.equal(await main(args, options(output)), 0);
    assert.match(output.output().out, /snip add <url>/);
    assert.equal(output.output().err, '');
  }
});

test('add validates and posts a URL, then prints the short URL', async () => {
  const output = capture();
  assert.equal(await main(['add', 'https://example.org/path'], options(output)), 0);
  assert.equal(output.output().out, 'http://short.test/aB1234\n');
  assert.equal(output.output().err, '');
  links.length = 0;
});

test('add rejects invalid URLs without an API request', async () => {
  const output = capture();
  assert.equal(await main(['add', 'javascript:alert(1)'], options(output)), 1);
  assert.match(output.output().err, /valid http\(s\) URL/);
});

test('ls prints the empty state and aligned link rows', async () => {
  const empty = capture();
  assert.equal(await main(['ls'], options(empty)), 0);
  assert.equal(empty.output().out, 'No links yet.\n');

  links.push({
    code: 'aB1234',
    url: 'https://example.org/path',
    shortUrl: 'http://short.test/aB1234',
    hits: 2,
    createdAt: '2026-01-01T00:00:00.000Z'
  });
  const populated = capture();
  assert.equal(await main(['ls'], options(populated)), 0);
  assert.match(populated.output().out, /CODE\s+HITS\s+URL/);
  assert.match(populated.output().out, /aB1234\s+2\s+https:\/\/example\.org\/path/);
  assert.equal(formatLinks([]), 'No links yet.');
  links.length = 0;
});

test('open manually handles a redirect and launches its Location URL', async () => {
  const output = capture();
  let launched;
  const spawnImpl = (command, args, spawnOptions) => {
    launched = { command, args, spawnOptions };
    const child = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };

  assert.equal(
    await main(['open', 'aB1234'], options(output, { platform: 'linux', spawnImpl })),
    0
  );
  assert.deepEqual(launched, {
    command: 'xdg-open',
    args: ['https://example.com/path'],
    spawnOptions: { detached: true, stdio: 'ignore', windowsHide: true }
  });
  assert.equal(output.output().err, '');
});

test('open reports unknown codes and invalid code arguments', async () => {
  const missing = capture();
  assert.equal(await main(['open', 'bad123'], options(missing)), 1);
  assert.equal(missing.output().err, 'Unknown code.\n');

  const invalid = capture();
  assert.equal(await main(['open', 'not-valid'], options(invalid)), 1);
  assert.match(invalid.output().err, /six-character base62 code/);
});

test('network failures and unknown commands return exit code 1', async () => {
  const network = capture();
  assert.equal(
    await main(['ls'], options(network, { env: { SNIP_API: 'http://127.0.0.1:1' } })),
    1
  );
  assert.match(network.output().err, /Unable to reach the API/);

  const unknown = capture();
  assert.equal(await main(['remove'], options(unknown)), 1);
  assert.match(unknown.output().err, /Unknown command/);
});

test('browser commands are selected per supported platform', () => {
  assert.deepEqual(browserCommand('win32', 'https://example.com'), [
    'rundll32.exe',
    ['url.dll,FileProtocolHandler', 'https://example.com']
  ]);
  assert.deepEqual(browserCommand('darwin', 'https://example.com'), [
    'open',
    ['https://example.com']
  ]);
  assert.deepEqual(browserCommand('linux', 'https://example.com'), [
    'xdg-open',
    ['https://example.com']
  ]);
});
