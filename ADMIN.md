# BatFIN Administration Portal

The BatFIN admin portal is a separate, web-only, subdomain-ready frontend backed by the existing Express/PostgreSQL application. It is intentionally not a raw database console. All operations must pass through authenticated, permission-checked, audited REST endpoints.

## Selected architecture

- Admin frontend: `admin-frontend/`
- Development URL: `http://localhost:5174`
- Production target: `https://admin.example.com`
- Admin API base: `/api/v1/admin`
- Shared backend and PostgreSQL database
- Separate admin identities and sessions from customer JWT accounts
- No admin functionality in the mobile application

## Security model

Admin authentication uses:

1. Email and Argon2id password verification
2. Authenticator-app TOTP
3. Single-use hashed backup codes
4. Short-lived opaque server-side sessions
5. `HttpOnly`, `Secure`, `SameSite=Strict` cookies
6. Per-session CSRF tokens
7. Fresh TOTP step-up verification for sensitive Super Admin actions
8. Login throttling and temporary lockout
9. Session revocation
10. Immutable audit records for successful and rejected operations

TOTP secrets are encrypted at rest. Passwords, raw session tokens, raw CSRF tokens, TOTP secrets, and backup codes are never written to audit metadata.

## Roles

| Role | Intended responsibilities |
|---|---|
| Support Agent | View customers/assets and process support tickets |
| Operations Manager | Manage inventory, assignments, serials, batches, and QR verification |
| Finance Manager | Monitor/export payments and run controlled adjustments/refunds |
| Auditor | Read-only access to operations, payments, admins, and audit logs |
| Super Admin | Full permissions, admin management, and system configuration |

The permission map is defined in `backend/src/config/admin-permissions.ts`.

## Inventory and QR design

The existing `Asset` model now supports unassigned inventory:

- Nullable customer assignment
- Inventory lifecycle status
- Batch association
- Creating-admin association
- QR token hash
- QR issue timestamp
- Verification timestamp

`AssetBatch` supports CSV/batch issuance. QR payloads are HMAC-SHA256 signed, and only a token hash is stored in PostgreSQL. Authorized admins can create individual inventory, import batches, generate QRs, verify scans, and assign or unassign customers.

## Admin database foundation

The following models are available:

- `AdminUser`
- `AdminSession`
- `AdminLoginChallenge`
- `AdminBackupCode`
- `AdminAuditLog`
- `AssetBatch`

The customer `Asset` model has been extended for inventory and QR lifecycle management.

## Development phases

### Admin Phase 0 — Foundation (complete)

- Separate admin frontend scaffold
- Separate Vite development port
- Subdomain-ready API configuration
- Five-role permission map
- Admin/session/MFA/audit database models
- Inventory batch and QR lifecycle fields
- Backend admin module scaffolds
- No admin API exposed before security middleware exists

### Admin Phase 1 — Authentication and authorization (complete)

- Secure Super Admin bootstrap command
- Argon2id passwords
- Encrypted TOTP secrets
- TOTP enrollment QR and verification
- Single-use Argon2id-hashed backup codes
- Two-stage opaque login challenges
- Opaque server-side sessions and CSRF protection
- HttpOnly, SameSite=Strict admin cookie
- Required bootstrap-password replacement
- Logout and revoke-all-sessions
- Five-minute TOTP step-up verification
- Role/permission middleware
- Authentication audit events
- Admin login, setup, backup-code, password-change, and secured dashboard screens

Admin auth endpoints:

```text
POST /api/v1/admin/auth/login
POST /api/v1/admin/auth/verify-mfa
GET  /api/v1/admin/auth/me
GET  /api/v1/admin/auth/csrf
POST /api/v1/admin/auth/change-password
POST /api/v1/admin/auth/step-up
POST /api/v1/admin/auth/logout
POST /api/v1/admin/auth/revoke-all-sessions
GET  /api/v1/admin/dashboard/access
GET  /api/v1/admin/dashboard/step-up-access
```

