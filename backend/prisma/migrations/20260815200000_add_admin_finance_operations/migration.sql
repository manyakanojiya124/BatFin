-- Admin Phase 5: fixed-precision finance records, provider lookup, and immutable
-- adjustment/refund linkage.

-- AlterTable
ALTER TABLE "Transaction"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2)
    USING ROUND("amount"::numeric, 2),
  ADD COLUMN "providerReference" TEXT,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN "originalTransactionId" TEXT,
  ADD COLUMN "createdByAdminId" TEXT,
  ADD COLUMN "adminReason" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Preserve the original write timestamp for existing immutable ledger rows.
UPDATE "Transaction"
SET "updatedAt" = "transactionDate"
WHERE "updatedAt" IS NULL;
ALTER TABLE "Transaction" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Promote legacy payment details that were previously embedded in descriptions.
UPDATE "Transaction"
SET
  "paymentMethod" = substring("description" from 'via (UPI|CARD|NET_BANKING)'),
  "providerReference" = upper(substring("description" from 'Ref ([A-Za-z0-9-]+)$')),
  "source" = 'customer_payment'
WHERE
  "type" = 'PAYMENT'
  AND "direction" = 'CREDIT';

-- Existing standalone refunds predate original-payment linkage and remain marked
-- as system entries. All new admin refunds are constrained below.

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_providerReference_key"
  ON "Transaction"("providerReference");
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key"
  ON "Transaction"("idempotencyKey");
CREATE INDEX "Transaction_userId_transactionDate_idx"
  ON "Transaction"("userId", "transactionDate");
CREATE INDEX "Transaction_type_status_transactionDate_idx"
  ON "Transaction"("type", "status", "transactionDate");
CREATE INDEX "Transaction_originalTransactionId_status_idx"
  ON "Transaction"("originalTransactionId", "status");
CREATE INDEX "Transaction_createdByAdminId_transactionDate_idx"
  ON "Transaction"("createdByAdminId", "transactionDate");

-- AddForeignKey
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_originalTransactionId_fkey"
  FOREIGN KEY ("originalTransactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants backstop application validation.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_amount_positive_check"
    CHECK ("amount" > 0),
  ADD CONSTRAINT "Transaction_direction_check"
    CHECK ("direction" IN ('CREDIT', 'DEBIT')),
  ADD CONSTRAINT "Transaction_status_check"
    CHECK ("status" IN ('pending', 'completed', 'failed')),
  ADD CONSTRAINT "Transaction_payment_method_check"
    CHECK ("paymentMethod" IS NULL OR "paymentMethod" IN ('UPI', 'CARD', 'NET_BANKING')),
  ADD CONSTRAINT "Transaction_source_check"
    CHECK ("source" IN ('system', 'customer_payment', 'admin_adjustment', 'admin_refund')),
  ADD CONSTRAINT "Transaction_not_self_reversal_check"
    CHECK ("originalTransactionId" IS NULL OR "originalTransactionId" <> "id"),
  ADD CONSTRAINT "Transaction_admin_action_actor_check"
    CHECK (
      "source" NOT IN ('admin_adjustment', 'admin_refund')
      OR (
        "createdByAdminId" IS NOT NULL
        AND "adminReason" IS NOT NULL
        AND char_length("adminReason") BETWEEN 10 AND 500
        AND "idempotencyKey" IS NOT NULL
        AND char_length("idempotencyKey") BETWEEN 16 AND 100
      )
    ),
  ADD CONSTRAINT "Transaction_admin_adjustment_shape_check"
    CHECK (
      "source" <> 'admin_adjustment'
      OR (
        "type" = 'ADJUSTMENT'
        AND "status" = 'completed'
        AND "originalTransactionId" IS NULL
        AND "providerReference" IS NULL
        AND "paymentMethod" IS NULL
      )
    ),
  ADD CONSTRAINT "Transaction_admin_refund_shape_check"
    CHECK (
      "source" <> 'admin_refund'
      OR (
        "type" = 'REFUND'
        AND "direction" = 'DEBIT'
        AND "status" = 'completed'
        AND "originalTransactionId" IS NOT NULL
        AND "providerReference" IS NOT NULL
      )
    );
