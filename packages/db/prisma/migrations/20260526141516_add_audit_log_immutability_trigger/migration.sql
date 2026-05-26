-- Audit log immutability (Build_Prompt §10.4).
-- The audit log is append-only at the database level. UPDATE and DELETE
-- raise an exception. INSERT is unaffected. TRUNCATE (DDL) bypasses this
-- row-level trigger by design — TRUNCATE is an explicit, audited admin
-- operation, not a row-mutation.

CREATE OR REPLACE FUNCTION audit_log_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable — % is not permitted', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_reject_mutation();