### Admin Phase 2 — Dashboard and customer management (complete)

- Live customer, asset, subscription, ticket, and monthly payment metrics
- Recent-customer dashboard feed
- Searchable and status-filtered customer directory
- Server-side pagination with bounded page sizes
- Complete customer operational profile
- Asset, subscription, transaction, balance, and ticket summaries
- Permission-controlled profile correction with mandatory audit reason
- TOTP step-up protected suspension, closure, and reactivation
- Immediate blocking of suspended customer OTP and existing JWT access
- Read-only Auditor verification
- Audit events for customer views and every mutation

Admin customer endpoints:

```text
GET   /api/v1/admin/dashboard/metrics
GET   /api/v1/admin/users
GET   /api/v1/admin/users/:id
PATCH /api/v1/admin/users/:id
PATCH /api/v1/admin/users/:id/status
```

### Admin Phase 3 — Inventory, serials, batches, and QR (complete)

- Individual battery/vehicle inventory creation
- Optional admin-provided or collision-checked generated serials
- CSV one-column serial import
- Generated batches of up to 500 assets
- All-or-nothing batch collision and duplicate validation
- HMAC-SHA256 signed `BTF1` QR payloads
- Random QR tokens with only SHA-256 hashes stored in PostgreSQL
- QR verification and invalid/tampered QR rejection
- QR rotation with immediate previous-token invalidation
- Customer assignment and unassignment
- Active-subscription guard before unassignment/retirement
- Available, assigned, maintenance, and retired lifecycle
- Step-up TOTP for assignment, lifecycle, and QR rotation
- Downloadable batch CSV results containing signed payloads
- Complete inventory mutation audit trail

Admin inventory endpoints:

```text
GET   /api/v1/admin/assets
GET   /api/v1/admin/assets/summary
GET   /api/v1/admin/assets/:id
POST  /api/v1/admin/assets
GET   /api/v1/admin/assets/batches
GET   /api/v1/admin/assets/batches/:id
POST  /api/v1/admin/assets/batches
POST  /api/v1/admin/assets/verify-qr
POST  /api/v1/admin/assets/:id/qr
POST  /api/v1/admin/assets/:id/assign
POST  /api/v1/admin/assets/:id/unassign
PATCH /api/v1/admin/assets/:id/lifecycle
```

### Admin Phase 4 — Ticket operations (complete)

- Searchable and paginated support queue
- Status, priority, type, assignment, and SLA filters
- Type-based initial priority and SLA policy
- Open, in-progress, resolved, closed, overdue, critical, and unassigned metrics
- Permission-checked assignee directory
- Assignment/unassignment with automatic first-response tracking
- Low, normal, high, and critical priority with SLA recalculation
- Enforced status-transition workflow
- Customer-visible resolution messages
- Private internal admin notes
- SLA, response, resolution, and closure timestamps
- Customer portal resolution visibility without internal-note exposure
- Complete ticket view, assignment, priority, status, and note audit history

Admin ticket endpoints:

```text
GET   /api/v1/admin/tickets
GET   /api/v1/admin/tickets/summary
GET   /api/v1/admin/tickets/assignees
GET   /api/v1/admin/tickets/:id
PATCH /api/v1/admin/tickets/:id/assign
PATCH /api/v1/admin/tickets/:id/priority
PATCH /api/v1/admin/tickets/:id/status
POST  /api/v1/admin/tickets/:id/notes
```

### Admin Phase 5 — Payment monitoring and finance operations (complete)

