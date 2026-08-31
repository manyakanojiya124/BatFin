export type AdminRole =
  | "SUPPORT_AGENT"
  | "OPERATIONS_MANAGER"
  | "FINANCE_MANAGER"
  | "AUDITOR"
  | "SUPER_ADMIN";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLoginChallenge {
  challengeToken: string;
  expiresAt: string;
  mfaSetupRequired: boolean;
  totpSetup?: {
    secret: string;
    otpauthUri: string;
  };
}

export interface AdminSessionResult {
  admin: AdminUser;
  csrfToken: string;
  sessionExpiresAt: string;
  backupCodes?: string[];
}

export interface AdminAccessSummary {
  role: AdminRole;
  permissions: string[];
  operationalModulesEnabled: boolean;
  enabledModules?: string[];
}
