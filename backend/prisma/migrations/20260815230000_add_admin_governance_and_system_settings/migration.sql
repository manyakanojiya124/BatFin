-- Admin Phase 6: administrator governance, attributed session revocation,
-- enforceable platform settings, and database-level audit immutability.

-- AlterTable: administrator invitation and credential-reset attribution.
ALTER TABLE "AdminUser"
  ADD COLUMN "invitedByAdminId" TEXT,
  ADD COLUMN "invitedAt" TIMESTAMP(3),
  ADD COLUMN "credentialsResetAt" TIMESTAMP(3);

UPDATE "AdminUser"
SET "invitedAt" = "createdAt"
WHERE "invitedAt" IS NULL;

-- AlterTable: preserve who revoked a session and why without ever storing tokens.
ALTER TABLE "AdminSession"
  ADD COLUMN "revokedByAdminId" TEXT,
  ADD COLUMN "revocationReason" TEXT;

UPDATE "AdminSession"
SET "revocationReason" = 'Legacy session revocation before governance tracking'
WHERE "revokedAt" IS NOT NULL AND "revocationReason" IS NULL;

-- CreateTable: one strongly typed platform settings record.
CREATE TABLE "SystemSetting" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "supportEmail" TEXT,
  "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
  "customerRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "customerOtpLoginEnabled" BOOLEAN NOT NULL DEFAULT true,
  "walletRechargeEnabled" BOOLEAN NOT NULL DEFAULT true,
  "maxRechargeAmount" DECIMAL(14,2) NOT NULL DEFAULT 100000.00,
  "updatedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SystemSetting" (
  "id",
  "supportEmail",
  "maintenanceMode",
  "customerRegistrationEnabled",
  "customerOtpLoginEnabled",
  "walletRechargeEnabled",
  "maxRechargeAmount",
  "updatedAt"
) VALUES (
  'platform',
  'support@batfin.local',
  false,
  true,
  true,
  true,
  100000.00,
  CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AdminUser_role_status_idx" ON "AdminUser"("role", "status");
CREATE INDEX "AdminUser_invitedByAdminId_invitedAt_idx" ON "AdminUser"("invitedByAdminId", "invitedAt");
CREATE INDEX "AdminSession_revokedAt_expiresAt_idx" ON "AdminSession"("revokedAt", "expiresAt");
CREATE INDEX "AdminSession_revokedByAdminId_revokedAt_idx" ON "AdminSession"("revokedByAdminId", "revokedAt");
CREATE INDEX "SystemSetting_updatedByAdminId_updatedAt_idx" ON "SystemSetting"("updatedByAdminId", "updatedAt");

-- AddForeignKey
ALTER TABLE "AdminUser"
  ADD CONSTRAINT "AdminUser_invitedByAdminId_fkey"
  FOREIGN KEY ("invitedByAdminId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminSession"
  ADD CONSTRAINT "AdminSession_revokedByAdminId_fkey"
  FOREIGN KEY ("revokedByAdminId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SystemSetting"
  ADD CONSTRAINT "SystemSetting_updatedByAdminId_fkey"
  FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Database-level governance invariants.
ALTER TABLE "AdminUser"
  ADD CONSTRAINT "AdminUser_role_check"
    CHECK ("role" IN ('SUPPORT_AGENT', 'OPERATIONS_MANAGER', 'FINANCE_MANAGER', 'AUDITOR', 'SUPER_ADMIN')),
  ADD CONSTRAINT "AdminUser_status_check"
    CHECK ("status" IN ('invited', 'active', 'suspended', 'disabled'));

ALTER TABLE "AdminSession"
  ADD CONSTRAINT "AdminSession_revocation_shape_check"
    CHECK (
      "revokedAt" IS NOT NULL
      OR ("revokedByAdminId" IS NULL AND "revocationReason" IS NULL)
    ),
  ADD CONSTRAINT "AdminSession_revocation_reason_length_check"
    CHECK (
      "revocationReason" IS NULL
      OR char_length("revocationReason") BETWEEN 10 AND 500
    );

ALTER TABLE "SystemSetting"
  ADD CONSTRAINT "SystemSetting_singleton_check"
    CHECK ("id" = 'platform'),
  ADD CONSTRAINT "SystemSetting_max_recharge_check"
    CHECK ("maxRechargeAmount" BETWEEN 1.00 AND 500000.00);

-- Audit records are append-only at the database layer. Even accidental ORM calls
-- cannot update or delete privileged-operation history.
CREATE OR REPLACE FUNCTION "prevent_admin_audit_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AdminAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AdminAuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AdminAuditLog"
FOR EACH ROW EXECUTE FUNCTION "prevent_admin_audit_mutation"();