- Searchable, paginated payment/refund/adjustment monitoring
- Completed, pending, and failed payment metrics and filters
- Entry type, direction, method, India-date-range, customer, and reference filters
- Exact indexed provider-reference lookup for payments and refunds
- Filter-preserving CSV export with spreadsheet-formula injection protection
- Transaction detail views with customer, provider, actor, reason, and reversal linkage
- Fixed-precision `DECIMAL(14,2)` transaction amounts
- First-class payment method, provider reference, source, actor, reason, and original-payment fields
- Explicit `payments.adjust` and `payments.refund` permissions
- TOTP step-up and CSRF protection for every financial mutation
- Serializable PostgreSQL transactions for credit/debit adjustments and refunds
- Mandatory reasons and immutable acting-admin linkage
- Unique idempotency keys with duplicate-request rejection
- Debit adjustment and refund balance-safety checks
- Partial refunds with remaining-amount calculation and over-refund rejection
- Development refund-provider boundary with real linked ledger writes
- Customer ledger and wallet balance updates immediately after completed operations
- Finance view, lookup, export, adjustment, and refund audit history

Admin finance endpoints:

```text
GET  /api/v1/admin/payments
GET  /api/v1/admin/payments/summary
GET  /api/v1/admin/payments/export
GET  /api/v1/admin/payments/provider-reference/:reference
GET  /api/v1/admin/payments/:id
POST /api/v1/admin/payments/adjustments
POST /api/v1/admin/payments/:id/refunds
```

The mutation routes require the admin session cookie, a current CSRF token, the relevant finance write permission, and TOTP step-up completed within five minutes. The gateway adapter remains a development provider, but all resulting adjustment/refund records, balance changes, linkages, constraints, and audits are real PostgreSQL transactions.

### Admin Phase 6 — Governance, settings, and hardening (complete)

- Searchable and paginated append-only audit explorer
- Action, resource, administrator, outcome, and India-date filters
- Sanitized CSV audit exports with spreadsheet-formula injection protection
- Recursive credential-key redaction on audit writes and reads
- PostgreSQL trigger rejecting every `AdminAuditLog` update or deletion
- Administrator directory, security posture, effective permissions, and lifecycle detail
- One-time temporary-password invitation workflow without simulated email delivery
- Role and status changes with self-mutation and last-active-Super-Admin safeguards
- Credential/TOTP/backup-code reset returning a temporary password once
- Global admin session explorer without exposing session or CSRF hashes
- Individual and account-wide attributed session revocation
- Real PostgreSQL system settings for maintenance, registration, OTP login, wallet recharge, support email, and recharge maximum
- Customer API, authentication, and payment enforcement for every configurable setting
- Helmet CSP/HSTS/frame/no-sniff/referrer security headers
- Global API, admin login, admin MFA, OTP send, and OTP verification rate limits
- Request IDs, no-store API responses, CORS allowlists, body limits, and optional production host allowlists
- Separate customer/admin SPA host routing from the same Express deployment
- Database-backed readiness and process liveness endpoints
- Keyboard focus trapping, Escape handling, focus restoration, skip navigation, and responsive governance screens
- Complete single-deployment production guide in `DEPLOYMENT.md`

Admin governance endpoints:

```text
GET  /api/v1/admin/audit
GET  /api/v1/admin/audit/summary
GET  /api/v1/admin/audit/facets
GET  /api/v1/admin/audit/export

GET   /api/v1/admin/admins
GET   /api/v1/admin/admins/summary
GET   /api/v1/admin/admins/:id
POST  /api/v1/admin/admins/invite
PATCH /api/v1/admin/admins/:id/role
PATCH /api/v1/admin/admins/:id/status
POST  /api/v1/admin/admins/:id/reset-credentials
POST  /api/v1/admin/admins/:id/revoke-sessions

GET  /api/v1/admin/admins/sessions
GET  /api/v1/admin/admins/sessions/summary
POST /api/v1/admin/admins/sessions/:sessionId/revoke

GET   /api/v1/admin/settings
PATCH /api/v1/admin/settings
GET   /healthz
GET   /readyz
```

Auditors can read administrators, sessions, and audit records and can export audit data, but cannot mutate identities or settings. Every identity, session, credential-reset, and settings mutation requires Super Admin permission, CSRF verification, recent TOTP step-up, and a reason.

## Governed Business Data extension

