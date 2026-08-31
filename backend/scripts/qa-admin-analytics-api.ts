import { generateTotpCode } from "../src/config/admin-security.js";

const baseUrl = process.env.QA_ADMIN_API_URL ?? "http://127.0.0.1:3000/api/v1/admin";
const email = process.env.QA_ADMIN_EMAIL;
const password = process.env.QA_ADMIN_PASSWORD;
const newPassword = process.env.QA_ADMIN_NEW_PASSWORD;
if (!email || !password || !newPassword) throw new Error("Set QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD, and QA_ADMIN_NEW_PASSWORD");

async function json(response: Response) {
  const payload = await response.json() as { data?: Record<string, unknown>; error?: { message?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? `API request failed with ${response.status}`);
  return payload.data;
}
const login = await json(await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }));
const setup = login.totpSetup as { secret?: string } | undefined;
if (!setup?.secret || typeof login.challengeToken !== "string") throw new Error("Expected first-login MFA enrollment challenge");
const verifiedResponse = await fetch(`${baseUrl}/auth/verify-mfa`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeToken: login.challengeToken, code: generateTotpCode(setup.secret) }) });
const cookie = verifiedResponse.headers.get("set-cookie")?.split(";", 1)[0];
const verified = await json(verifiedResponse);
if (!cookie || typeof verified.csrfToken !== "string") throw new Error("MFA verification did not create an authenticated session");
const csrf = verified.csrfToken;
const authHeaders = { cookie, "x-csrf-token": csrf, "content-type": "application/json" };
await json(await fetch(`${baseUrl}/auth/change-password`, { method: "POST", headers: authHeaders, body: JSON.stringify({ currentPassword: password, newPassword }) }));
const dashboards = await json(await fetch(`${baseUrl}/analytics/dashboards?page=1&pageSize=100`, { headers: { cookie } }));
const items = dashboards.dashboards as Array<{ id:string; dataset?:{name?:string} }>;
const dashboard = items.find((item) => item.dataset?.name === "BatFIN Portfolio Summary July 2026") ?? items[0];
if (!dashboard) throw new Error("No analytics dashboard was available for API QA");
const detail = await json(await fetch(`${baseUrl}/analytics/dashboards/${dashboard.id}`, { headers: { cookie } }));
if (!detail.dashboard) throw new Error("Dashboard detail response was incomplete");
const batch = await json(await fetch(`${baseUrl}/analytics/dashboards/${dashboard.id}/query-batch`, { method: "POST", headers: authHeaders, body: JSON.stringify({ filters: [] }) }));
if (!batch.widgets || Object.values(batch.widgets as Record<string, {error?:string}>).some((entry) => entry.error)) throw new Error("Batch widget query returned an error");
const options = await json(await fetch(`${baseUrl}/analytics/dashboards/${dashboard.id}/filter-options`, { method: "POST", headers: authHeaders, body: JSON.stringify({ field: "dealer", search: "auto", limit: 10, filters: [] }) }));
if (!Array.isArray(options.options)) throw new Error("Filter option search response was incomplete");
const answer = await json(await fetch(`${baseUrl}/analytics/dashboards/${dashboard.id}/ask`, { method: "POST", headers: authHeaders, body: JSON.stringify({ question: "Which dealers have the highest risk?", filters: [] }) }));
if (!answer.answer || !Array.isArray(answer.evidence)) throw new Error("Ask Data response lacked validated evidence");
const exported = await fetch(`${baseUrl}/analytics/dashboards/${dashboard.id}/export`, { method: "POST", headers: authHeaders, body: JSON.stringify({ fields: ["dealer", "deployment_state", "contracted_demand_rs"], filters: [], limit: 50 }) });
if (!exported.ok || !(exported.headers.get("content-type") ?? "").includes("text/csv")) throw new Error("CSV export failed");
await fetch(`${baseUrl}/auth/logout`, { method: "POST", headers: authHeaders });
console.log(`Admin analytics API QA passed: ${Object.keys(batch.widgets as object).length} widgets, ${(options.options as unknown[]).length} searched options, ${(answer.evidence as unknown[]).length} evidence rows, ${exported.headers.get("x-exported-row-count") ?? "0"} exported rows.`);
