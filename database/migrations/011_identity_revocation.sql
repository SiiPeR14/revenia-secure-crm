CREATE FUNCTION revenia_revoke_membership_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE sessions SET revoked_at=now() WHERE tenant_id=OLD.tenant_id AND user_id=OLD.user_id AND revoked_at IS NULL;
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE sessions SET revoked_at=now() WHERE tenant_id=OLD.tenant_id AND user_id=OLD.user_id AND revoked_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER membership_session_revocation AFTER UPDATE OF role OR DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION revenia_revoke_membership_sessions();

CREATE FUNCTION revenia_revoke_identity_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR (NEW.disabled_at IS NOT NULL AND NEW.disabled_at IS DISTINCT FROM OLD.disabled_at) THEN
    UPDATE sessions SET revoked_at=now() WHERE user_id=NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER identity_session_revocation AFTER UPDATE OF password_hash,disabled_at ON users FOR EACH ROW EXECUTE FUNCTION revenia_revoke_identity_sessions();
REVOKE ALL ON FUNCTION revenia_revoke_membership_sessions(),revenia_revoke_identity_sessions() FROM PUBLIC;
