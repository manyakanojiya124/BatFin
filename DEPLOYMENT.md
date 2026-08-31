# BatFIN Production Deployment

BatFIN is deployed as one Node.js/Express process backed by one PostgreSQL database. The process serves the customer SPA on the customer hostname, the separate admin SPA on the admin hostname, and both REST API surfaces. No microservices, message broker, Kubernetes cluster, or raw database console is required.

## Production topology

```text
https://app.example.com   ─┐
                           ├─ reverse proxy / load balancer ─ BatFIN Express :3000 ─ PostgreSQL
https://admin.example.com ─┘
```

The reverse proxy must preserve the original `Host` header. Express selects `frontend/dist` or `admin-frontend/dist` from that hostname. API routes are registered before SPA serving, so `/api/v1` and `/api/v1/admin` remain on the same deployment.

## DNS and TLS

1. Point `app.example.com` and `admin.example.com` to the same deployment/load balancer.
2. Issue certificates for both names.
3. Redirect HTTP to HTTPS at the edge.
4. Preserve `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`.
5. Do not expose PostgreSQL publicly.

Production Express trusts one proxy hop, emits one-year HSTS with subdomains and preload, rejects configured-but-unknown hosts, denies framing, applies a restrictive CSP, and sets no-store headers on API responses.

## Environment

Create `backend/.env` outside source control:

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://batfin_app:REPLACE@db.internal:5432/batfin?schema=public&sslmode=require

CUSTOMER_HOSTNAME=app.example.com
ADMIN_HOSTNAME=admin.example.com
CORS_ORIGIN=https://app.example.com,https://admin.example.com,https://localhost,capacitor://localhost

JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_VALUE
ADMIN_ENCRYPTION_KEY=REPLACE_WITH_32_RANDOM_BYTES_AS_BASE64
ADMIN_QR_SIGNING_KEY=REPLACE_WITH_A_DIFFERENT_32_BYTE_BASE64_VALUE
ADMIN_SESSION_HOURS=8
ADMIN_TOTP_ISSUER=BatFIN Admin
ADMIN_SESSION_COOKIE_NAME=batfin_admin_session

# Persistent AI analytics source-file storage and MVP limits
ANALYTICS_STORAGE_PROVIDER=LOCAL
ANALYTICS_STORAGE_DIR=/var/lib/batfin/analytics
ANALYTICS_MAX_FILE_BYTES=26214400
ANALYTICS_MAX_ROWS=50000
ANALYTICS_MAX_COLUMNS=500
ANALYTICS_MAX_SHEETS=50
ANALYTICS_HEADER_SCAN_ROWS=50
ANALYTICS_ANALYSIS_TIMEOUT_MS=300000
ANALYTICS_STALE_UPLOAD_MINUTES=10

# Optional server-side OpenRouter integration. If omitted, deterministic fallback is used.
OPENROUTER_API_KEY=REPLACE_WITH_SERVER_SIDE_SECRET
OPENROUTER_MODEL=REPLACE_WITH_APPROVED_OPENROUTER_MODEL
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_TIMEOUT_MS=45000
OPENROUTER_MAX_RETRIES=1
OPENROUTER_MAX_OUTPUT_TOKENS=4096
OPENROUTER_APP_NAME=BatFIN Analytics
OPENROUTER_SITE_URL=https://admin.example.com

# Development integrations must be replaced or explicitly accepted before launch.
MOCK_OTP=REPLACE_DEVELOPMENT_ONLY
```

Generate independent secrets:

```bash
openssl rand -base64 48                 # JWT_SECRET
openssl rand -base64 32                 # ADMIN_ENCRYPTION_KEY
openssl rand -base64 32                 # ADMIN_QR_SIGNING_KEY
```

Never reuse the JWT, TOTP-encryption, and QR-signing keys. Back up the encryption and QR keys in the approved secrets manager. Losing the encryption key prevents existing admin TOTP secrets from being decrypted; changing the QR key invalidates existing signed QR payloads.

Frontend build-time configuration should remain same-origin:

```dotenv
# frontend/.env.production
VITE_API_BASE_URL=/api/v1

# admin-frontend/.env.production
VITE_ADMIN_API_BASE_URL=/api/v1/admin
```

## Build and release

From a clean checkout:

```bash
cd backend
npm ci
npx prisma generate
npm run typecheck
npm run build

cd ../frontend
npm ci
npm run check

cd ../admin-frontend
npm ci
npm run check

