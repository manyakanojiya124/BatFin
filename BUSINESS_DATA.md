# BatFIN Governed Business Data

The Super Admin **Business Data** area imports operational CSVs through validated, permission-checked REST endpoints. It is not a raw database console and does not execute arbitrary SQL.

## Current imported datasets

| Section | Source template | Current records | Business key |
|---|---|---:|---|
| Staff Directory | `users.csv` | 118 | Employee code |
| Collection MIS | `lms068_collection_mis_18082026162029.csv` | 614 | Loan account number |
| Insurance Rate Master | `rate-master-configuration-2026-08-19.csv` | 450 | Type + provider + age/all + tenure + rate |
| Charge Master | `charge-master.csv` | 65 | Charge code |
| LMS Deliverables | `lms-deliverable-2026-08-19.csv` | 19 | Source ID |
| Field Visit Workflows | `export (2).csv` | 15 | Visit code + workflow status |
| Deliverable Settings | `deliverable-setting-2026-08-19.csv` | 13 | Deliverable type + product |
| Repayment Start-Date Rules | `repayment-start-date-configuration.csv` | 11 | Scheme code |
| Insurance Types | `export (1).csv` | 6 | Insurance code |
| Insurance Providers | `export.csv` | 4 | Provider code |
| Lead Channels | `lead-channel-module-2026-08-19.csv` | 4 | Channel code |
| Sanction Conditions | `sanction-master-2026-08-19.csv` | 2 | Condition code + type + subtype |
| Branch–Scheme Mapping | `branch-scheme-mapping-2026-08-19.csv` | 0 | Branch code + scheme code |
| Quick Links | `quick-link-master-2026-08-19.csv` | 0 | Name + URL |
| Scheme Charge Knockoff Policies | `scheme-charge-knockoff-policy-mapping.csv` | 0 | Scheme code + policy |
| State Property Titles | `state-wise-property-title-2026-08-19.csv` | 0 | State code + property title |

The four zero-record files are valid header-only templates. Their sections and successful import jobs exist, but BatFIN does not invent placeholder records.

## Import behavior

1. Super Admin chooses the correct section and uploads a CSV of at most 5 MB, 10,000 rows, and 300 columns.
2. **Preview and validate** checks the template, required headers, field types, booleans, business keys, duplicate keys, row size, and privacy exclusions.
3. The preview returns the source SHA-256, row counts, ignored columns, validation issues, and up to three normalized samples.
4. Commit requires the admin session, CSRF, `master_data.import`, recent TOTP step-up, and a 10–500 character reason.
5. One serializable PostgreSQL transaction creates an import job and all changed record versions.
6. New business keys create version 1. Changed keys retire the previous current version and create the next version. Semantically identical records are counted as unchanged.
7. Missing keys in a later file are not deleted or deactivated. A later file updates only keys it contains.
8. The exact same completed source hash cannot be imported twice into the same section.
9. Source CSV bytes are never stored. BatFIN stores the sanitized file name, SHA-256, validated headers, counts, normalized records, actor, timestamps, and reason.
10. Every preview, accepted/rejected import, export, and step-up event is audited.

## Privacy decisions

### Staff directory

`users.csv` creates staff-directory records only. It does **not** create `AdminUser` rows, passwords, sessions, or permissions. Admin access continues to require an explicit Super Admin invitation and one of BatFIN’s five roles.

The normalized staff directory omits residential address, alternate mobile, source creator/deactivator/modifier names, and empty legacy category fields. Work identity, work email/mobile when present, reporting structure, department, designation, branch, active state, and legacy role history are retained.

### Collection MIS

The Collection MIS section keeps approved loan/asset/repayment/collection/delinquency fields and customer reference IDs. It discards source values for:

- Customer and family names
- PAN and Aadhaar
- Voter ID and driving licence
- Mobile and alternate phone
- Date of birth, gender, caste, marital status, and education
- Permanent/current addresses, districts, cities, states, and pincodes
- Personal occupation and deceased status
- Sourcing-RM and receipt-maker personal names

The current import discarded 32 source columns and wrote zero forbidden identity keys to Collection MIS payloads.

## Insurance rate source limitation

The rate file contains three distinct rate rows for some provider/tenure combinations where `Age` is blank, but it provides no schedule/category discriminator. BatFIN preserves every supplied row by including the rate itself in that dataset’s business key. If a later source adds a schedule code, the registry should be extended to use that code before importing the new template.

## Permissions

```text
master_data.read
master_data.import
master_data.export
```

These permissions currently belong only to `SUPER_ADMIN`. Auditor, Finance Manager, Operations Manager, and Support Agent receive no Business Data access.

## API

```text
GET  /api/v1/admin/data/catalog
GET  /api/v1/admin/data/summary
GET  /api/v1/admin/data/imports
GET  /api/v1/admin/data/:datasetType/records
GET  /api/v1/admin/data/:datasetType/records/:businessKey/history
GET  /api/v1/admin/data/:datasetType/export
POST /api/v1/admin/data/:datasetType/validate
POST /api/v1/admin/data/:datasetType/import
```

## Reproducing the supplied seed

After migrations and Super Admin bootstrap, a trusted one-time CLI can replay this exact attached bundle through the same registry, validation, normalization, versioning, and audit service:

```bash
cd backend
MASTER_DATA_SEED_DIRECTORY='/absolute/path/to/supplied-csv-directory' \
MASTER_DATA_SEED_ADMIN_EMAIL='superadmin@example.com' \
npm run data:seed
```

The actor must already be an active or invited Super Admin. The command never accepts a password, token, TOTP secret, or raw SQL. Exact completed source hashes are skipped, so rerunning the command is idempotent. Normal Super Admin operations should use the `/data` web interface.

## Adding future files

Do not upload a new file into the nearest-looking existing section. Add a registry definition in:

```text
backend/src/modules/admin-master-data/master-data.registry.ts
```

Each definition must declare:

- Stable dataset type and display name
- Expected/required headers
- Explicit allowed and ignored fields
- Type/boolean/number validation
- Stable business key
- Normalized label and active state
- Super Admin display columns
- Privacy classification

Then add automated validation/import tests before applying the file. New domain behavior that must participate in customer or finance calculations should receive a dedicated typed model/service rather than being read as arbitrary JSON.
