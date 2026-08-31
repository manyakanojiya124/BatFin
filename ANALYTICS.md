# BatFIN Universal AI Analytics / BI Engine

BatFIN Analytics is integrated into the existing React + Vite admin portal and shared Express/PostgreSQL/Prisma deployment. It is a dataset-agnostic analytics engine, not a hard-coded dashboard. It does not generate React, HTML, SQL, or executable code with AI; execute LLM SQL; expose OpenRouter credentials; require Redis; or create a separate application.

## Processing architecture

```text
CSV / XLS / XLSX
→ private source storage + SHA-256
→ workbook and sheet discovery
→ intelligent header detection
→ deterministic cell normalization
→ summary-row exclusion and quality profiling
→ normalized PostgreSQL JSONB rows
→ privacy-aware compact context
→ OpenRouter interpretation or deterministic fallback
→ Zod validation
→ deterministic semantic reconciliation
→ visualization compatibility/cardinality reconciliation
→ bounded query preflight
→ immutable dashboard version
→ structured PostgreSQL query DSL
→ Recharts renderer
```

PostgreSQL owns numbers, aggregation, filtering, percentages, ranking, derived operations, time grouping, Top N/Other, chart data, exports, and evidence. AI is limited to semantic interpretation, dashboard recommendations, question intent, and narrative explanation.

## Supported sources

- CSV, including title/description rows before the real header
- XLS
- XLSX
- Multi-sheet workbooks with deterministic primary-sheet recommendation
- Numeric, categorical, boolean, date, datetime, text, and mixed columns
- Indian and ISO-style dates, including `DD-MMM-YY`
- Currency strings and accounting negatives
- Null markers including blank, `-`, `--`, em dash, `NA`, and `N/A`
- Dynamically detected total/grand-total/subtotal rows excluded from normalized facts

Default limits are configurable:

```dotenv
ANALYTICS_MAX_FILE_BYTES=26214400
ANALYTICS_MAX_ROWS=50000
ANALYTICS_MAX_COLUMNS=500
ANALYTICS_MAX_SHEETS=50
ANALYTICS_HEADER_SCAN_ROWS=50
ANALYTICS_ANALYSIS_TIMEOUT_MS=300000
```

`ANALYTICS_MAX_ROWS` supports configuration up to 1,000,000 rows.

## Semantic engine

The semantic model persists:

- physical and semantic field roles
- identifier/dimension/measure/date classification
- status, geography, entity, risk, and segment dimension roles
- count, value, currency, rate, risk, quantity, and duration measure roles
- aggregation, additive behavior, format, ISO currency, unit, and confidence
- default time grain
- safe suggested filters

The deterministic domain registry includes generic, finance, sales, HR, inventory, and BatFIN lending/portfolio specializations. Domain plugins provide ranking and interpretation signals only; the renderer and query engine remain universal.

Constant fields, fields with at least 90% nulls, sensitive identifiers, and incompatible field/type combinations are removed from generated defaults. AI output is reconciled against physical profile evidence before persistence.

## Dashboard integrity

Every generated or edited visualization is checked so that title, type, dimension, measure, aggregation, time grain, sorting, and the actual query agree. Titles are canonicalized, for example:

```text
Contracted Demand (Rs) by Deployment State
Dimension: deployment_state
Measure: contracted_demand_rs
Aggregation: SUM
```

Generation runs these gates:

```text
Zod schema validation
→ registered-field validation
→ semantic role validation
→ canonical title/configuration reconciliation
→ constant/sparsity/cardinality validation
→ visualization compatibility validation
→ bounded data preflight
→ persistence
```

## Query capabilities

- KPI aggregation
- grouped aggregation
- chronological date grouping by day/week/month/quarter/year
- Top N + Other
- complete stacked groups
- deterministic sort modes
- typed filters
- table pagination
- histogram query mode
- correlation query mode
- batch widget querying with one dashboard context load
- high-cardinality server-side filter search with short-lived cache
- query-backed evidence insights
- safe CSV export with spreadsheet-formula escaping

The browser sends structured query JSON only. All fields and metrics are checked against the current semantic model and physical schema before parameterized Prisma/PostgreSQL queries execute.

## Dashboard experience

- BatFIN prototype-derived Manrope/Inter visual language and teal/ink design tokens
- compact KPI cards with INR `K/L/Cr` formatting
- format-aware axes, tooltips, tables, dates, currency, percentages, and units
- horizontal bars for high-cardinality categories
- Top N and date-grain controls
- one-click expanded chart/table modal with refresh and export
- sidebar-free wide presentation route for a separate browser tab
- self-service Comparison Studio for bar, line, area, pie, donut, and stacked charts
- user-selected category, measure, aggregation, Top N, width, and legend/comparison columns
- chart-click cross-filtering
- compact searchable filter popovers and mobile filter drawer
- active filter pills and clear-all
- debounced filters
- batch widget requests, AbortController cancellation, and stale-response guards
- responsive 1/2/12-column grid without implicit mobile columns
- table pagination, column visibility, row details, and filtered export
- progressive-disclosure dataset quality and preview screens
- duplicate-source SHA-256 badges and explicit permanent-delete controls
- query-backed evidence cards
- Ask Data answer + metrics/chart + methodology + validated evidence
- useful empty/error/loading states