Super Admin now has a dedicated `/data` area for validated staff, Collection MIS, insurance, charge, deliverable, repayment, sanction, channel, mapping, quick-link, and property-title datasets.

- Sixteen schema-aware CSV templates
- Preview validation before commit
- SHA-256 source identity without raw-file retention
- Serializable PostgreSQL imports
- Versioned upsert by domain business key
- Immutable record-version and import-job provenance
- Restricted staff and data-minimized Collection MIS sections
- CSV export and complete audit trail
- Header-only templates accepted as zero-record sections
- No automatic admin-account creation from employee records

Permissions:

```text
master_data.read
master_data.import
master_data.export
```

All three currently belong only to Super Admin. See `BUSINESS_DATA.md` for the imported counts, business keys, privacy exclusions, source limitations, endpoints, and future-template process.

## Portfolio customer and finance extension

The existing Customer Directory now defaults to database-backed portfolio customers imported from Master Data and includes a separate Login Accounts tab. Customer Loan ID is the unique account business key; repeated loan IDs remain separate typed case rows under that account. Admin dashboard portfolio, case, risk, battery and financial metrics are calculated from PostgreSQL.

Super Admin can run idempotent CSV/XLS/XLSX portfolio Import/Sync and a separate data-minimized Collection MIS customer-login import from the directory. The latter creates/reuses OTP users from valid mobile numbers and links them by Loan Account Number without copying identity documents, CIBIL, addresses or relatives. Portfolio case status and manual login-account linking require permission, CSRF, fresh TOTP step-up and an audit reason. See `PORTFOLIO.md` for architecture, reconciliation and imported counts.

## AI Analytics / BI extension

Super Admin has a persistent `/analytics` workspace for CSV/XLSX/XLS ingestion, worksheet selection, profiling, privacy-aware OpenRouter analysis, deterministic fallback, semantic models, reconciled/versioned dashboard specifications, safe PostgreSQL queries, cross-filtering, Ask Data, query-backed insights, exports, chart editing, regeneration, duplication, and history.

The AI generates only validated semantic, intent, dashboard, and narrative JSON. It never generates React, SQL, or application source code. OpenRouter is optional and server-only; deterministic fallback completes the full workflow without a key. PostgreSQL remains authoritative for every number, percentage, rank, chart, and evidence reference.

See `ANALYTICS.md` for architecture, API routes, limits, storage, security, visualization registry, and tests.

## Bootstrap a Super Admin

Run from `backend/` with a temporary password that meets the 14-character complexity policy:

```bash
ADMIN_BOOTSTRAP_EMAIL='superadmin@example.com' \
ADMIN_BOOTSTRAP_PASSWORD='replace-with-a-temporary-password' \
ADMIN_BOOTSTRAP_NAME='BatFIN Super Admin' \
npm run admin:bootstrap
```

The command creates an invited Super Admin without printing the TOTP seed or enrollment URI. After the correct password is entered, the admin portal displays the one-time TOTP enrollment UI. The first successful TOTP verification activates the account and displays ten backup codes once. The temporary password must then be changed before any permission-gated route is accessible.

The bootstrap command refuses to overwrite an existing admin. Intentional credential recovery requires `ADMIN_BOOTSTRAP_FORCE=true`, which revokes sessions, resets TOTP, and writes an audit event.

Admin CSRF tokens are synchronized across open portal tabs with `BroadcastChannel`. Development Strict Mode uses a single-flight session bootstrap, and protected JSON requests automatically renew and retry once after a stale-token rejection. This prevents a presentation tab or another admin tab from invalidating destructive actions in the original tab.

## Development

Install and run:

```bash
cd admin-frontend
npm ci
npm run dev
```

The admin frontend uses port `5174` and proxies `/api` to the existing backend on port `3000`.

The authenticated portal now exposes permission-aware dashboard, customer, inventory/QR, ticket, finance, audit, administrator, session, and settings navigation. Admin Phases 0–6 are complete. See `DEPLOYMENT.md` for the production subdomain and single-process release procedure.
