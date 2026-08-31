-- Defense in depth: every audit insert is recursively sanitized in PostgreSQL,
-- including writes made directly inside a larger Prisma transaction.

CREATE OR REPLACE FUNCTION "sanitize_admin_audit_jsonb"(input JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  CASE jsonb_typeof(input)
    WHEN 'object' THEN
      SELECT COALESCE(
        jsonb_object_agg(
          entry.key,
          CASE
            WHEN entry.key ~* '(password|secret|token|csrf|backup.?code|authorization|cookie|credential)'
              THEN to_jsonb('[REDACTED]'::text)
            ELSE "sanitize_admin_audit_jsonb"(entry.value)
          END
        ),
        '{}'::jsonb
      )
      INTO result
      FROM jsonb_each(input) AS entry;
      RETURN result;
    WHEN 'array' THEN
      SELECT COALESCE(
        jsonb_agg("sanitize_admin_audit_jsonb"(entry.value)),
        '[]'::jsonb
      )
      INTO result
      FROM jsonb_array_elements(input) AS entry;
      RETURN result;
    ELSE
      RETURN input;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION "sanitize_admin_audit_insert"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."metadata" = "sanitize_admin_audit_jsonb"(NEW."metadata");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AdminAuditLog_sanitize_insert"
BEFORE INSERT ON "AdminAuditLog"
FOR EACH ROW EXECUTE FUNCTION "sanitize_admin_audit_insert"();