cd ../backend
npx prisma migrate deploy
NODE_ENV=production npm start
```

Both frontend builds are mandatory in production. The server refuses to start if either `frontend/dist/index.html` or `admin-frontend/dist/index.html` is absent.

Apply migrations once during release, before shifting traffic. Do not run `prisma migrate dev` or the demo seed in production.

## Initial Super Admin

Run once from `backend/` using an approved temporary password:

```bash
ADMIN_BOOTSTRAP_EMAIL='security-admin@example.com' \
ADMIN_BOOTSTRAP_PASSWORD='REPLACE_WITH_APPROVED_TEMPORARY_PASSWORD' \
ADMIN_BOOTSTRAP_NAME='Security Administrator' \
npm run admin:bootstrap
```

Capture the displayed setup material through a secure operational channel. Sign in at `https://admin.example.com`, enroll TOTP, store the ten one-time backup codes, and replace the temporary password. `ADMIN_BOOTSTRAP_FORCE=true` is credential recovery, not a normal deployment step; it revokes the account's sessions and appends an audit event.

Subsequent administrators are created in **Administrators → Invite administrator**. BatFIN returns a generated temporary password once. Deliver it out of band; the application intentionally does not simulate invitation email.

## Reverse proxy example (Nginx)

```nginx
upstream batfin_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name app.example.com admin.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    client_max_body_size 256k;

    location / {
        proxy_pass http://batfin_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Keep proxy request limits compatible with Express's 100 KB JSON limit. Do not cache API responses or admin HTML at a shared CDN.

## Process supervision

Use the platform's process manager or a single systemd service. Example command:

```text
WorkingDirectory=/srv/batfin/backend
ExecStart=/usr/bin/node /srv/batfin/backend/dist/server.js
Environment=NODE_ENV=production
Restart=always
```

Send `SIGTERM` for graceful shutdown. The server stops accepting new work, closes HTTP, and disconnects Prisma.

## Health checks

- `GET /healthz` — process liveness; does not query PostgreSQL.
- `GET /readyz` — readiness; verifies PostgreSQL connectivity.

Use `/readyz` for traffic admission and `/healthz` for process restart decisions. These endpoints reveal no credentials or database details.

## Analytics source-file storage

`ANALYTICS_STORAGE_DIR` must be a persistent, encrypted-at-rest volume owned by the BatFIN process account. Do not place it under a public/static directory and do not serve it through Nginx. The local adapter creates directories with mode `0700` and source files with mode `0600`; the database stores only the provider, opaque storage key, SHA-256, size, MIME type, and lifecycle state.

Back up this volume consistently with PostgreSQL analytics metadata. A future object-storage adapter must implement the same `AnalyticsFileStorage` interface and preserve private-object access, integrity checks, deletion, and ownership isolation.

## PostgreSQL operations

- Use a dedicated least-privilege application role.
- Require TLS between application and database.
- Enable encrypted daily backups and point-in-time recovery where supported.
- Test restore procedures regularly.
- Retain database and application clocks in sync through NTP; TOTP verification allows only ±30 seconds.
- Monitor connection count, storage, slow queries, and failed readiness checks.

The `AdminAuditLog` table has one database trigger that recursively redacts credential-like metadata keys on every insert and another that rejects every `UPDATE` and `DELETE`. Export audit records through the permission-checked admin API; do not bypass the append-only trail.

## Release verification

After deployment:

```bash
curl -fsS https://app.example.com/healthz
curl -fsS https://app.example.com/readyz
curl -I https://app.example.com/
curl -I https://admin.example.com/
```

Confirm:

- Customer and admin hostnames serve different SPA titles/assets.
- Unknown configured hosts receive HTTP 421.
- Admin cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, and scoped to `/api/v1/admin`.
- CSP, HSTS, `X-Frame-Options: DENY`, no-sniff, referrer, permissions-policy, and rate-limit headers are present.
- Customer JWTs cannot access admin APIs.
- Admin sessions cannot access customer endpoints without a customer JWT.
- CSRF and five-minute TOTP step-up are enforced for privileged mutations.
- Maintenance mode blocks customer APIs while admin recovery remains available.
- Dependency audits and all package checks pass.

## Rollback and incident response

Application releases should be forward-compatible with the already-applied database migration. Prefer a corrective release over destructive migration rollback. Before any exceptional database restore, capture and preserve audit exports and incident evidence.

For a suspected admin compromise:

1. Suspend or disable the account from another Super Admin.
2. Revoke its active sessions.
3. Export filtered audit events and session history.
4. Reset credentials/TOTP only after investigation requires it.
5. Rotate infrastructure secrets through the deployment secrets manager.
6. Never write passwords, raw tokens, CSRF values, TOTP secrets, or backup codes into tickets or audit reasons.
