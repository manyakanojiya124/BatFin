# BatFIN

BatFIN is a responsive consumer web application for a Battery-as-a-Service (BaaS) EV financing company. Customers can authenticate by phone and OTP, manage financed or leased batteries and vehicles, select plans, review their ledger, inspect device health, recharge their wallet, and submit support tickets.

The project is a single application repository with a React frontend, an Express API, and PostgreSQL through Prisma. In production, the Express process can serve both the compiled frontend and `/api/v1` routes.

## Implementation status

Phases 0–10 are complete:

- Phone registration, OTP authentication, and JWT sessions
- Customer profile view and editing
- Asset registration, listing, details, location, lock, and unlock
- Prepaid/postpaid plans and subscriptions
- Transaction ledger, filters, and wallet summaries
- Replaceable device-health provider
- Replaceable development payment provider
- Support-ticket submission and tracking
- Responsive mobile, tablet, and desktop layouts
- Loading, empty, error, and retry states
- Splash, battery-ring, success-checkmark, shimmer, and bottom-sheet animations
- Idempotent demo seed
- Production single-process frontend serving
- Capacitor Android/iOS wrappers and Android emulator debug APK

## Administration extension

A separate, subdomain-ready web admin portal is available in `admin-frontend/`. Admin Phases 0–6 are complete: secure MFA/RBAC sessions, live operations, customer/inventory/ticket/finance workflows, append-only audit exploration, administrator and session governance, enforced platform settings, rate limiting, security headers, and single-deployment customer/admin hostname routing.

See [`ADMIN.md`](ADMIN.md) for the admin permission model, [`BUSINESS_DATA.md`](BUSINESS_DATA.md) for governed master-data imports, [`ANALYTICS.md`](ANALYTICS.md) for the AI BI engine, and [`DEPLOYMENT.md`](DEPLOYMENT.md) for production operations.

## Demo account

After running the seed:

| Field | Value |
|---|---|
| Mobile number | `9876543210` |
| Development OTP | `123456` |
| Name | Sarah Jenkins |
| Wallet balance | ₹12,450.00 |

The seed includes two assets, eight plans, and ten transactions.

## Mobile testing

Capacitor Android and iOS projects are included. An Android emulator debug APK is available at:

```text
frontend/mobile-builds/BatFIN-android-emulator-debug.apk
```

See [`MOBILE.md`](MOBILE.md) for emulator installation, Android rebuilding, physical-device API configuration, E2B sandbox-token requirements, and iOS/Xcode instructions.

## Technology stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS 3
- React Router
- Zustand
- Capacitor 7 mobile wrappers
- Lucide icons
- Locally bundled Inter and Sora fonts

### Backend

- Node.js 20+
- TypeScript
- Express 5
- Prisma ORM 6
- PostgreSQL
- JSON Web Tokens

### Integration boundaries

- `DeviceProvider` isolates device/IoT health retrieval.
- `PaymentProvider` isolates payment processing.
- The OTP provider is a development implementation using a static code.

No real SMS, payment gateway, GPS hardware, insurance/RTO system, or chat provider is connected.

## Repository structure

```text
batfin/
├── frontend/
│   ├── public/
│   │   └── LOGO.png
│   ├── android/              # Capacitor Android project
│   ├── ios/                  # Capacitor iOS project
│   ├── mobile-assets/        # Generated icon/splash sources
│   ├── mobile-builds/        # Persisted testing deliverables
│   ├── src/
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── assets/
│   │   │   ├── plans/
│   │   │   ├── ledger/
│   │   │   ├── health/
│   │   │   ├── payments/
│   │   │   ├── support/
│   │   │   └── profile/
│   │   ├── components/
│   │   ├── services/
│   │   ├── store/
│   │   ├── types/
│   │   └── utils/
│   ├── capacitor.config.ts
│   ├── tailwind.config.cjs
│   ├── postcss.config.cjs
│   └── package.json
├── admin-frontend/          # Separate subdomain-ready web admin portal
│   ├── public/LOGO.png
│   ├── src/pages/
│   └── package.json
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── assets/
│   │   │   ├── plans/
│   │   │   ├── ledger/
│   │   │   ├── health/
│   │   │   ├── payments/
│   │   │   └── support/
│   │   ├── middleware/
│   │   ├── database/
│   │   └── config/
│   ├── prisma.config.ts
│   └── package.json
├── ADMIN.md
├── ANALYTICS.md
├── BUSINESS_DATA.md
├── DEPLOYMENT.md
├── MOBILE.md
└── README.md
```

