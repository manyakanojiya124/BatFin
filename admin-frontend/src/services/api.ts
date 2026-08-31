import { useAdminStore } from "../store/admin.store";
import type {
  AdminAccessSummary,
  AdminLoginChallenge,
  AdminRole,
  AdminSessionResult,
  AdminUser,
} from "../types/admin";
import type {
  AdminDashboardMetrics,
  CustomerDetail,
  CustomerListItem,
  CustomerPagination,
  CustomerStatus,
} from "../types/customer";
import type {
  AssetBatch,
  BatchIssueResult,
  InventoryAsset,
  InventoryStatus,
  InventorySummary,
} from "../types/inventory";
import type {
  AdminTicket,
  AdminTicketDetail,
  TicketAssignee,
  TicketNote,
  TicketPriority,
  TicketStatus,
  TicketSummary,
} from "../types/ticket";
import type {
  AnalyticsColumn,
  AnalyticsDashboardDetail,
  AnalyticsDashboardSummary,
  AnalyticsDataset,
  AnalyticsSheet,
  AnalyticsStatus,
  AnalyticsAskResult,
  AnalyticsBatchQueryResult,
  AnalyticsFilterOptions,
  DashboardQueryFilter,
  DashboardQueryResult,
  DashboardSpecification,
} from "../types/analytics";
import type { PortfolioAccountDetail, PortfolioListResponse, PortfolioSummary } from "../types/portfolio";
import type {
  MasterDataImportJob,
  MasterDataRecordList,
  MasterDatasetCatalogItem,
  MasterDataSummary,
  MasterDataValidation,
  MasterDataVersion,
} from "../types/master-data";
import type {
  AdjustmentResult,
  FinanceDirection,
  FinanceFilters,
  FinanceSummary,
  FinanceTransaction,
  RefundResult,
} from "../types/payment";
import type {
  AdminAccountStatus,
  AdminAuditEntry,
  AdminAuditFacets,
  AdminAuditFilters,
  AdminAuditSummary,
  AdminManagedSession,
  AdminSessionState,
  AdminSessionSummary,
  AdminSummary,
  ManagedAdmin,
  PlatformSetting,
  SecurityBaseline,
} from "../types/governance";

export const ADMIN_API_BASE_URL =
  import.meta.env.VITE_ADMIN_API_BASE_URL ?? "/api/v1/admin";

