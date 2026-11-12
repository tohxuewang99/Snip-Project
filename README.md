# Snip backend

A zero-dependency Bun URL shortener. Links are held in memory and are cleared when the server restarts.

## Run

```sh
bun start
```

The server listens on `PORT` (default `3000`). Set `BASE_URL` to the public origin used in generated short links. If it is unset, `https://$RAILWAY_PUBLIC_DOMAIN` is used when available; otherwise the origin is `http://localhost:$PORT`. Set `PUBLIC_DIR` to serve static files from a directory ( `/` serves `index.html` ); existing files take precedence over short codes.

## API

- `POST /api/links` with `{ "url": "https://example.com" }` returns `201` and `{ code, url, shortUrl, hits, createdAt }`. Invalid JSON or a non-HTTP(S) URL returns `400` with `{ error }`.
- `GET /api/links` returns all links in the same shape.
- `GET /:code` redirects to the original URL with `302` and increments `hits`; unknown codes return `404`.

CORS is open for browser clients, including `OPTIONS` preflight requests.