The UI supports 320px mobile through large desktop layouts and preserves the existing light admin theme.

## Ask Data

```text
Question
→ validated intent schema
→ allowed semantic fields/metrics
→ semantic compatibility validation
→ structured deterministic query
→ PostgreSQL result/evidence
→ OpenRouter explanation or deterministic fallback
→ answer schema validation
→ evidence-reference validation
→ answer + chart + methodology
```

AI never supplies SQL or authoritative arithmetic. If OpenRouter is unavailable, the deterministic intent and narrative fallback remain operational.

## OpenRouter

Server-only configuration:

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_TIMEOUT_MS=45000
OPENROUTER_MAX_RETRIES=1
OPENROUTER_MAX_OUTPUT_TOKENS=4096
```

Do not use `VITE_*` or any browser-public variable for the OpenRouter key. Missing, invalid, timed-out, rate-limited, malformed, or schema-invalid responses activate validated deterministic fallback.

## Admin routes

```text
/analytics/datasets
/analytics/datasets/upload
/analytics/datasets/:datasetId
/analytics/dashboards
/analytics/dashboards/:dashboardId
/analytics/dashboards/:dashboardId/edit
/analytics/dashboards/:dashboardId/present
```

Only Super Admin currently receives `analytics.read`, `analytics.create`, and `analytics.manage`.

## Analytics API

Existing dataset and dashboard lifecycle routes are preserved. Query additions are:

```text
POST /api/v1/admin/analytics/dashboards/:id/query
POST /api/v1/admin/analytics/dashboards/:id/query-batch
POST /api/v1/admin/analytics/dashboards/:id/visualizations/:widgetKey/query
POST /api/v1/admin/analytics/dashboards/:id/filter-options
POST /api/v1/admin/analytics/dashboards/:id/insights
POST /api/v1/admin/analytics/dashboards/:id/ask
POST   /api/v1/admin/analytics/dashboards/:id/export
DELETE /api/v1/admin/analytics/datasets/:id/permanent
```

The permanent-delete operation requires `analytics.manage`, CSRF validation, a recent TOTP step-up, the exact dataset name in the UI, and a 10–500 character audit reason. It removes the private source, normalized rows, profiles, semantic models, dashboards, filters, and insights while retaining only the minimized append-only security audit tombstone.

All mutation routes require an authenticated admin session, permission, and CSRF token.

## Security

- Opaque, hashed admin session and CSRF values
- RBAC and TOTP step-up where required
- Owner checks on every dataset/dashboard operation
- extension, MIME, signature, size, row, column, and sheet limits
- path-safe private storage and SHA-256 source verification
- sensitive sample redaction before AI context generation
- no passwords, session values, CSRF values, TOTP seeds, or backup codes in analytics logs/audits
- no raw AI response persistence
- JSON extraction + Zod validation + semantic validation + compatibility validation + preflight
- parameterized PostgreSQL JSONB analytics
- optimistic dashboard version concurrency
- append-only audit events
- CSV formula-injection defense

## Regression fixture

The primary fixture is checked into:

```text
backend/tests/fixtures/BatFIN_Portfolio_Summary_July26_Final.csv
SHA-256: 32367d39574bbaf7f554cbdfc2bd9fce56bb31fac39faee6d7ae53117291fa7e
```

Observed source structure:

```text
Header row: 4
Source data rows: 665 (664 fact rows + 1 detected TOTAL row)
Normalized fact rows: 664
Columns: 20
```

The persisted regression dashboard has validated `deployment_state`, `dealer`, `dealer_home_state`, `case_status`, `bucket`, `disburse_date`, INR measures, delinquency/NPA rates, filters, table data, and exports.

Import idempotently:

```bash
cd backend
npm run analytics:fixture
```

Force a governed replacement during local QA:

```bash
ANALYTICS_FIXTURE_FORCE=true npm run analytics:fixture
```

## Verification

```bash
cd backend
npm run typecheck
npm run build
npm run test:analytics
npm run analytics:benchmark
npm audit --audit-level=low

cd ../admin-frontend
npm run check
npm audit --audit-level=low

cd ../frontend
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=low
```

The local synthetic benchmark currently exercises 1K, 10K, and 100K grouped queries plus a 100K monthly time series, then removes the temporary fixture.

## Development URLs

```text
Customer frontend: http://localhost:5173
Admin frontend:    http://localhost:5174
Express API:       http://localhost:3000
PostgreSQL:        127.0.0.1:5432
```

Admin first-login test account:

```text
Email: superadmin@batfin.local
Temporary password: BatFIN-Admin-Temp!2026
```

The account is reset after QA to `invited`, `mustChangePassword=true`, with zero active sessions. The portal presents the one-time MFA enrollment flow after the correct password is entered.
