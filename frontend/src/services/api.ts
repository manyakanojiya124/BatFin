import type {
  ApiErrorPayload,
  Asset,
  AssetHealth,
  AssetLocation,
  AuthSession,
  CreateAssetInput,
  LedgerSummary,
  Payment,
  PaymentMethod,
  Plan,
  Subscription,
  SupportTicket,
  SupportTicketType,
  Transaction,
  TransactionType,
  UpdateProfileInput,
  User,
} from "../types/api";
import type { UserPortfolio } from "../types/portfolio";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const sandboxTrafficAccessToken = import.meta.env.VITE_API_ACCESS_TOKEN?.trim();

interface DataResponse<T> {
  data: T;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sandboxTrafficAccessToken
        ? { "e2b-traffic-access-token": sandboxTrafficAccessToken }
        : {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | DataResponse<T>
    | ApiErrorPayload
    | null;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    throw new ApiClientError(
      response.status,
      errorPayload?.error.code ?? "REQUEST_FAILED",
      errorPayload?.error.message ?? "Unable to complete the request",
    );
  }

  if (!payload || !("data" in payload)) {
    throw new ApiClientError(
      response.status,
      "INVALID_RESPONSE",
      "The server returned an invalid response",
    );
  }

  return payload.data;
}

export async function register(input: { name: string; phone: string; customerLoanId?: string; batteryNo?: string }) {
  return request<{ user: User }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function sendOtp(phone: string) {
  return request<{
    phone: string;
    expiresInSeconds: number;
    message: string;
  }>("/auth/send-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOtp(phone: string, otp: string) {
  return request<AuthSession>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, otp }),
  });
}

export async function getMe(token: string) {
  return request<{ user: User }>("/users/me", { method: "GET" }, token);
}

export async function updateMe(token: string, input: UpdateProfileInput) {
  return request<{ user: User }>(
    "/users/me",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token,
  );
}

export async function getMyPortfolio(token:string){return request<UserPortfolio>("/users/me/portfolio",{method:"GET"},token);}
export async function claimMyPortfolio(token:string,input:{customerLoanId:string;batteryNo:string}){return request<{account:{id:string;customerLoanId:string} }>("/users/me/portfolio/claim",{method:"POST",body:JSON.stringify(input)},token);}

export async function listAssets(token: string) {
  return request<{ assets: Asset[] }>("/assets", { method: "GET" }, token);
}

export async function createAsset(token: string, input: CreateAssetInput) {
  return request<{ asset: Asset }>(
    "/assets",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export async function getAsset(token: string, assetId: string) {
  return request<{ asset: Asset }>(
    `/assets/${encodeURIComponent(assetId)}`,
    { method: "GET" },
    token,
  );
}

export async function lockAsset(token: string, assetId: string) {
  return request<{ asset: Asset }>(
    `/assets/${encodeURIComponent(assetId)}/lock`,
    { method: "POST" },
    token,
  );
}

export async function unlockAsset(token: string, assetId: string) {
  return request<{ asset: Asset }>(
    `/assets/${encodeURIComponent(assetId)}/unlock`,
    { method: "POST" },
    token,
  );
}

export async function getAssetLocation(token: string, assetId: string) {
  return request<{ location: AssetLocation }>(
    `/assets/${encodeURIComponent(assetId)}/location`,
    { method: "GET" },
    token,
  );
}

export async function getAssetHealth(token: string, assetId: string) {
  return request<{ health: AssetHealth }>(
    `/assets/${encodeURIComponent(assetId)}/health`,
    { method: "GET" },
    token,
  );
}

export async function listPlans() {
  return request<{ plans: Plan[] }>("/plans", { method: "GET" });
}

export async function createSubscription(
  token: string,
  input: { assetId: string; planId: string },
) {
  return request<{ subscription: Subscription }>(
    "/subscriptions",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export async function getActiveSubscription(token: string) {
  return request<{ subscription: Subscription | null }>(
    "/subscriptions/active",
    { method: "GET" },
    token,
  );
}

export async function listTransactions(
  token: string,
  type?: TransactionType,
) {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  return request<{ transactions: Transaction[] }>(
    `/ledger${query}`,
    { method: "GET" },
    token,
  );
}

export async function getLedgerSummary(token: string) {
  return request<{ summary: LedgerSummary }>(
    "/ledger/summary",
    { method: "GET" },
    token,
  );
}

export async function createPayment(
  token: string,
  input: { amount: number; method: PaymentMethod },
) {
  return request<{ transactionId: string; payment: Payment }>(
    "/payments/create",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export async function getPayment(token: string, transactionId: string) {
  return request<{ payment: Payment }>(
    `/payments/${encodeURIComponent(transactionId)}`,
    { method: "GET" },
    token,
  );
}

export async function createSupportTicket(
  token: string,
  input: {
    type: SupportTicketType;
    assetId: string | null;
    description: string;
  },
) {
  return request<{ ticket: SupportTicket }>(
    "/support/tickets",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export async function listSupportTickets(token: string) {
  return request<{ tickets: SupportTicket[] }>(
    "/support/tickets",
    { method: "GET" },
    token,
  );
}
