# BatFIN OpenRouter configuration and Windows setup

## Root cause of the token error

The authenticated `POST /api/v1/admin/analytics/ai/test` request explicitly asked for `maxOutputTokens: 100`. The provider correctly enforces a minimum of 256, so it returned:

```text
AI max output tokens must be an integer from 256 to 4096
```

`OPENROUTER_MAX_OUTPUT_TOKENS=4096` was valid. The invalid value came from the connection-test call site, not from the environment parser. The call now uses the canonical minimum of 256.

The subsequent 502 was not a Vite proxy failure: the backend route was reached and OpenRouter returned upstream HTTP 404. The configured `:free` route was being sent native `response_format: json_schema`; free endpoints may not expose a compatible native structured-output route. BatFIN now omits native `response_format` for `:free` model slugs, keeps the JSON Schema in the guarded prompt, extracts JSON and validates it with Zod. Paid/native-capable routes retain `response_format`, with one compatibility retry without it when OpenRouter explicitly reports that no endpoint supports structured output.

Canonical limits:

```text
Minimum: 256
Default: 4,096
Maximum allowed configuration: 16,384
```

The configured value is sent to OpenRouter's OpenAI-compatible `/chat/completions` endpoint as the numeric `max_tokens` parameter.

## Secure backend environment

```dotenv
ANALYTICS_AI_MODE=OPTIONAL
OPENROUTER_API_KEY=REPLACE_WITH_A_NEW_PRIVATE_KEY
OPENROUTER_MODEL=qwen/qwen3-30b-a3b:free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_TIMEOUT_MS=45000
OPENROUTER_MAX_RETRIES=1
OPENROUTER_MAX_OUTPUT_TOKENS=4096
OPENROUTER_APP_NAME=BatFIN Analytics
OPENROUTER_SITE_URL=http://localhost:5174
```

Do not commit `backend/.env`. A key posted in chat, screenshots, logs or source control must be revoked and replaced.

## Windows initialization

From the downloaded `batfin` folder, enter `backend` only once:

```bat
cd C:\Users\manya\Downloads\workspace-01a00497-3f15-71a5-aea9-d0931b007600\batfin\backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run admin:bootstrap
```

`bootstrap-super-admin.ts` now loads `backend/.env`, so `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` and `ADMIN_BOOTSTRAP_NAME` are respected.

Then import an analytics file using its real Windows path:

```bat
npm run analytics:fixture -- "C:\Users\manya\Downloads\BatFIN_Portfolio_Summary_July26_Final.csv"
```

Alternatively set:

```dotenv
ANALYTICS_FIXTURE_SOURCE_PATH=C:\Users\manya\Downloads\BatFIN_Portfolio_Summary_July26_Final.csv
ANALYTICS_FIXTURE_ADMIN_EMAIL=admin@batfin.in
```

and run:

```bat
npm run analytics:fixture
```

If no admin exists, the fixture command now explicitly tells you to run `npm run admin:bootstrap`. If the requested fixture owner email differs but another Super Admin exists, it safely uses the existing Super Admin.

## Start services

Use three terminals:

```bat
cd batfin\backend
npm run dev
```

```bat
cd batfin\admin-frontend
npm run dev
```

```bat
cd batfin\frontend
npm run dev
```

Test the real provider from Windows:

```bat
cd batfin\backend
npm run ai:test
```

Then open Admin → AI Analytics, confirm the model and click **Test OpenRouter** before starting analysis.
