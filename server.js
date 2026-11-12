import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders, ...extraHeaders },
  });
}

function getBaseUrl() {
  const configured = process.env.BASE_URL;
  if (configured) return new URL(configured).origin;

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return new URL(`https://${railwayDomain}`).origin;

  return `http://localhost:${process.env.PORT || 3000}`;
}

function createCode() {
  let code;
  do {
    code = "";
    while (code.length < 6) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      for (const byte of bytes) {
        if (byte < 248) code += alphabet[byte % alphabet.length];
        if (code.length === 6) break;
      }
    }
  } while (links.has(code));
  return code;
}

async function serveStatic(pathname) {
  const publicDir = process.env.PUBLIC_DIR;
  if (!publicDir) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad path", { status: 400, headers: corsHeaders });
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const root = resolve(publicDir);
  const filePath = resolve(root, relativePath);
  const relativePathFromRoot = relative(root, filePath);
  if (
    relativePathFromRoot === ".." ||
    relativePathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativePathFromRoot)
  ) {
    return null;
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  return new Response(file, {
    headers: {
      ...corsHeaders,
      "Content-Type": file.type || contentTypeFor(filePath),
    },
  });
}

function contentTypeFor(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
  };
  return types[extname(filePath).toLowerCase()] || "application/octet-stream";
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
const baseUrl = getBaseUrl();

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "POST" && pathname === "/api/links") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      if (!body || typeof body.url !== "string") {
        return json({ error: "url must be a valid HTTP or HTTPS URL" }, 400);
      }

      let target;
      try {
        target = new URL(body.url);
      } catch {
        return json({ error: "url must be a valid HTTP or HTTPS URL" }, 400);
      }

      if (target.protocol !== "http:" && target.protocol !== "https:") {
        return json({ error: "url must be a valid HTTP or HTTPS URL" }, 400);
      }

      const code = createCode();
      const link = {
        code,
        url: target.href,
        shortUrl: `${baseUrl}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return json(link, 201);
    }

    if (request.method === "GET" && pathname === "/api/links") {
      return json([...links.values()]);
    }

    if (request.method === "GET") {
      const staticResponse = await serveStatic(pathname);
      if (staticResponse) return staticResponse;

      let code;
      try {
        code = decodeURIComponent(pathname.slice(1));
      } catch {
        return json({ error: "Not found" }, 404);
      }

      if (code && !code.includes("/")) {
        const link = links.get(code);
        if (link) {
          link.hits += 1;
          return new Response(null, {
            status: 302,
            headers: { ...corsHeaders, Location: link.url },
          });
        }
      }
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`Snip backend listening on port ${port}`);