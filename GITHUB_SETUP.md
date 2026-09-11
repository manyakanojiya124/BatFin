# Upload BatFIN to GitHub

BatFIN is one monorepo. Keep `frontend/`, `backend/`, and `admin-frontend/` in the same GitHub repository.

## 1. Create the empty GitHub repository

Create a private repository on GitHub, for example `batfin-platform`. Do not initialize it with a README because this project already contains one.

## 2. Initialize and push

```bash
cd /home/user/batfin
git init
git branch -M main
git config user.name "YOUR NAME"
git config user.email "YOUR_GITHUB_EMAIL"
git add .
git status
git commit -m "Build BatFIN customer, portfolio and AI analytics platform"
git remote add origin https://github.com/YOUR_USERNAME/batfin-platform.git
git push -u origin main
```

GitHub HTTPS uses a Personal Access Token rather than the account password. Alternatively use SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/batfin-platform.git
git push -u origin main
```

If `origin` already exists:

```bash
git remote set-url origin https://github.com/YOUR_USERNAME/batfin-platform.git
```

## 3. Never commit secrets or customer source files

The root `.gitignore` excludes:

- all `.env` files except safe `.env.example` templates
- `node_modules`
- build output
- backend runtime storage
- Collection MIS exports
- final portfolio CSV exports

Repository tests use synthetic fixtures. Keep real customer CSV/XLS/XLSX files outside Git.

Before every push:

```bash
git status
git diff --cached
git ls-files | grep -E '(^|/)\.env$|collection_mis|Portfolio_Summary.*Final' && echo "STOP: private file staged" || true
```

## 4. Configure deployment secrets

Set these in the deployment platform or GitHub Actions repository secrets, never in source control:

```text
DATABASE_URL
JWT_SECRET
ADMIN_ENCRYPTION_KEY
ADMIN_QR_SIGNING_KEY
OPENROUTER_API_KEY
OPENROUTER_MODEL
```

AI Analytics now defaults to:

```text
ANALYTICS_AI_MODE=OPTIONAL
```

Both `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` must be configured on the backend runtime.

## 5. Verify before pushing

```bash
cd backend && npm ci && npm run typecheck && npm run build && npm run test:analytics
cd ../admin-frontend && npm ci && npm run check
cd ../frontend && npm ci && npm run lint && npm run typecheck && npm run build
```