Each backend module uses the same three-file pattern:

- `X.controller.ts` — HTTP request and response handling
- `X.service.ts` — validation and business logic
- `X.routes.ts` — Express route definitions

## Prerequisites

Install:

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 14 or newer

Confirm the tools are available:

```bash
node --version
npm --version
psql --version
```

## Local database setup

Create a PostgreSQL role and database. The following is a development example; use different credentials outside a local environment.

```sql
CREATE ROLE batfin WITH LOGIN PASSWORD 'batfin_dev_password' CREATEDB;
CREATE DATABASE batfin OWNER batfin;
```

Example command-line workflow:

```bash
sudo -u postgres psql
```

Then execute the SQL above and exit with `\q`.

## Environment configuration

### Backend

```bash
cd backend
cp .env.example .env
```

`backend/.env`:

```dotenv
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174,https://localhost,capacitor://localhost
CUSTOMER_HOSTNAME=
ADMIN_HOSTNAME=
DATABASE_URL=postgresql://batfin:batfin_dev_password@localhost:5432/batfin?schema=public
JWT_SECRET=replace-with-a-long-random-secret
MOCK_OTP=123456
ADMIN_ENCRYPTION_KEY=replace-with-32-random-bytes-encoded-as-base64
ADMIN_QR_SIGNING_KEY=replace-with-another-32-random-bytes-encoded-as-base64
ADMIN_SESSION_HOURS=8
ADMIN_TOTP_ISSUER=BatFIN Admin
ADMIN_SESSION_COOKIE_NAME=batfin_admin_session
```

| Variable | Required | Purpose |
|---|---:|---|
| `PORT` | No | Express port; defaults to `3000` |
| `CORS_ORIGIN` | No | Comma-separated browser origins allowed to call the API |
| `CUSTOMER_HOSTNAME` | Production | Customer SPA hostname without scheme or path |
| `ADMIN_HOSTNAME` | Production | Separate admin SPA hostname without scheme or path |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma |
| `JWT_SECRET` | Production | JWT signing and verification secret |
| `MOCK_OTP` | No | Development OTP; defaults to `123456` |
| `ADMIN_ENCRYPTION_KEY` | Production | Base64-encoded 32-byte key for admin TOTP encryption |
| `ADMIN_QR_SIGNING_KEY` | Production | Separate Base64-encoded 32-byte HMAC key for asset QR signatures |
| `ADMIN_SESSION_HOURS` | No | Opaque admin-session lifetime; defaults to 8 hours |
| `ADMIN_TOTP_ISSUER` | No | Authenticator-app issuer label |
| `ADMIN_SESSION_COOKIE_NAME` | No | HttpOnly admin cookie name |
| `NODE_ENV` | No | Use `production` to serve the compiled frontend |

`JWT_SECRET`, `ADMIN_ENCRYPTION_KEY`, and `ADMIN_QR_SIGNING_KEY` must be set when `NODE_ENV=production`.

### Frontend

```bash
cd frontend
cp .env.example .env
```

`frontend/.env`:

```dotenv
VITE_API_BASE_URL=/api/v1
```

The relative API path is recommended. During development, Vite proxies `/api` to `http://127.0.0.1:3000`. In production, Express serves both the frontend and API from the same origin.

### Admin frontend

```bash
cd admin-frontend
cp .env.example .env
```

```dotenv
VITE_ADMIN_API_BASE_URL=/api/v1/admin
```

The admin development server uses port `5174` and sends credentialed requests through its `/api` proxy. A production admin subdomain can point this variable at the shared HTTPS API origin.

## Installation

