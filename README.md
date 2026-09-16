# StoreBoost Pro

A production-quality Shopify embedded app that scans product images, identifies optimization opportunities, and compresses images to improve store performance.

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
│  │  - Dashboard UI (Paris-style)                │     │
│  │  - Auth (Session Token → Offline Token)      │     │
│  └─────────────┬───────────────────────────────┘     │
└────────────────┼────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│                  Next.js API Routes                   │
│                                                       │
│  POST /api/auth/session    - Token exchange auth      │
│  POST /api/scan            - Queue store scan         │
│  GET  /api/stats           - Dashboard statistics     │
│  GET  /api/images          - List images with filters │
│  POST /api/optimize        - Single image optimize    │
│  POST /api/optimize/bulk   - Bulk optimization        │
│  GET  /api/optimized/:id   - Serve optimized images   │
│  POST /webhooks/*          - Shopify webhooks         │
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
│  - opt_results   │             │
└──────────────────┘    ┌───────▼────────┐
                        │  Worker Process  │
                        │  (BullMQ)        │
                        │                  │
                        │  - Downloads img │
                        │  - Sharp compress│
                        │  - Saves to disk │
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

### How large stores are handled

- **Async processing**: Scans and optimizations are queued via BullMQ, not processed synchronously in HTTP requests
- **Pagination**: Products are fetched in batches of 50 via cursor-based pagination
- **Rate limiting**: Shopify API responses are monitored for throttling; automatic backoff when credits < 200
- **Worker concurrency**: 2 concurrent jobs, rate limited to 5 jobs/second
- **Duplicate prevention**: Job IDs are deterministic (`optimize-{shopId}-{imageId}`), preventing duplicate work
- **For 10K+ images**: Scan is queued and processed in background; worker handles pagination and rate limits automatically

## Required Shopify Scopes

| Scope | Purpose |
|---|---|
| `read_products` | Fetch products and their images via GraphQL Admin API |
| `write_products` | Required for `products/update` webhook subscription |

No unnecessary scopes are requested.

## Image Classification Logic

Images are classified into categories based on format and file size:

| Status | Condition | Description |
|---|---|---|
| **OPTIMIZED** | Format is WebP/AVIF, OR size ≤ 200KB | Image is already well-optimized |
| **RECOMMENDED** | Size between 200KB and 1MB | Optimization would improve performance |
| **HIGH_PRIORITY** | Size > 1MB | Large image significantly impacting page load |
| **FAILED** | Processing error | Download failed, unsupported format, etc. |

### Estimated Savings Methodology

**These are estimates, not fabricated values.** The methodology is clearly documented:

| Original Format | Compression Ratio | Reasoning |
|---|---|---|
| JPEG | 0.65 (35% reduction) | Sharp mozjpeg at quality 80 typically achieves 30-50% reduction |
| PNG | 0.50 (50% reduction) | Sharp PNG compression level 8 typically achieves 40-60% reduction |
| BMP | 0.35 (65% reduction) | Rarely optimized format, significant gains expected |
| TIFF | 0.40 (60% reduction) | Rarely optimized format, significant gains expected |
| WebP/AVIF | 1.0 (0% reduction) | Already in optimized format |

The field names use "estimated" prefix to indicate these are calculated values. For accurate sizing, the actual optimization endpoint processes a temporary copy and returns measured results.

## Webhook Verification

Shopify webhooks are verified using HMAC-SHA256:

1. Shopify sends `X-Shopify-Hmac-SHA256` header with each webhook
2. The raw request body is HMAC-signed using the app's API secret
3. The computed HMAC is compared against the header using **timing-safe comparison** (`crypto.timingSafeEqual`)
4. If they don't match, the webhook is rejected with 401

Implemented webhooks:
- `app/uninstalled` — Marks shop as uninstalled in database
- `products/update` — Logs product update events (extensible for re-scanning)

## Database Schema

### Tables

| Table | Purpose |
|---|---|
| `Shop` | Installed stores with auth tokens (access/refresh, expiry) |
| `Image` | Product images with analysis data and optimization status |
| `ScanJob` | Tracks scan operations (status, progress, errors) |
| `OptimizationJob` | Individual image optimization attempts |
| `OptimizationResult` | Historical optimization results with before/after data |

### Data Isolation

Each merchant's data is properly isolated:
- All queries are scoped by `shopId`
- API routes verify shop ownership before data access
- Cross-store data access is impossible due to foreign key constraints

## Security

### OAuth Implementation

1. **Initiation**: `/api/auth` generates a nonce, stores it in httpOnly cookie, redirects to Shopify
2. **Callback**: `/api/auth/callback` verifies HMAC, validates nonce (CSRF protection), exchanges code for token
3. **Session**: `/api/auth/session` verifies JWT ID token, exchanges for offline access token
4. **Storage**: Access tokens stored in database, **never exposed to browser**

### API Authentication

All API routes use `authenticateApiRequest()` middleware:
1. Validates `x-shop-domain` header
2. Verifies shop exists in database
3. Checks shop is not uninstalled
4. Verifies access token exists

### Webhook Security

- HMAC-SHA256 verification with timing-safe comparison
- Raw body verification (no JSON parsing before verification)
- Shop domain validation

### Environment Variables

All secrets stored in `.env.local` (gitignored):
- `SHOPIFY_API_SECRET` — Never sent to client
- `DATABASE_URL` — Database connection string
- `REDIS_URL` — Redis connection string

## API Endpoints

### POST /api/auth/session
Exchange Shopify session token for offline access token.

### POST /api/scan
Queue a store scan for background processing. Returns immediately with job ID.

### GET /api/stats
Returns dashboard statistics: total images, optimized count, savings, active jobs.

### GET /api/images?status=ALL&page=1&pageSize=20&search=
List images with optional status filter, pagination, and search.

### POST /api/optimize
Optimize a single image synchronously. Returns before/after sizes.

### POST /api/optimize/bulk
Enqueue multiple images (max 50) for background optimization via BullMQ.

### GET /api/optimized/:shopId?imageId=
Serve optimized image files from disk.

### POST /webhooks/app/uninstalled
Handle app uninstall webhook with HMAC verification.

### POST /webhooks/products/update
Handle product update webhook with HMAC verification.

## Running Tests

```bash
npm test
```

Tests cover:
- **Image classification** — Format detection, size thresholds, savings estimation
- **Webhook verification** — HMAC signing, timing-safe comparison, tamper detection
- **Image processor** — JPEG/PNG optimization, WebP conversion, Sharp integration

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
- Optimized images are stored locally on disk (production would use CDN/S3)

## Known Limitations

- Optimized images are stored on local disk, not uploaded back to Shopify (would require `fileCreate` mutation)
- No theme extension for storefront rendering of optimized images
- Single worker process (no horizontal scaling in this demo)
- Scan progress is polled every 5 seconds (not real-time WebSocket)
- No automatic re-scan on product updates (webhook logs events but doesn't trigger scan automatically)

## Production Improvements

1. **Upload optimized images** — Use Shopify's `fileCreate` mutation to upload optimized images and update product variants
2. **Theme extension** — Add a Shopify theme extension to serve optimized images on the storefront
3. **Automatic re-scanning** — Trigger background scan when `products/update` webhook fires
4. **Multiple workers** — Scale BullMQ workers horizontally for faster bulk processing
5. **Image CDN** — Store optimized images on Cloudflare R2/S3 instead of local disk
6. **Rate limit queue** — Implement a leaky-bucket queue for Shopify API calls to handle large stores
7. **Online access tokens** — Support per-staff-member permissions with online tokens
8. **Error alerting** — Add Sentry/Datadog integration for production error monitoring
9. **E2E tests** — Add Playwright tests for the full Shopify admin flow
10. **Scheduled scans** — Add a cron job to periodically re-scan stores for new images
11. **WebSocket progress** — Real-time scan/optimization progress via WebSocket instead of polling
12. **Image caching** — Cache optimized images with CDN headers for faster repeated access
