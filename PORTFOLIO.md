# BatFIN Portfolio Customer & Finance System

## Source-of-truth flow

```text
Master Data worksheet / CSV
→ validated idempotent import
→ PostgreSQL Dealer + PortfolioAccount + PortfolioCase
→ customer app + admin directory + admin dashboard
→ subsequent user/admin actions update the same database
```

The workbook is bootstrap/reconciliation input only. It is not read at runtime.

## Normalized model

- `PortfolioAccount`: one unique business account per `Customer Loan ID`; optionally linked to an authenticated `User`.
- `PortfolioCase`: one or more case rows under an account. This preserves the three duplicate loan IDs in the supplied source without merging or dropping valid case rows.
- `Dealer`: normalized dealer identity and home state.
- `PortfolioImportJob`: source hash, import counts, warnings, errors and reconciliation evidence.
- `CustomerActivity`: login, registration, profile, asset, subscription, payment, ticket and claim activity.
- `User.lastLoginAt` / `lastActivityAt`: live customer activity timestamps.

The portfolio workbook itself contains no phone/email credentials, so that source alone never fabricates login identities. Imported portfolio accounts appear immediately in the Admin Customer Directory. When a separately governed Collection MIS source supplies a valid mobile number, the identity importer creates or reuses the corresponding OTP `User` and links by Loan Account Number. Customers can also self-claim by proving Customer Loan ID, exact normalized name and a non-placeholder battery number. One login can own multiple portfolio accounts. Valid linked battery serials are provisioned into the existing `Asset` table without reassigning a serial already owned by another user.

## Import

```bash
cd backend
npm run portfolio:import -- /path/to/BatFIN_Portfolio_Summary_July26_Final.csv
```

CSV, XLS and XLSX are supported. XLS/XLSX imports select `Master Data`; summary worksheets are never imported as runtime facts.

The import validates required fields, dates, numbers, statuses, buckets, names, duplicate loan IDs and duplicate batteries. Re-running the exact source hash is a no-op. A changed source upserts accounts/cases and archives facts absent from the new snapshot.

Admin API/UI:

```text
POST /api/v1/admin/portfolio/import
GET  /api/v1/admin/portfolio/summary
GET  /api/v1/admin/portfolio/imports
GET  /api/v1/admin/portfolio/accounts
GET  /api/v1/admin/portfolio/accounts/:id
PATCH /api/v1/admin/portfolio/cases/:id/status
POST /api/v1/admin/portfolio/accounts/:id/link-user
```

Public authenticated customer API:

```text
GET  /api/v1/users/me/portfolio
POST /api/v1/users/me/portfolio/claim
```

## Imported fixture result

```text
Source case rows (TOTAL excluded): 664
Unique Customer Loan IDs:          661
Portfolio accounts:                661
Unique normalized customer names:  596
Case records:                      664
Dealers:                            72
Battery assignments:               644
Unique non-placeholder batteries:  623
Active cases:                       638
Redeployed:                          20
Repo:                                 4
Foreclosed:                           2
Delinquent:                           32
NPA + Repo:                            5
```

Financial calculations from case rows:

```text
EMI total:              ₹3,267,757
DP total:              ₹10,266,399
Contracted demand:     ₹50,396,055
Billed to date:         ₹8,640,620
Future demand:         ₹41,755,435
```

The workbook TOTAL row differs from case-row arithmetic by ₹1 for Billed to Date and ₹1 in the opposite direction for Future Demand. This is retained as a reconciliation variance; database facts are not altered to force a match.

## Customer login identity bootstrap

The governed Collection MIS export can bootstrap real OTP login accounts using only the minimum required identity fields:

```bash
cd backend
npm run customers:import-lms -- /path/to/lms068_collection_mis_*.csv
```

Persisted from this source:

- Loan Account Number
- Source Application Number
- Global Customer ID
- LMS Customer ID
- Customer Name
- normalized Indian mobile number

PAN, Aadhaar, voter ID, driving licence, CIBIL, addresses, relatives, caste, gender and other identity-document fields are not copied into the login/portfolio tables.

Current import result:

```text
Valid unique mobile identities: 614
Login users created:           614
Portfolio accounts linked:     611
Unmatched LMS loan accounts:     3
Link conflicts:                  0
```

Re-running the same source is idempotent. The existing demo user remains separate, so the local database contains 615 total `User` rows after bootstrap.

## Live updates

The monolithic Express service publishes in-process domain invalidations through Server-Sent Events:

```text
GET /api/v1/admin/dashboard/events
```

The admin dashboard and customer directory refetch aggregates after customer registration/login/profile changes, asset changes, subscriptions, payments, support tickets, portfolio claims/imports and portfolio status changes. A 30-second polling fallback handles disconnects.

## Security

- Customer ownership enforced by JWT middleware.
- Admin portfolio routes enforce server-side RBAC.
- Imports require `portfolio.import` and CSRF.
- Status/link changes require `portfolio.manage`, CSRF, recent TOTP step-up and an audit reason.
- Imported phone/email/login values are never fabricated.
- Payment transactions are not fabricated from DP/EMI/demand fields.
- Source values are retained in `sourceData` for governed investigation.
