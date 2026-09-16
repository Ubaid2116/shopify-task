# StoreBoost Pro

A Shopify embedded app that scans product images, identifies optimization opportunities, and compresses images to improve store performance.

## Setup Instructions

### Prerequisites

- Node.js 18+
- Docker (for Redis)
- Shopify CLI (`npm install -g @shopify/cli @shopify/app`)
- A Shopify development store

### 1. Install dependencies

```bash
npm install
```

### 2. Start Redis

```bash
docker run -d -p 6379:6379 redis
```

### 3. Set up environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Neon, Supabase, or local) |
| `SHOPIFY_API_KEY` | Your Shopify app's API key |
| `SHOPIFY_API_SECRET` | Your Shopify app's API secret |
| `SHOPIFY_APP_URL` | Your app's base URL (e.g., `http://localhost:3000`) |
| `SHOPIFY_API_VERSION` | Shopify API version (e.g., `2026-07`) |
| `REDIS_URL` | Redis connection string (default: `redis://localhost:6379`) |

### 4. Set up the database

```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Start the development server

```bash
npx shopify app dev
```

This starts:
- Next.js dev server with Cloudflare tunnel
- Shopify app proxy

### 6. Start the background worker (in a separate terminal)

```bash
npm run worker
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Shopify Admin                      │
│  ┌─────────────────────────────────────────────┐     │
│  │  Embedded App (Next.js + App Bridge)         │     │
│  │  - Dashboard UI                              │     │
│  │  - Auth (Session Token → Offline Token)      │     │
│  └─────────────┬───────────────────────────────┘     │
└────────────────┼────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│                  Next.js API Routes                   │
│                                                       │
│  POST /api/auth/session    - Token exchange auth      │
│  POST /api/scan            - Scan store products      │
│  GET  /api/stats           - Dashboard statistics     │
│  GET  /api/images          - List images with filters │
│  POST /api/optimize        - Single image optimize    │
│  POST /api/optimize/bulk   - Bulk optimization        │
│  POST /api/webhooks        - Shopify webhooks         │
│                                                       │
└────────┬───────────────────────┬────────────────────┘
         │                       │
┌────────▼────────┐    ┌────────▼────────┐
│  PostgreSQL DB   │    │    Redis         │
│  (Neon/Supabase) │    │  (BullMQ Queue) │
│                  │    │                  │
│  - shops         │    │  - optimize jobs  │
│  - images        │    │  - scan jobs      │
│  - scan_jobs     │    │                   │
│  - opt_jobs      │    └────────┬─────────┘
└──────────────────┘             │
                         ┌───────▼────────┐
                         │  Worker Process  │
                         │  (BullMQ)        │
                         │                  │
                         │  - Downloads img │
                         │  - Sharp compress│
                         │  - Saves result  │
                         └──────────────────┘