Install dependencies in both packages:

```bash
cd backend
npm ci

cd ../frontend
npm ci

cd ../admin-frontend
npm ci
```

Use `npm install` instead if intentionally updating package locks.

## Prisma setup

From `backend/`:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

These commands:

1. Generate the Prisma Client.
2. Apply development migrations.
3. Restore the known demo state.

### Migration commands

Create/apply a development migration after changing `schema.prisma`:

```bash
npx prisma migrate dev --name describe_the_change
```

Apply committed migrations in deployment environments:

```bash
npx prisma migrate deploy
```

Inspect migration status:

```bash
npx prisma migrate status
```

Regenerate the Prisma Client:

```bash
npm run prisma:generate
```

## Demo seed

Run:

```bash
cd backend
npm run prisma:seed
```

The seed is idempotent. It upserts the demo user and plans, restores two known assets, and recreates ten demo transactions. For the demo user only, it clears subscriptions, support tickets, non-demo assets, and previous ledger transactions. Unrelated users are preserved.

Seeded assets:

| Type | Product | Serial | Vehicle number |
|---|---|---|---|
| Battery | Battery L5 | `BAT-L5-2026-0001` | — |
| Vehicle | Electric 2 Wheeler | `VEH-2W-2026-0002` | `DL 1ER 4567` |

Seeded plans:

- Prepaid: Daily, Weekly, Monthly, Flexible
- Postpaid: 3 Days, 7 Days, 15 Days, 30 Days

The seeded ledger resolves to:

- Credits: ₹15,750.00
- Debits: ₹3,300.00
- Balance: ₹12,450.00

## Start in development

Run the backend and frontend in separate terminals.

### Terminal 1 — API

```bash
cd backend
npm run dev
```

API: `http://localhost:3000/api/v1`

### Terminal 2 — Web app

```bash
cd frontend
npm run dev
```

Web app: `http://localhost:5173`

### Terminal 3 — Admin portal

```bash
cd admin-frontend
npm run dev
```

Admin portal: `http://localhost:5174`

Bootstrap the first Super Admin from `backend/` before signing in:

```bash
ADMIN_BOOTSTRAP_EMAIL='superadmin@example.com' \
ADMIN_BOOTSTRAP_PASSWORD='replace-with-a-temporary-complex-password' \
npm run admin:bootstrap
```

Open the customer web app, enter `9876543210`, request an OTP, and verify with `123456`.

Customer OTP challenges expire after five minutes and are single-use. Admin authentication is separate and requires password, TOTP, CSRF-protected server-side session, and a mandatory bootstrap-password replacement.

## Production build and single-process start

Build the frontend first, then the backend:

```bash
cd frontend
npm ci
npm run build

cd ../backend
npm ci
npm run prisma:generate
npm run build
npx prisma migrate deploy
```

Start the production process from `backend/`:

```bash
NODE_ENV=production npm start
```

The Express server serves:

- API routes under `/api/v1`
- Static frontend assets from `frontend/dist`
- `frontend/dist/index.html` for non-API client-side routes

The frontend build must exist before starting with `NODE_ENV=production`.

## Package scripts

### Backend

| Script | Description |
|---|---|
| `npm run dev` | Start Express with TypeScript watch mode |
| `npm run build` | Compile backend TypeScript |
| `npm run typecheck` | Validate backend TypeScript without emitting files |
| `npm start` | Start the compiled server |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run development migrations |
| `npm run prisma:seed` | Restore the customer demo dataset |
| `npm run admin:bootstrap` | Create or intentionally reset the first Super Admin |

### Frontend

| Script | Description |
|---|---|
| `npm run dev` | Start Vite on `0.0.0.0` |
| `npm run build` | Typecheck and create a production build |
| `npm run typecheck` | Validate frontend TypeScript |
| `npm run lint` | Run ESLint with zero warnings allowed |
| `npm run check` | Run lint, typecheck, and production build |
| `npm run preview` | Preview the compiled frontend |
| `npm run mobile:doctor` | Inspect Capacitor and native tooling |
| `npm run mobile:apk:emulator` | Build the Android emulator debug APK |
| `npm run mobile:assets` | Regenerate native icons and splash assets |

