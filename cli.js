#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_API = 'http://localhost:3000';
const USAGE = `Usage:
  snip add <url>    Create a short link
  snip ls           List links and hit counts
  snip open <code>  Open a short link in your browser
  snip help         Show this help

Set SNIP_API to use a different backend (default: ${DEFAULT_API}).`;

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validateLink(link) {
  return link !== null &&
    typeof link === 'object' &&
    typeof link.code === 'string' &&
    typeof link.url === 'string' &&
    typeof link.shortUrl === 'string' &&
    Number.isFinite(link.hits) &&
    typeof link.createdAt === 'string';
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The API returned invalid JSON.');
  }
}

async function apiRequest(apiBase, path, init, options) {
  try {
    return await options.fetchImpl(`${apiBase}${path}`, {
      ...init,
      signal: AbortSignal.timeout(options.timeoutMs)
    });
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('The request to the API timed out.');
    }
    throw new Error(`Unable to reach the API at ${apiBase}: ${error.message}`);
  }
}

async function successfulJson(response) {
  const data = parseJson(await response.text());
  if (!response.ok) {
    throw new Error(
      data && typeof data.error === 'string'
        ? data.error
        : `The API request failed with status ${response.status}.`
    );
  }
  return data;
}

function formatLinks(links) {
  if (links.length === 0) return 'No links yet.';

  const rows = links.map(({ code, hits, url }) => [code, String(hits), url]);
  const widths = [
    Math.max(4, ...rows.map(([code]) => code.length)),
    Math.max(4, ...rows.map(([, hits]) => hits.length))
  ];
  const line = (columns) =>
    `${columns[0].padEnd(widths[0])}  ${columns[1].padEnd(widths[1])}  ${columns[2]}`;

  return [line(['CODE', 'HITS', 'URL']), ...rows.map(line)].join('\n');
}

function browserCommand(platform, url) {
  if (platform === 'win32') return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  if (platform === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

function launchBrowser(url, options) {
  const [command, args] = browserCommand(options.platform, url);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = options.spawnImpl(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (error) {
      reject(new Error(`Could not launch the browser: ${error.message}`));
      return;
    }

    child.once('error', (error) => {
      reject(new Error(`Could not launch the browser: ${error.message}`));
    });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function main(argv = process.argv.slice(2), overrides = {}) {
  const stdout = overrides.stdout || process.stdout;
  const stderr = overrides.stderr || process.stderr;
  const env = overrides.env || process.env;
  const apiBase = (env.SNIP_API || DEFAULT_API).replace(/\/+$/, '');
  const options = {
    fetchImpl: overrides.fetchImpl || globalThis.fetch,
    spawnImpl: overrides.spawnImpl || spawn,
    platform: overrides.platform || process.platform,
    timeoutMs: overrides.timeoutMs || 10000
  };
  const [command, ...args] = argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    stdout.write(`${USAGE}\n`);
    return 0;
  }

  try {
    if (command === 'add') {
      if (args.length !== 1 || !isHttpUrl(args[0])) {
        throw new Error('Provide exactly one valid http(s) URL.');
      }

      const response = await apiRequest(apiBase, '/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: args[0] })
      }, options);
      const link = await successfulJson(response);
      if (!validateLink(link)) throw new Error('The API returned an invalid link.');
      stdout.write(`${link.shortUrl}\n`);
      return 0;
    }

    if (command === 'ls') {
      if (args.length !== 0) throw new Error('The ls command does not accept arguments.');
      const response = await apiRequest(apiBase, '/api/links', { method: 'GET' }, options);
      const links = await successfulJson(response);
      if (!Array.isArray(links) || !links.every(validateLink)) {
        throw new Error('The API returned an invalid links list.');
      }
      stdout.write(`${formatLinks(links)}\n`);
      return 0;
    }

    if (command === 'open') {
      if (args.length !== 1 || !/^[A-Za-z0-9]{6}$/.test(args[0])) {
        throw new Error('Provide exactly one six-character base62 code.');
      }

      const response = await apiRequest(
        apiBase,
        `/${encodeURIComponent(args[0])}`,
        { method: 'GET', redirect: 'manual' },
        options
      );
      if (response.status < 300 || response.status >= 400) {
        await successfulJson(response);
        throw new Error('The API did not return a redirect for this code.');
      }

      const location = response.headers.get('location');
      if (!location) throw new Error('The API redirect did not include a Location header.');
      const destination = new URL(location, apiBase).href;
      if (!isHttpUrl(destination)) throw new Error('The API returned an unsafe redirect URL.');
      await launchBrowser(destination, options);
      return 0;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, formatLinks, isHttpUrl, browserCommand };