```

### What runs where

| Component | Runs On | Description |
|---|---|---|
| Dashboard UI | Browser (Shopify iframe) | React component rendered in Shopify admin |
| API Routes | Your server (Next.js) | Handles auth, scan, optimize, webhooks |
| BullMQ Worker | Your server (separate process) | Background image processing |
| Redis | Your server (Docker) | Job queue storage |
| PostgreSQL | Cloud (Neon) | Persistent data storage |
| Shopify GraphQL API | Shopify servers | Product/image data fetching |
| Sharp | Your server | Image compression and WebP conversion |

## Required Shopify Scopes

| Scope | Purpose |
|---|---|
| `read_products` | Fetch products and their images via GraphQL Admin API |
| `write_products` | Update product images with optimized versions (future feature) |

## Image Classification Logic

Images are classified into three categories based on format and file size:

| Status | Condition | Description |
|---|---|---|
| **OPTIMIZED** | Format is WebP/AVIF, OR size ≤ 200KB | Image is already well-optimized |
| **RECOMMENDED** | Size between 200KB and 1MB | Optimization would improve performance |
| **HIGH_PRIORITY** | Size > 1MB | Large image significantly impacting page load |

### Compression estimates

| Original Format | Estimated Reduction | Method |
|---|---|---|
| JPEG | ~35% | Sharp mozjpeg compression at quality 80 |
| PNG | ~50% | Sharp PNG compression level 8 |
| BMP | ~65% | Convert to WebP at quality 80 |
| TIFF | ~60% | Convert to WebP at quality 80 |

## Webhook Verification

Shopify webhooks are verified using HMAC-SHA256:

1. Shopify sends `X-Shopify-Hmac-SHA256` header with each webhook
2. The raw request body is HMAC-signed using the app's API secret
3. The computed HMAC is compared against the header using timing-safe comparison
4. If they don't match, the webhook is rejected with 401

Implemented webhooks:
- `app/uninstalled` — Marks shop as uninstalled in database

## API Endpoints

### POST /api/auth/session
Exchange Shopify session token for offline access token.

### POST /api/scan
Scan all products and their images. Creates/upates Image records with analysis data.

### GET /api/stats
Returns dashboard statistics: total images, optimized count, savings, etc.

### GET /api/images?status=ALL&page=1&pageSize=20
List images with optional status filter and pagination.

### POST /api/optimize
Optimize a single image. Downloads, compresses with Sharp, returns before/after sizes.

### POST /api/optimize/bulk
Enqueue multiple images for background optimization via BullMQ.

### POST /api/webhooks
Handle Shopify webhooks with HMAC verification.

## Running Tests

```bash
npm test
```

Tests cover:
- Image classification logic (format detection, size thresholds, savings estimation)
- Webhook HMAC verification (signing, timing-safe comparison, tamper detection)
- Image processor (JPEG/PNG optimization, WebP conversion, Sharp integration)

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SHOPIFY_API_KEY` | Yes | — | Shopify app API key |
| `SHOPIFY_API_SECRET` | Yes | — | Shopify app API secret |
| `SHOPIFY_APP_URL` | Yes | — | App base URL |
| `SHOPIFY_API_VERSION` | No | `2026-07` | Shopify Admin API version |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |

## Assumptions

- The app runs as an embedded Shopify app inside the Shopify admin
- Authentication uses session token exchange (Shopify's recommended approach for embedded apps)
- Images are analyzed via HTTP HEAD requests to get file sizes
- Sharp is used for image compression (already available as a Next.js dependency)
- Redis is used for BullMQ job queue (Docker recommended for local development)
- PostgreSQL database is hosted on Neon (serverless PostgreSQL)

## Known Limitations

- Optimized images are stored in-memory/by the worker but not uploaded back to Shopify (would require Admin API mutations)
- No theme extension for storefront rendering of optimized images
- No automatic re-scanning on product updates (webhook for `products/update` not yet implemented)
- Single worker process (no horizontal scaling)
- No image format detection from Shopify's CDN headers (relies on URL extension)
- The scan endpoint is synchronous (processes all products in one request)

## Production Improvements

1. **Upload optimized images** — Use Shopify's `fileCreate` mutation to upload optimized images and update product variants
2. **Theme extension** — Add a Shopify theme extension to serve optimized images on the storefront
3. **Automatic re-scanning** — Implement `products/update` and `products/create` webhooks to keep image data fresh
4. **Multiple workers** — Scale BullMQ workers horizontally for faster bulk processing
5. **Image CDN** — Store optimized images on a CDN (Cloudflare R2, S3) instead of processing on-demand
6. **Rate limit queue** — Implement a leaky-bucket queue for Shopify API calls to handle large stores
7. **Online access tokens** — Support per-staff-member permissions with online tokens
8. **Error alerting** — Add Sentry/Datadog integration for production error monitoring
9. **E2E tests** — Add Playwright tests for the full Shopify admin flow
10. **Scheduled scans** — Add a cron job to periodically re-scan stores for new images