See `MOBILE.md` for every mobile build and sync script.

## Authentication flow

1. Register a customer with a name and phone number, or use the seeded account.
2. Call/send OTP for the registered number.
3. Verify the static development OTP.
4. Store the returned JWT.
5. Send `Authorization: Bearer <token>` to protected endpoints.

The frontend stores the token in local storage and session storage for compatibility with restricted browser contexts. Beginning a fresh sign-in clears stale tokens.

## API conventions

Base path:

```text
/api/v1
```

Successful responses use a `data` envelope:

```json
{
  "data": {
    "user": {}
  }
}
```

Errors use an `error` envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Description of the error"
  }
}
```

Protected endpoints require:

```http
Authorization: Bearer <jwt>
```

## REST endpoints

### Auth and profile

| Method | Path | Authentication |
|---|---|---:|
| POST | `/api/v1/auth/register` | No |
| POST | `/api/v1/auth/send-otp` | No |
| POST | `/api/v1/auth/verify-otp` | No |
| GET | `/api/v1/users/me` | Yes |
| PATCH | `/api/v1/users/me` | Yes |

### Assets

| Method | Path | Authentication |
|---|---|---:|
| GET | `/api/v1/assets` | Yes |
| POST | `/api/v1/assets` | Yes |
| GET | `/api/v1/assets/:id` | Yes |
| POST | `/api/v1/assets/:id/lock` | Yes |
| POST | `/api/v1/assets/:id/unlock` | Yes |
| GET | `/api/v1/assets/:id/location` | Yes |
| GET | `/api/v1/assets/:id/health` | Yes |

### Plans and subscriptions

| Method | Path | Authentication |
|---|---|---:|
| GET | `/api/v1/plans` | No |
| POST | `/api/v1/subscriptions` | Yes |
| GET | `/api/v1/subscriptions/active` | Yes |

### Ledger

| Method | Path | Authentication |
|---|---|---:|
| GET | `/api/v1/ledger` | Yes |
| GET | `/api/v1/ledger?type=PAYMENT` | Yes |
| GET | `/api/v1/ledger/summary` | Yes |

Supported transaction filters:

```text
RENTAL, PAYMENT, PENALTY, INSURANCE, REFUND, ADJUSTMENT,
DEPOSIT, SECURITY, PROCESSING_FEE, CHALLAN, AMC, PARKING, CHARGING
```

### Payments

| Method | Path | Authentication |
|---|---|---:|
| POST | `/api/v1/payments/create` | Yes |
| GET | `/api/v1/payments/:id` | Yes |

Supported development payment methods:

```text
UPI, CARD, NET_BANKING
```

A successful payment creates a completed `PAYMENT` credit transaction and immediately updates the ledger balance.

### Support

| Method | Path | Authentication |
|---|---|---:|
| POST | `/api/v1/support/tickets` | Yes |
| GET | `/api/v1/support/tickets` | Yes |

Supported ticket types:

```text
ACCIDENT, HEALTH_ISSUE, LEASE_PAUSE, NOC_TRANSFER,
COMPLAINT, FORECLOSURE, REPORT_ISSUE, OTHER
```

### Admin authentication foundation

| Method | Path | Protection |
|---|---|---|
| POST | `/api/v1/admin/auth/login` | Password stage |
| POST | `/api/v1/admin/auth/verify-mfa` | Opaque challenge + TOTP/backup code |
| GET | `/api/v1/admin/auth/me` | HttpOnly admin session |
| GET | `/api/v1/admin/auth/csrf` | HttpOnly admin session |
| POST | `/api/v1/admin/auth/change-password` | Session + CSRF + current password |
| POST | `/api/v1/admin/auth/step-up` | Session + CSRF + fresh TOTP |
| POST | `/api/v1/admin/auth/logout` | Session + CSRF |
| POST | `/api/v1/admin/auth/revoke-all-sessions` | Session + CSRF |
| GET | `/api/v1/admin/dashboard/access` | Session + RBAC permission |
| GET | `/api/v1/admin/dashboard/step-up-access` | Session + RBAC + recent step-up |
| GET | `/api/v1/admin/dashboard/metrics` | Session + dashboard permission |
| GET | `/api/v1/admin/users` | Session + customer-read permission |
| GET | `/api/v1/admin/users/:id` | Session + customer-read permission + view audit |
| PATCH | `/api/v1/admin/users/:id` | Session + CSRF + customer-update permission + reason |
| PATCH | `/api/v1/admin/users/:id/status` | Session + CSRF + customer-update permission + TOTP step-up + reason |
| GET | `/api/v1/admin/assets` | Session + inventory-read permission |
| GET | `/api/v1/admin/assets/summary` | Session + inventory-read permission |
| GET | `/api/v1/admin/assets/:id` | Session + inventory-read permission + view audit |
| POST | `/api/v1/admin/assets` | Session + CSRF + inventory-create permission |
| GET/POST | `/api/v1/admin/assets/batches` | Read or secured batch issuance |
| POST | `/api/v1/admin/assets/verify-qr` | Session + CSRF + QR-verification permission |
| POST | `/api/v1/admin/assets/:id/qr` | Session + CSRF + QR permission + step-up |
| POST | `/api/v1/admin/assets/:id/assign` | Session + CSRF + assignment permission + step-up |
| POST | `/api/v1/admin/assets/:id/unassign` | Session + CSRF + assignment permission + step-up |
| PATCH | `/api/v1/admin/assets/:id/lifecycle` | Session + CSRF + inventory-create permission + step-up |
| GET | `/api/v1/admin/tickets` | Session + ticket-read permission |
| GET | `/api/v1/admin/tickets/summary` | Session + ticket-read permission |
| GET | `/api/v1/admin/tickets/assignees` | Session + ticket-read permission |
| GET | `/api/v1/admin/tickets/:id` | Session + ticket-read permission + view audit |
| PATCH | `/api/v1/admin/tickets/:id/assign` | Session + CSRF + ticket-update permission |
| PATCH | `/api/v1/admin/tickets/:id/priority` | Session + CSRF + ticket-update permission + reason |
| PATCH | `/api/v1/admin/tickets/:id/status` | Session + CSRF + ticket-update permission + workflow validation |
| POST | `/api/v1/admin/tickets/:id/notes` | Session + CSRF + ticket-update permission |
| GET | `/api/v1/admin/payments` | Session + payment-read permission |
| GET | `/api/v1/admin/payments/summary` | Session + payment-read permission |
| GET | `/api/v1/admin/payments/provider-reference/:reference` | Session + payment-read permission + lookup audit |
| GET | `/api/v1/admin/payments/export` | Session + payment-export permission + export audit |
| POST | `/api/v1/admin/payments/adjustments` | Session + CSRF + adjust permission + TOTP step-up + reason |
| POST | `/api/v1/admin/payments/:id/refunds` | Session + CSRF + refund permission + TOTP step-up + linkage |
| GET | `/api/v1/admin/audit` | Session + audit-read permission |
| GET | `/api/v1/admin/audit/export` | Session + audit-export permission + export audit |
| GET | `/api/v1/admin/admins` | Session + administrator-read permission |
| POST | `/api/v1/admin/admins/invite` | Session + CSRF + manage permission + TOTP step-up + reason |
| PATCH | `/api/v1/admin/admins/:id/role` | Session + CSRF + manage permission + TOTP step-up + reason |
| PATCH | `/api/v1/admin/admins/:id/status` | Session + CSRF + manage permission + TOTP step-up + reason |
| POST | `/api/v1/admin/admins/:id/reset-credentials` | Session + CSRF + manage permission + TOTP step-up + reason |
| GET | `/api/v1/admin/admins/sessions` | Session + administrator-read permission |
| POST | `/api/v1/admin/admins/sessions/:id/revoke` | Session + CSRF + manage permission + TOTP step-up + reason |
| GET/PATCH | `/api/v1/admin/settings` | System-configure permission; mutation also requires CSRF + TOTP + reason |
| GET | `/api/v1/admin/data/catalog` | Super Admin master-data read permission |
| GET | `/api/v1/admin/data/:datasetType/records` | Super Admin master-data read permission |
| GET | `/api/v1/admin/data/:datasetType/export` | Super Admin export permission + export audit |
| POST | `/api/v1/admin/data/:datasetType/validate` | Session + CSRF + master-data import permission |
| POST | `/api/v1/admin/data/:datasetType/import` | Session + CSRF + import permission + TOTP step-up + reason |

All operational admin endpoints are implemented only through controller/service/routes modules. There is no raw SQL or database console in the portal.

## Frontend routes

| Route | Screen |
|---|---|
| `/` | Splash and auth routing |
| `/login` | Login, registration, and OTP |
| `/dashboard` | Account overview and quick actions |
| `/assets` | Asset list |
| `/assets/add` | QR simulation and manual asset entry |
| `/assets/:id` | Asset details and lock controls |
| `/assets/:id/health` | Asset health and telemetry |
| `/plans` | Plan selection and subscription |
| `/ledger` | Wallet balance and transactions |
| `/payments` | Wallet recharge flow |
| `/support` | Support Hub and tickets |
| `/profile` | Customer profile and logout |

All customer routes except `/`, `/login`, and public static files are protected by the frontend route guard. The API remains the source of truth for authorization.

Admin frontend routes:

| Route | Screen |
|---|---|
| `/login` | Admin password and TOTP/backup-code authentication |
| `/change-password` | Required bootstrap-password replacement |
| `/` | Authenticated operational dashboard |
| `/customers` | Searchable and paginated customer directory |
| `/customers/:id` | Audited authenticated-customer operational profile and controls |
| `/customers/portfolio/:id` | Loan ID, batteries, dealers, finance, risk and linked-user activity |
| `/inventory` | Searchable inventory, lifecycle metrics, QR verification, and batches |
| `/inventory/new` | Individual battery/vehicle and signed QR issuance |
| `/inventory/batches/new` | Generated or CSV batch issuance and export |
| `/inventory/:id` | Assignment, lifecycle, telemetry, and QR controls |
| `/tickets` | Filtered support queue and SLA metrics |
| `/tickets/:id` | Assignment, priority, status, notes, and resolution workflow |
| `/payments` | Finance monitoring, filters, provider lookup, export, and adjustments |
| `/payments/:id` | Finance linkage detail and partial-refund workflow |
| `/audit` | Sanitized append-only audit explorer and export |
| `/admins` | Administrator directory and secure invitation |
| `/admins/:id` | Administrator posture, permissions, lifecycle, and controls |
| `/sessions` | Global admin session explorer and revocation |
| `/settings` | Enforced system feature gates and security baseline |
| `/data` | Super-Admin governed business-data catalog and import history |
| `/data/:datasetType` | Validated CSV import, current records, exports, and version history |
| `/analytics/datasets` | Persistent analytical dataset history |
| `/analytics/datasets/upload` | CSV/XLSX/XLS upload and animated analysis flow |
| `/analytics/datasets/:id` | Dataset status, profile, preview, refresh, and analysis |
| `/analytics/dashboards` | Persistent dashboard history |
| `/analytics/dashboards/:id` | Interactive dashboard renderer and self-service Comparison Studio |
| `/analytics/dashboards/:id/edit` | Visualization and layout editor |
| `/analytics/dashboards/:id/present` | Sidebar-free, wide presentation dashboard for a separate tab |

## Data model summary

- `User` — customer identity and profile
- `Asset` — customer battery or vehicle, location, state, and stored telemetry
- `Plan` — prepaid or postpaid pricing configuration
- `Subscription` — active plan association between user and asset
- `Transaction` — fixed-precision ledger entry with provider, admin-action, and refund linkage
- `SupportTicket` — customer issue, assignment, SLA, priority, and resolution status
- `SupportTicketNote` — private admin collaboration note
- `AdminUser` — separate privileged identity and five-role assignment
- `AdminSession` — hashed opaque session, CSRF, revocation, and step-up state
- `AdminLoginChallenge` — short-lived two-stage login challenge
- `AdminBackupCode` — single-use hashed recovery code
- `AdminAuditLog` — immutable privileged-operation audit event
- `AssetBatch` — inventory batch issuance foundation
- `SystemSetting` — strongly typed, enforced platform feature gates and limits
- `MasterDataImportJob` — source hash, validation/import counts, actor, and provenance
- `MasterDataRecordVersion` — normalized versioned record with one current version per business key
- `PortfolioAccount` — unique Customer Loan ID and optional authenticated-user link
- `PortfolioCase` — typed battery-finance case, lease position, status, bucket and risk flags
- `Dealer` — normalized dealer identity and home state
- `PortfolioImportJob` — idempotent source hash and reconciliation report
- `CustomerIdentityImportJob` — data-minimized Collection MIS login bootstrap provenance
- `CustomerActivity` — customer login and operational activity timeline

The complete Prisma schema is in `backend/prisma/schema.prisma`.

## Development providers

### OTP

The development OTP is static but still requires an active challenge. Challenges expire after five minutes and are deleted after successful verification.

### Device health

`DeviceProvider` reads stored battery and temperature values. When values are missing, the development provider creates deterministic values from the serial number and persists them. A real IoT implementation can replace the provider without changing routes or controllers.

### Payments

`PaymentProvider` returns a successful development reference. The application then creates a real PostgreSQL transaction. A real payment gateway can replace the provider without changing the API contract.

## Quality checks

Run before committing or deploying:

```bash
cd frontend
npm run check
npm audit

