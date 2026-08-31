export const ADMIN_ROLES = [
  "SUPPORT_AGENT",
  "OPERATIONS_MANAGER",
  "FINANCE_MANAGER",
  "AUDITOR",
  "SUPER_ADMIN",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "dashboard.read",
  "customers.read",
  "customers.update",
  "inventory.read",
  "inventory.create",
  "inventory.assign",
  "inventory.verify_qr",
  "tickets.read",
  "tickets.update",
  "payments.read",
  "payments.export",
  "payments.adjust",
  "payments.refund",
  "audit.read",
  "audit.export",
  "admins.read",
  "admins.manage",
  "system.configure",
  "master_data.read",
  "master_data.import",
  "master_data.export",
  "analytics.read",
  "analytics.create",
  "analytics.manage",
  "portfolio.read",
  "portfolio.import",
  "portfolio.manage",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const allPermissions = [...ADMIN_PERMISSIONS];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  SUPPORT_AGENT: [
    "dashboard.read",
    "customers.read",
    "inventory.read",
    "tickets.read",
    "tickets.update",
    "portfolio.read",
  ],
  OPERATIONS_MANAGER: [
    "dashboard.read",
    "customers.read",
    "customers.update",
    "inventory.read",
    "inventory.create",
    "inventory.assign",
    "inventory.verify_qr",
    "tickets.read",
    "tickets.update",
    "portfolio.read",
    "portfolio.manage",
  ],
  FINANCE_MANAGER: [
    "dashboard.read",
    "customers.read",
    "payments.read",
    "payments.export",
    "payments.adjust",
    "payments.refund",
    "portfolio.read",
  ],
  AUDITOR: [
    "dashboard.read",
    "customers.read",
    "inventory.read",
    "tickets.read",
    "payments.read",
    "audit.read",
    "audit.export",
    "admins.read",
    "portfolio.read",
  ],
  SUPER_ADMIN: allPermissions,
};
