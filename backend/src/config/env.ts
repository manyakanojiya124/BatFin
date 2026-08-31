import "dotenv/config";
import path from "node:path";

const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET ?? "batfin-local-development-secret";
const adminEncryptionKey =
  process.env.ADMIN_ENCRYPTION_KEY ??
  "YmF0ZmluLWFkbWluLWxvY2FsLWRldi1rZXktMzJieSE=";
const adminQrSigningKey =
  process.env.ADMIN_QR_SIGNING_KEY ??
  "YmF0ZmluLWFkbWluLXFyLXNpZ25pbmcta2V5LTMyaCE=";

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

if (isProduction && !process.env.ADMIN_ENCRYPTION_KEY) {
  throw new Error("ADMIN_ENCRYPTION_KEY must be set in production");
}

if (isProduction && !process.env.ADMIN_QR_SIGNING_KEY) {
  throw new Error("ADMIN_QR_SIGNING_KEY must be set in production");
}

const corsOrigins = (
  process.env.CORS_ORIGIN ??
  "http://localhost:5173,http://localhost:5174,https://localhost,capacitor://localhost"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const adminSessionHours = Number(process.env.ADMIN_SESSION_HOURS ?? 8);
if (!Number.isFinite(adminSessionHours) || adminSessionHours < 1) {
  throw new Error("ADMIN_SESSION_HOURS must be a positive number");
}

function hostname(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
    throw new Error("Configured hostnames must be valid DNS hostnames without a scheme or path");
  }
  return normalized;
}

const customerHostname = hostname(process.env.CUSTOMER_HOSTNAME);
const adminHostname = hostname(process.env.ADMIN_HOSTNAME);
if (customerHostname && adminHostname && customerHostname === adminHostname) {
  throw new Error("CUSTOMER_HOSTNAME and ADMIN_HOSTNAME must be different");
}

function integerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

const analyticsStorageProvider = (
  process.env.ANALYTICS_STORAGE_PROVIDER ?? "LOCAL"
).trim().toUpperCase();
if (analyticsStorageProvider !== "LOCAL") {
  throw new Error(
    "ANALYTICS_STORAGE_PROVIDER is not implemented. Use LOCAL until another AnalyticsFileStorage adapter is configured.",
  );
}
const analyticsStorageDirectory = path.resolve(
  process.env.ANALYTICS_STORAGE_DIR ?? path.join(process.cwd(), "storage", "analytics"),
);
const analyticsMaxFileBytes = integerEnvironment(
  "ANALYTICS_MAX_FILE_BYTES",
  25 * 1024 * 1024,
  1024,
  200 * 1024 * 1024,
);
const analyticsMaxRows = integerEnvironment(
  "ANALYTICS_MAX_ROWS",
  50_000,
  1,
  1_000_000,
);
const analyticsMaxColumns = integerEnvironment(
  "ANALYTICS_MAX_COLUMNS",
  500,
  1,
  2_000,
);
const analyticsMaxSheets = integerEnvironment(
  "ANALYTICS_MAX_SHEETS",
  50,
  1,
  500,
);
const analyticsHeaderScanRows = integerEnvironment(
  "ANALYTICS_HEADER_SCAN_ROWS",
  50,
  5,
  500,
);
const analyticsAnalysisTimeoutMs = integerEnvironment(
  "ANALYTICS_ANALYSIS_TIMEOUT_MS",
  5 * 60 * 1000,
  10_000,
  60 * 60 * 1000,
);
const analyticsStaleUploadMinutes = integerEnvironment(
  "ANALYTICS_STALE_UPLOAD_MINUTES",
  10,
  1,
  1440,
);

function optionalEnvironment(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

const openRouterApiKey = optionalEnvironment("OPENROUTER_API_KEY");
const openRouterModel = optionalEnvironment("OPENROUTER_MODEL");
if (openRouterApiKey && !openRouterModel) {
  throw new Error("OPENROUTER_MODEL is required when OPENROUTER_API_KEY is set");
}
const openRouterBaseUrl =
  optionalEnvironment("OPENROUTER_BASE_URL") ??
  "https://openrouter.ai/api/v1";
let parsedOpenRouterUrl: URL;
try {
  parsedOpenRouterUrl = new URL(openRouterBaseUrl);
} catch {
  throw new Error("OPENROUTER_BASE_URL must be a valid URL");
}
if (
  parsedOpenRouterUrl.protocol !== "https:" &&
  !(parsedOpenRouterUrl.hostname === "localhost" && parsedOpenRouterUrl.protocol === "http:")
) {
  throw new Error("OPENROUTER_BASE_URL must use HTTPS outside localhost");
}
const openRouterSiteUrl = optionalEnvironment("OPENROUTER_SITE_URL");
if (openRouterSiteUrl) {
  try {
    new URL(openRouterSiteUrl);
  } catch {
    throw new Error("OPENROUTER_SITE_URL must be a valid URL");
  }
}
const openRouterTimeoutMs = integerEnvironment(
  "OPENROUTER_TIMEOUT_MS",
  45_000,
  1_000,
  5 * 60 * 1000,
);
const openRouterMaxRetries = integerEnvironment(
  "OPENROUTER_MAX_RETRIES",
  1,
  0,
  3,
);
const openRouterMaxOutputTokens = integerEnvironment(
  "OPENROUTER_MAX_OUTPUT_TOKENS",
  4096,
  256,
  32_768,
);
const openRouterAppName =
  optionalEnvironment("OPENROUTER_APP_NAME") ?? "BatFIN Analytics";

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  corsOrigins,
  jwtSecret,
  jwtExpiresInSeconds: 60 * 60 * 24 * 7,
  mockOtp: process.env.MOCK_OTP ?? "123456",
  adminEncryptionKey,
  adminQrSigningKey,
  adminSessionHours,
  customerHostname,
  adminHostname,
  analyticsStorageProvider,
  analyticsStorageDirectory,
  analyticsMaxFileBytes,
  analyticsMaxRows,
  analyticsMaxColumns,
  analyticsMaxSheets,
  analyticsHeaderScanRows,
  analyticsAnalysisTimeoutMs,
  analyticsStaleUploadMinutes,
  openRouterApiKey,
  openRouterModel,
  openRouterBaseUrl: parsedOpenRouterUrl.toString().replace(/\/$/, ""),
  openRouterTimeoutMs,
  openRouterMaxRetries,
  openRouterMaxOutputTokens,
  openRouterAppName,
  openRouterSiteUrl,
  adminTotpIssuer: process.env.ADMIN_TOTP_ISSUER ?? "BatFIN Admin",
  adminCookieName:
    process.env.ADMIN_SESSION_COOKIE_NAME ?? "batfin_admin_session",
};