cd ../backend
npm run typecheck
npm run build
npm audit

cd ../admin-frontend
npm run check
npm audit
```

Validate Prisma and seed data:

```bash
cd backend
npx prisma validate
npm run prisma:seed
```

## Responsive and accessibility behavior

- Layouts support 320px phones through desktop widths.
- Fixed actions account for mobile safe areas.
- Transaction chips scroll horizontally without widening the page.
- Dialog focus is trapped and restored on close.
- Escape closes the support bottom sheet.
- Keyboard focus rings are visible.
- Reduced-motion preferences disable long animations.
- Loading skeletons, empty states, errors, and retries are provided for data-driven screens.
- The supplied `LOGO.png` is used through one responsive `BrandLogo` component.

## Troubleshooting

### `P1001` or database connection errors

Confirm PostgreSQL is running and `DATABASE_URL` is correct:

```bash
pg_isready -h localhost -p 5432
```

### Prisma migration cannot create a shadow database

For local `prisma migrate dev`, the PostgreSQL role needs permission to create databases:

```sql
ALTER ROLE batfin CREATEDB;
```

Production deployments should use `prisma migrate deploy`, which does not create a development shadow database.

### Demo phone returns `USER_NOT_FOUND`

Run:

```bash
cd backend
npm run prisma:seed
```

### Login returns to the login screen

- Begin a fresh login to clear stale JWTs.
- Confirm the API is running on port 3000.
- Confirm `/api` is being proxied by Vite.
- Request a new OTP before entering `123456`.

### Tailwind styles do not appear

From `frontend/`:

```bash
npm ci
npm run build
npm run dev
```

Tailwind is configured through `tailwind.config.cjs`, `postcss.config.cjs`, and the layer directives in `src/index.css`.

### Production server cannot find a frontend

Both SPAs are required before starting Express with `NODE_ENV=production`:

```bash
cd frontend && npm run build
cd ../admin-frontend && npm run build
cd ../backend && npm run build
NODE_ENV=production npm start
```

Set `CUSTOMER_HOSTNAME` and `ADMIN_HOSTNAME` so the single Express deployment can select the correct build. See [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Current non-production integrations

The following are intentionally development implementations:

- OTP delivery
- Payment processing
- Device/IoT telemetry
- GPS source

Before production use, replace these providers, rotate all secrets, configure HTTPS, add operational monitoring, and apply the organization’s security and compliance requirements.