interface DataResponse<T> {
  data: T;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

let csrfRenewal: Promise<string> | null = null;
async function renewAdminCsrf() {
  if (csrfRenewal) return csrfRenewal;
  csrfRenewal = (async () => {
    const response = await fetch(`${ADMIN_API_BASE_URL}/auth/csrf`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const payload = (await response.json().catch(() => null)) as DataResponse<{ csrfToken: string }> | ErrorResponse | null;
    if (!response.ok || !payload || !("data" in payload) || !payload.data.csrfToken) {
      const error = payload as ErrorResponse | null;
      throw new AdminApiError(response.status, error?.error.code ?? "ADMIN_CSRF_REFRESH_FAILED", error?.error.message ?? "Unable to refresh the secure request token");
    }
    useAdminStore.getState().setCsrfToken(payload.data.csrfToken);
    return payload.data.csrfToken;
  })().finally(() => { csrfRenewal = null; });
  return csrfRenewal;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  csrfToken?: string | null,
  allowCsrfRetry = true,
) {
  const effectiveCsrf = csrfToken ? useAdminStore.getState().csrfToken ?? csrfToken : null;
  const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      ...(effectiveCsrf ? { "x-csrf-token": effectiveCsrf } : {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | DataResponse<T>
    | ErrorResponse
    | null;
  if (!response.ok && allowCsrfRetry && csrfToken && (payload as ErrorResponse | null)?.error?.code === "ADMIN_CSRF_REJECTED" && !options.signal?.aborted) {
    const renewed = await renewAdminCsrf();
    return request<T>(path, options, renewed, false);
  }
  if (!response.ok) {
    const error = payload as ErrorResponse | null;
    throw new AdminApiError(
      response.status,
      error?.error.code ?? "ADMIN_REQUEST_FAILED",
      error?.error.message ?? "Unable to complete the admin request",
    );
  }
  if (!payload || !("data" in payload)) {
    throw new AdminApiError(
      response.status,
      "INVALID_ADMIN_RESPONSE",
      "The admin API returned an invalid response",
    );
  }
  return payload.data;
}

export function beginAdminLogin(email: string, password: string) {
  return request<AdminLoginChallenge>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function verifyAdminMfa(
  challengeToken: string,
  code: string,
) {
  return request<AdminSessionResult>("/auth/verify-mfa", {
    method: "POST",
    body: JSON.stringify({ challengeToken, code }),
  });
}

export function getAdminMe() {
  return request<{ admin: AdminUser; stepUpVerifiedAt: string | null }>(
    "/auth/me",
    { method: "GET" },
  );
}

export function getAdminCsrf() {
  return request<{ csrfToken: string }>("/auth/csrf", { method: "GET" });
}

export function changeAdminPassword(
  csrfToken: string,
  currentPassword: string,
  newPassword: string,
) {
  return request<{ admin: AdminUser }>(
    "/auth/change-password",
    {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    },
    csrfToken,
  );
}

export function verifyAdminStepUp(csrfToken: string, code: string) {
  return request<{ verifiedAt: string; validForSeconds: number }>(
    "/auth/step-up",
    {
      method: "POST",
      body: JSON.stringify({ code }),
    },
    csrfToken,
  );
}

export function logoutAdmin(csrfToken: string) {
  return request<{ loggedOut: boolean }>(
    "/auth/logout",
    { method: "POST" },
    csrfToken,
  );
}

export function revokeAdminSessions(csrfToken: string) {
  return request<{ revokedCount: number }>(
    "/auth/revoke-all-sessions",
    { method: "POST" },
    csrfToken,
  );
}

export function getAdminAccessSummary() {
  return request<AdminAccessSummary>("/dashboard/access", { method: "GET" });
}

export function getAdminStepUpAccess() {
  return request<{ stepUpAuthorized: boolean; verifiedAt: string }>(
    "/dashboard/step-up-access",
    { method: "GET" },
  );
}

export function getAdminDashboardMetrics() {
  return request<{ metrics: AdminDashboardMetrics }>(
    "/dashboard/metrics",
    { method: "GET" },
  );
}

export function listAdminCustomers(input: {
  q?: string;
  status?: CustomerStatus | "";
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  if (input.q) query.set("q", input.q);
  if (input.status) query.set("status", input.status);
  if (input.page) query.set("page", String(input.page));
  if (input.pageSize) query.set("pageSize", String(input.pageSize));
  return request<{
    customers: CustomerListItem[];
    pagination: CustomerPagination;
  }>(`/users?${query.toString()}`, { method: "GET" });
}

export function getAdminCustomer(customerId: string) {
  return request<{ customer: CustomerDetail }>(
    `/users/${encodeURIComponent(customerId)}`,
    { method: "GET" },
  );
}

export function updateAdminCustomerProfile(
  csrfToken: string,
  customerId: string,
  input: {
    name: string;
    email: string | null;
    address: string | null;
    reason: string;
  },
) {
  return request<{ customer: CustomerListItem }>(
    `/users/${encodeURIComponent(customerId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    csrfToken,
  );
}

export function updateAdminCustomerStatus(
  csrfToken: string,
  customerId: string,
  status: CustomerStatus,
  reason: string,
) {
  return request<{ customer: CustomerListItem }>(
    `/users/${encodeURIComponent(customerId)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, reason }),
    },
    csrfToken,
  );
}

export function listAdminInventory(input: {
  q?: string;
  assetType?: string;
  inventoryStatus?: string;
  assignment?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return request<{
    assets: InventoryAsset[];
    pagination: CustomerPagination;
  }>(`/assets?${query.toString()}`, { method: "GET" });
}

export function getAdminInventorySummary() {
  return request<{ summary: InventorySummary }>(
    "/assets/summary",
    { method: "GET" },
  );
}

export function getAdminInventoryAsset(assetId: string) {
  return request<{ asset: InventoryAsset }>(
    `/assets/${encodeURIComponent(assetId)}`,
    { method: "GET" },
  );
}

export function createAdminInventoryAsset(
  csrfToken: string,
  input: {
    assetType: "battery" | "vehicle";
    productType: string;
    serialNumber?: string;
    vehicleNumber?: string;
    reason: string;
  },
) {
  return request<{ asset: InventoryAsset; qrData: string }>(
    "/assets",
    { method: "POST", body: JSON.stringify(input) },
    csrfToken,
  );
}

export function createAdminAssetBatch(
  csrfToken: string,
  input: {
    name: string;
    assetType: "battery" | "vehicle";
    productType: string;
    quantity?: number;
    serialNumbers?: string[];
    reason: string;
  },
) {
  return request<BatchIssueResult>(
    "/assets/batches",
    { method: "POST", body: JSON.stringify(input) },
    csrfToken,
  );
}

export function listAdminAssetBatches(page = 1, pageSize = 20) {
  return request<{
    batches: AssetBatch[];
    pagination: CustomerPagination;
  }>(`/assets/batches?page=${page}&pageSize=${pageSize}`, { method: "GET" });
}

export function getAdminAssetBatch(batchId: string) {
  return request<{ batch: AssetBatch }>(
    `/assets/batches/${encodeURIComponent(batchId)}`,
    { method: "GET" },
  );
}

export function rotateAdminAssetQr(
  csrfToken: string,
  assetId: string,
  reason: string,
) {
  return request<{ asset: InventoryAsset; qrData: string }>(
    `/assets/${encodeURIComponent(assetId)}/qr`,
    { method: "POST", body: JSON.stringify({ reason }) },
    csrfToken,
  );
}

export function verifyAdminAssetQr(csrfToken: string, qrData: string) {
  return request<{
    verified: boolean;
    asset: InventoryAsset;
    verifiedAt: string;
  }>(
    "/assets/verify-qr",
    { method: "POST", body: JSON.stringify({ qrData }) },
    csrfToken,
  );
}

export function assignAdminAsset(
  csrfToken: string,
  assetId: string,
  userId: string,
  reason: string,
) {
  return request<{ asset: InventoryAsset }>(
    `/assets/${encodeURIComponent(assetId)}/assign`,
    { method: "POST", body: JSON.stringify({ userId, reason }) },
    csrfToken,
  );
}

export function unassignAdminAsset(
  csrfToken: string,
  assetId: string,
  reason: string,
) {
  return request<{ asset: InventoryAsset }>(
    `/assets/${encodeURIComponent(assetId)}/unassign`,
    { method: "POST", body: JSON.stringify({ reason }) },
    csrfToken,
  );
}

export function updateAdminAssetLifecycle(
  csrfToken: string,
  assetId: string,
  inventoryStatus: Exclude<InventoryStatus, "assigned">,
  reason: string,
) {
  return request<{ asset: InventoryAsset }>(
    `/assets/${encodeURIComponent(assetId)}/lifecycle`,
    {
      method: "PATCH",
      body: JSON.stringify({ inventoryStatus, reason }),
    },
    csrfToken,
  );
}

export function listAdminTickets(input: {
  q?: string;
  status?: string;
  priority?: string;
  type?: string;
  assignment?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return request<{
    tickets: AdminTicket[];
    pagination: CustomerPagination;
  }>(`/tickets?${query.toString()}`, { method: "GET" });
}

export function getAdminTicketSummary() {
  return request<{ summary: TicketSummary }>(
    "/tickets/summary",
    { method: "GET" },
  );
}

export function getAdminTicketAssignees() {
  return request<{ assignees: TicketAssignee[] }>(
    "/tickets/assignees",
    { method: "GET" },
  );
}

export function getAdminTicket(ticketId: string) {
  return request<{ ticket: AdminTicketDetail }>(
    `/tickets/${encodeURIComponent(ticketId)}`,
    { method: "GET" },
  );
}

export function assignAdminTicket(
  csrfToken: string,
  ticketId: string,
  adminUserId: string | null,
  reason: string,
) {
  return request<{ ticket: AdminTicket }>(
    `/tickets/${encodeURIComponent(ticketId)}/assign`,
    {
      method: "PATCH",
      body: JSON.stringify({ adminUserId, reason }),
    },
    csrfToken,
  );
}

export function updateAdminTicketPriority(
  csrfToken: string,
  ticketId: string,
  priority: TicketPriority,
  reason: string,
) {
  return request<{ ticket: AdminTicket }>(
    `/tickets/${encodeURIComponent(ticketId)}/priority`,
    {
      method: "PATCH",
      body: JSON.stringify({ priority, reason }),
    },
    csrfToken,
  );
}

export function updateAdminTicketStatus(
  csrfToken: string,
  ticketId: string,
  status: TicketStatus,
  reason: string,
  resolutionMessage?: string,
) {
  return request<{ ticket: AdminTicket }>(
    `/tickets/${encodeURIComponent(ticketId)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, reason, resolutionMessage }),
    },
    csrfToken,
  );
}

export function addAdminTicketNote(
  csrfToken: string,
  ticketId: string,
  body: string,
) {
  return request<{ note: TicketNote }>(
    `/tickets/${encodeURIComponent(ticketId)}/notes`,
    { method: "POST", body: JSON.stringify({ body }) },
    csrfToken,
  );
}

function financeQuery(input: FinanceFilters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

export function listAdminPayments(input: FinanceFilters) {
  return request<{
    transactions: FinanceTransaction[];
    pagination: CustomerPagination;
  }>(`/payments?${financeQuery(input)}`, { method: "GET" });
}

export function getAdminPaymentSummary() {
  return request<{ summary: FinanceSummary }>(
    "/payments/summary",
    { method: "GET" },
  );
}

export function getAdminFinanceTransaction(transactionId: string) {
  return request<{ transaction: FinanceTransaction }>(
    `/payments/${encodeURIComponent(transactionId)}`,
    { method: "GET" },
  );
}

export function lookupAdminProviderReference(reference: string) {
  return request<{ transaction: FinanceTransaction }>(
    `/payments/provider-reference/${encodeURIComponent(reference.trim())}`,
    { method: "GET" },
  );
}

export async function downloadAdminFinanceExport(input: FinanceFilters) {
  const response = await fetch(
    `${ADMIN_API_BASE_URL}/payments/export?${financeQuery(input)}`,
    { method: "GET", credentials: "include" },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorResponse | null;
    throw new AdminApiError(
      response.status,
      payload?.error.code ?? "FINANCE_EXPORT_FAILED",
      payload?.error.message ?? "Unable to export finance transactions",
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileName =
    disposition.match(/filename="([^"]+)"/)?.[1] ?? "batfin-finance.csv";
  return { blob: await response.blob(), fileName };
}

export function createAdminAdjustment(
  csrfToken: string,
  input: {
    userId: string;
    direction: FinanceDirection;
    amount: number;
    reason: string;
    description?: string;
    idempotencyKey: string;
  },
) {
  return request<AdjustmentResult>(
    "/payments/adjustments",
    { method: "POST", body: JSON.stringify(input) },
    csrfToken,
  );
}

export function createAdminRefund(
  csrfToken: string,
  originalPaymentId: string,
  input: { amount: number; reason: string; idempotencyKey: string },
) {
  return request<RefundResult>(
    `/payments/${encodeURIComponent(originalPaymentId)}/refunds`,
    { method: "POST", body: JSON.stringify(input) },
    csrfToken,
  );
}

function auditQuery(input: AdminAuditFilters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

export function listAdminAudit(input: AdminAuditFilters) {
  return request<{
    entries: AdminAuditEntry[];
    pagination: CustomerPagination;
  }>(`/audit?${auditQuery(input)}`, { method: "GET" });
}

export function getAdminAuditSummary() {
  return request<{ summary: AdminAuditSummary }>(
    "/audit/summary",
    { method: "GET" },
  );
}

export function getAdminAuditFacets() {
  return request<AdminAuditFacets>("/audit/facets", { method: "GET" });
}

export async function downloadAdminAuditExport(input: AdminAuditFilters) {
  const response = await fetch(
    `${ADMIN_API_BASE_URL}/audit/export?${auditQuery(input)}`,
    { method: "GET", credentials: "include" },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorResponse | null;
    throw new AdminApiError(
      response.status,
      payload?.error.code ?? "AUDIT_EXPORT_FAILED",
      payload?.error.message ?? "Unable to export audit records",
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  return {
    blob: await response.blob(),
    fileName:
      disposition.match(/filename="([^"]+)"/)?.[1] ?? "batfin-admin-audit.csv",
  };
}

export function listManagedAdmins(input: {
  q?: string;
  role?: AdminRole | "";
  status?: AdminAccountStatus | "";
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return request<{
    admins: ManagedAdmin[];
    pagination: CustomerPagination;
  }>(`/admins?${query.toString()}`, { method: "GET" });
}

export function getManagedAdminSummary() {
  return request<{ summary: AdminSummary }>(
    "/admins/summary",
    { method: "GET" },
  );
}

export function getManagedAdmin(adminId: string) {
  return request<{ admin: ManagedAdmin }>(
    `/admins/${encodeURIComponent(adminId)}`,
    { method: "GET" },
  );
}

export function inviteManagedAdmin(
  csrfToken: string,
  input: { name: string; email: string; role: AdminRole; reason: string },
) {
  return request<{ admin: ManagedAdmin; temporaryPassword: string }>(
    "/admins/invite",
    { method: "POST", body: JSON.stringify(input) },
    csrfToken,
  );
}

export function updateManagedAdminRole(
  csrfToken: string,
  adminId: string,
  role: AdminRole,
  reason: string,
) {
  return request<{ admin: ManagedAdmin }>(
    `/admins/${encodeURIComponent(adminId)}/role`,
    { method: "PATCH", body: JSON.stringify({ role, reason }) },
    csrfToken,
  );
}

export function updateManagedAdminStatus(
  csrfToken: string,
  adminId: string,
  status: Exclude<AdminAccountStatus, "invited">,
  reason: string,
) {
  return request<{ admin: ManagedAdmin }>(
    `/admins/${encodeURIComponent(adminId)}/status`,
    { method: "PATCH", body: JSON.stringify({ status, reason }) },
    csrfToken,
  );
}

export function resetManagedAdminCredentials(
  csrfToken: string,
  adminId: string,
  reason: string,
) {
  return request<{ admin: ManagedAdmin; temporaryPassword: string }>(
    `/admins/${encodeURIComponent(adminId)}/reset-credentials`,
    { method: "POST", body: JSON.stringify({ reason }) },
    csrfToken,
  );
}

export function revokeManagedAdminSessions(
  csrfToken: string,
  adminId: string,
  reason: string,
) {
  return request<{
    admin: { id: string; name: string; email: string };
    revokedCount: number;
  }>(
    `/admins/${encodeURIComponent(adminId)}/revoke-sessions`,
    { method: "POST", body: JSON.stringify({ reason }) },
    csrfToken,
  );
}

export function listManagedAdminSessions(input: {
  q?: string;
  adminUserId?: string;
  status?: AdminSessionState | "";
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return request<{
    sessions: AdminManagedSession[];
    pagination: CustomerPagination;
  }>(`/admins/sessions?${query.toString()}`, { method: "GET" });
}

export function getManagedAdminSessionSummary() {
  return request<{ summary: AdminSessionSummary }>(
    "/admins/sessions/summary",
    { method: "GET" },
  );
}

export function revokeManagedAdminSession(
  csrfToken: string,
  sessionId: string,
  reason: string,
) {
  return request<{ session: AdminManagedSession }>(
    `/admins/sessions/${encodeURIComponent(sessionId)}/revoke`,
    { method: "POST", body: JSON.stringify({ reason }) },
    csrfToken,
  );
}

export function getAdminSystemSettings() {
  return request<{
    setting: PlatformSetting;
    securityBaseline: SecurityBaseline;
  }>("/settings", { method: "GET" });
}

export function updateAdminSystemSettings(
  csrfToken: string,
  input: Partial<
    Pick<
      PlatformSetting,
      | "supportEmail"
      | "maintenanceMode"
      | "customerRegistrationEnabled"
      | "customerOtpLoginEnabled"
      | "walletRechargeEnabled"
      | "maxRechargeAmount"
    >
  > & { reason: string },
) {
  return request<{ setting: PlatformSetting }>(
    "/settings",
    { method: "PATCH", body: JSON.stringify(input) },
    csrfToken,
  );
}

async function requestForm<T>(path:string,form:FormData,csrfToken:string,allowCsrfRetry=true){
  const effectiveCsrf=useAdminStore.getState().csrfToken??csrfToken;
  const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: { "x-csrf-token": effectiveCsrf },
  });
  const payload = (await response.json().catch(() => null)) as
    | DataResponse<T>
    | ErrorResponse
    | null;
  if(!response.ok&&allowCsrfRetry&&(payload as ErrorResponse|null)?.error?.code==="ADMIN_CSRF_REJECTED"){
    const renewed=await renewAdminCsrf();
    return requestForm<T>(path,form,renewed,false);
  }
  if (!response.ok) {
    const error = payload as ErrorResponse | null;
    throw new AdminApiError(
      response.status,
      error?.error.code ?? "MASTER_DATA_REQUEST_FAILED",
      error?.error.message ?? "Unable to process the CSV file",
    );
  }
  if (!payload || !("data" in payload)) {
    throw new AdminApiError(response.status, "INVALID_ADMIN_RESPONSE", "The admin API returned an invalid response");
  }
  return payload.data;
}

export function getMasterDataCatalog() {
  return request<{ datasets: MasterDatasetCatalogItem[] }>("/data/catalog", { method: "GET" });
}

export function getMasterDataSummary() {
  return request<{ summary: MasterDataSummary }>("/data/summary", { method: "GET" });
}

export function listMasterDataRecords(
  datasetType: string,
  input: { q?: string; active?: "true" | "false" | ""; page?: number; pageSize?: number },
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return request<MasterDataRecordList>(
    `/data/${encodeURIComponent(datasetType)}/records?${query.toString()}`,
    { method: "GET" },
  );
}

export function getMasterDataHistory(datasetType: string, businessKey: string) {
  return request<{
    dataset: { type: string; label: string };
    versions: MasterDataVersion[];
  }>(
    `/data/${encodeURIComponent(datasetType)}/records/${encodeURIComponent(businessKey)}/history`,
    { method: "GET" },
  );
}

export function listMasterDataImports(input: {
  datasetType?: string;
  status?: "completed" | "failed" | "";
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return request<{
    jobs: MasterDataImportJob[];
    pagination: CustomerPagination;
  }>(`/data/imports?${query.toString()}`, { method: "GET" });
}

export function validateMasterDataCsv(
  csrfToken: string,
  datasetType: string,
  file: File,
) {
  const form = new FormData();
  form.append("file", file);
  return requestForm<{ validation: MasterDataValidation }>(
    `/data/${encodeURIComponent(datasetType)}/validate`,
    form,
    csrfToken,
  );
}

export function importMasterDataCsv(
  csrfToken: string,
  datasetType: string,
  file: File,
  reason: string,
) {
  const form = new FormData();
  form.append("file", file);
  form.append("reason", reason);
  return requestForm<{ job: MasterDataImportJob }>(
    `/data/${encodeURIComponent(datasetType)}/import`,
    form,
    csrfToken,
  );
}

export async function downloadMasterDataExport(datasetType: string) {
  const response = await fetch(
    `${ADMIN_API_BASE_URL}/data/${encodeURIComponent(datasetType)}/export`,
    { method: "GET", credentials: "include" },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorResponse | null;
    throw new AdminApiError(
      response.status,
      payload?.error.code ?? "MASTER_DATA_EXPORT_FAILED",
      payload?.error.message ?? "Unable to export the dataset",
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  return {
    blob: await response.blob(),
    fileName: disposition.match(/filename="([^"]+)"/)?.[1] ?? `batfin-${datasetType}.csv`,
  };
}

export function getPortfolioSummary(){return request<{summary:PortfolioSummary}>("/portfolio/summary",{method:"GET"});}
export function listPortfolioAccounts(input:{q?:string;caseStatus?:string;bucket?:string;state?:string;dealerId?:string;linked?:"true"|"false"|"";page?:number;pageSize?:number}={}){const query=new URLSearchParams();Object.entries(input).forEach(([key,value])=>{if(value!==undefined&&value!=="")query.set(key,String(value))});return request<PortfolioListResponse>(`/portfolio/accounts?${query}`,{method:"GET"});}
export function getPortfolioAccount(id:string){return request<{account:PortfolioAccountDetail}>(`/portfolio/accounts/${encodeURIComponent(id)}`,{method:"GET"});}
export function listPortfolioImports(){return request<{imports:Array<Record<string,unknown>>}>("/portfolio/imports",{method:"GET"});}
export function importPortfolioWorkbook(csrfToken:string,file:File){const form=new FormData();form.append("file",file);return requestForm<Record<string,unknown>>("/portfolio/import",form,csrfToken);}
export function importCustomerIdentityCsv(csrfToken:string,file:File){const form=new FormData();form.append("file",file);return requestForm<Record<string,unknown>>("/portfolio/identity-import",form,csrfToken);}
export function updatePortfolioCaseStatus(csrfToken:string,id:string,input:{caseStatus:string;bucket:string;reason:string}){return request<{case:Record<string,unknown>}>(`/portfolio/cases/${encodeURIComponent(id)}/status`,{method:"PATCH",body:JSON.stringify(input)},csrfToken);}
export function linkPortfolioAccount(csrfToken:string,id:string,userId:string,reason:string){return request<{account:Record<string,unknown>}>(`/portfolio/accounts/${encodeURIComponent(id)}/link-user`,{method:"POST",body:JSON.stringify({userId,reason})},csrfToken);}

export function getAnalyticsAiStatus() { return request<{ai:{provider:string;configured:boolean;model:string|null;timeoutMs:number;maxRetries:number;fallbackAvailable:boolean}}>("/analytics/ai/status",{method:"GET"}); }
export function listAnalyticsDatasets(input:{q?:string;status?:string;page?:number;pageSize?:number}={}) { const q=new URLSearchParams(); Object.entries(input).forEach(([k,v])=>{if(v!==undefined&&v!=="")q.set(k,String(v));}); return request<{datasets:AnalyticsDataset[];pagination:CustomerPagination}>(`/analytics/datasets?${q}`,{method:"GET"}); }
export function uploadAnalyticsDataset(csrfToken:string,file:File,name:string,description?:string){const form=new FormData();form.append("file",file);form.append("name",name);if(description)form.append("description",description);return requestForm<{dataset:AnalyticsDataset}>("/analytics/datasets/upload",form,csrfToken);}
export function getAnalyticsDataset(id:string){return request<{dataset:AnalyticsDataset&{files:unknown[];activeSheet:AnalyticsSheet|null}}>(`/analytics/datasets/${encodeURIComponent(id)}`,{method:"GET"});}
export function getAnalyticsDatasetStatus(id:string){return request<AnalyticsStatus>(`/analytics/datasets/${encodeURIComponent(id)}/status`,{method:"GET"});}
export function getAnalyticsSheets(id:string){return request<{dataset:{id:string;name:string;status:string;stage:string;activeSheetId:string|null};sheets:AnalyticsSheet[]}>(`/analytics/datasets/${encodeURIComponent(id)}/sheets`,{method:"GET"});}
export function selectAnalyticsSheet(csrfToken:string,datasetId:string,sheetId:string){return request<{accepted:boolean}>(`/analytics/datasets/${encodeURIComponent(datasetId)}/sheets/${encodeURIComponent(sheetId)}/select`,{method:"POST"},csrfToken);}
export function getAnalyticsPreview(id:string,page=1,pageSize=25){return request<{dataset:{id:string;name:string;datasetVersion:number;rowCount:number;columnCount:number};columns:AnalyticsColumn[];rows:Array<{id:string;rowNumber:number;data:Record<string,unknown>}>;pagination:CustomerPagination}>(`/analytics/datasets/${encodeURIComponent(id)}/preview?page=${page}&pageSize=${pageSize}`,{method:"GET"});}
export function getAnalyticsProfile(id:string){return request<{dataset:{id:string;name:string;status:string;stage:string};profile:{rowCount:number;columnCount:number;duplicateRowCount:number;profile:Record<string,unknown>;dataQualityWarnings:unknown[];detectedDateRanges:Record<string,unknown>;createdAt:string}}>(`/analytics/datasets/${encodeURIComponent(id)}/profile`,{method:"GET"});}
export function analyzeAnalyticsDataset(csrfToken:string,id:string){return request<{accepted:boolean;datasetId:string}>(`/analytics/datasets/${encodeURIComponent(id)}/analyze`,{method:"POST"},csrfToken);}
export function retryAnalyticsParsing(csrfToken:string,id:string){return request<{accepted:boolean}>(`/analytics/datasets/${encodeURIComponent(id)}/retry-parsing`,{method:"POST"},csrfToken);}
export function updateAnalyticsDataset(csrfToken:string,id:string,input:{name?:string;description?:string|null}){return request<{dataset:AnalyticsDataset}>(`/analytics/datasets/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(input)},csrfToken);}
export function refreshAnalyticsDataset(csrfToken:string,id:string,file:File){const form=new FormData();form.append("file",file);return requestForm<{accepted:boolean;datasetVersion:number}>(`/analytics/datasets/${encodeURIComponent(id)}/refresh`,form,csrfToken);}
export function deleteAnalyticsDataset(csrfToken:string,id:string,reason:string){return request<{deleted:boolean}>(`/analytics/datasets/${encodeURIComponent(id)}`,{method:"DELETE",body:JSON.stringify({reason})},csrfToken);}
export function permanentlyDeleteAnalyticsDataset(csrfToken:string,id:string,reason:string){return request<{permanentlyDeleted:boolean;datasetId:string;auditTombstoneRetained:boolean}>(`/analytics/datasets/${encodeURIComponent(id)}/permanent`,{method:"DELETE",body:JSON.stringify({reason})},csrfToken);}
export function listAnalyticsDashboards(page=1,pageSize=20){return request<{dashboards:AnalyticsDashboardSummary[];pagination:CustomerPagination}>(`/analytics/dashboards?page=${page}&pageSize=${pageSize}`,{method:"GET"});}
export function getAnalyticsDashboard(id:string){return request<{dashboard:AnalyticsDashboardDetail}>(`/analytics/dashboards/${encodeURIComponent(id)}`,{method:"GET"});}
export function saveAnalyticsDashboard(csrfToken:string,id:string,baseVersion:number,specification:DashboardSpecification,filterState:DashboardQueryFilter[],changeSummary:string){return request<{dashboardId:string;version:number;specification:DashboardSpecification}>(`/analytics/dashboards/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({baseVersion,specification,filterState,changeSummary})},csrfToken);}
export function regenerateAnalyticsDashboard(csrfToken:string,id:string){return request<{accepted:boolean}>(`/analytics/dashboards/${encodeURIComponent(id)}/regenerate`,{method:"POST"},csrfToken);}
export function duplicateAnalyticsDashboard(csrfToken:string,id:string){return request<{dashboardId:string}>(`/analytics/dashboards/${encodeURIComponent(id)}/duplicate`,{method:"POST"},csrfToken);}
export function deleteAnalyticsDashboard(csrfToken:string,id:string,reason:string){return request<{deleted:boolean}>(`/analytics/dashboards/${encodeURIComponent(id)}`,{method:"DELETE",body:JSON.stringify({reason})},csrfToken);}
export function queryAnalyticsDashboard(csrfToken:string,id:string,input:Record<string,unknown>,signal?:AbortSignal){return request<DashboardQueryResult>(`/analytics/dashboards/${encodeURIComponent(id)}/query`,{method:"POST",body:JSON.stringify(input),signal},csrfToken);}
export function queryAnalyticsVisualization(csrfToken:string,id:string,widgetKey:string,input:{filters:DashboardQueryFilter[];page?:number;pageSize?:number;fields?:string[];topN?:number;timeGrain?:string;sort?:string;showOther?:boolean},signal?:AbortSignal){return request<DashboardQueryResult>(`/analytics/dashboards/${encodeURIComponent(id)}/visualizations/${encodeURIComponent(widgetKey)}/query`,{method:"POST",body:JSON.stringify(input),signal},csrfToken);}
export function queryAnalyticsVisualizationsBatch(csrfToken:string,id:string,filters:DashboardQueryFilter[],widgetKeys?:string[],signal?:AbortSignal){return request<AnalyticsBatchQueryResult>(`/analytics/dashboards/${encodeURIComponent(id)}/query-batch`,{method:"POST",body:JSON.stringify({filters,widgetKeys}),signal},csrfToken);}
export function getAnalyticsFilterOptions(csrfToken:string,id:string,input:{field:string;search?:string;limit?:number;filters?:DashboardQueryFilter[]},signal?:AbortSignal){return request<AnalyticsFilterOptions>(`/analytics/dashboards/${encodeURIComponent(id)}/filter-options`,{method:"POST",body:JSON.stringify(input),signal},csrfToken);}
export function askAnalyticsData(csrfToken:string,id:string,question:string,filters:DashboardQueryFilter[],signal?:AbortSignal){return request<AnalyticsAskResult>(`/analytics/dashboards/${encodeURIComponent(id)}/ask`,{method:"POST",body:JSON.stringify({question,filters}),signal},csrfToken);}
export function getAnalyticsEvidenceInsights(csrfToken:string,id:string,filters:DashboardQueryFilter[],signal?:AbortSignal){return request<{generatedAt:string;insights:Array<{id:string;title:string;content:string;confidence:number;evidence:unknown[]}>}>(`/analytics/dashboards/${encodeURIComponent(id)}/insights`,{method:"POST",body:JSON.stringify({filters}),signal},csrfToken);}
export async function downloadAnalyticsExport(csrfToken:string,id:string,input:{fields:string[];filters:DashboardQueryFilter[];limit?:number}){const response=await fetch(`${ADMIN_API_BASE_URL}/analytics/dashboards/${encodeURIComponent(id)}/export`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify(input)});if(!response.ok){const payload=(await response.json().catch(()=>null)) as ErrorResponse|null;throw new AdminApiError(response.status,payload?.error.code??"ANALYTICS_EXPORT_FAILED",payload?.error.message??"Unable to export analytics data");}const disposition=response.headers.get("content-disposition")??"";return{blob:await response.blob(),fileName:disposition.match(/filename="([^"]+)"/)?.[1]??"analytics-export.csv"};}
