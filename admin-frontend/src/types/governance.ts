import type { AdminRole } from "./admin";

export type AdminAccountStatus = "invited" | "active" | "suspended" | "disabled";
export type AdminSessionState = "active" | "revoked" | "expired";

export interface AuditActor {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminAccountStatus;
}

export interface AdminAuditEntry {
  id: string;
  adminUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
  adminUser: AuditActor | null;
}

export interface AdminAuditSummary {
  total: number;
  last24Hours: number;
  rejectedLast24Hours: number;
  activeAdminsLast30Days: number;
  generatedAt: string;
}

export interface AdminAuditFacets {
  actions: Array<{ value: string; count: number }>;
  resourceTypes: Array<{ value: string; count: number }>;
  admins: AuditActor[];
}

export interface AdminAuditFilters {
  q?: string;
  action?: string;
  resourceType?: string;
  adminUserId?: string;
  success?: "true" | "false" | "";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface ManagedAdmin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminAccountStatus;
  mustChangePassword: boolean;
  totpVerifiedAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
  invitedByAdminId: string | null;
  invitedAt: string | null;
  credentialsResetAt: string | null;
  createdAt: string;
  updatedAt: string;
  invitedBy: { id: string; name: string; email: string } | null;
  permissions: string[];
  activeSessionCount?: number;
  unusedBackupCodeCount?: number;
  sessions?: AdminManagedSession[];
  backupCodes?: { total: number; unused: number; used: number };
}

export interface AdminSummary {
  total: number;
  active: number;
  invited: number;
  suspended: number;
  disabled: number;
  activeSessions: number;
  lockedAccounts: number;
  roles: Partial<Record<AdminRole, number>>;
}

export interface AdminManagedSession {
  id: string;
  adminUserId: string;
  expiresAt: string;
  stepUpVerifiedAt: string | null;
  lastSeenAt: string;
  revokedAt: string | null;
  revokedByAdminId: string | null;
  revocationReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  state: AdminSessionState;
  current: boolean;
  adminUser: {
    id: string;
    name: string;
    email: string;
    role: AdminRole;
    status: AdminAccountStatus;
  };
  revokedBy: { id: string; name: string; email: string } | null;
}

export interface AdminSessionSummary {
  active: number;
  revoked: number;
  expired: number;
  total: number;
}

export interface PlatformSetting {
  id: string;
  supportEmail: string | null;
  maintenanceMode: boolean;
  customerRegistrationEnabled: boolean;
  customerOtpLoginEnabled: boolean;
  walletRechargeEnabled: boolean;
  maxRechargeAmount: number;
  updatedByAdminId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SecurityBaseline {
  adminSessionHours: number;
  stepUpWindowMinutes: number;
  loginChallengeMinutes: number;
  maximumLoginFailures: number;
  accountLockMinutes: number;
  passwordMinimumCharacters: number;
  passwordMaximumCharacters: number;
  totpDigits: number;
  totpPeriodSeconds: number;
  totpAllowedClockWindows: number;
  backupCodeCount: number;
  adminCookieHttpOnly: boolean;
  adminCookieSameSite: string;
  adminCookieSecureInProduction: boolean;
  auditDatabaseAppendOnly: boolean;
  securityHeadersEnabled: boolean;
  rateLimitingEnabled: boolean;
}
