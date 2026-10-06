CREATE FUNCTION revenia_account_workspaces(p_token char(64))
RETURNS TABLE(tenant_id uuid,tenant_name text,role text,is_current boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
  SELECT t.id,t.name,m.role,t.id=s.tenant_id FROM revenia_session_lookup(p_token) s
  JOIN memberships m ON m.user_id=s.user_id JOIN tenants t ON t.id=m.tenant_id ORDER BY t.name,t.id
$$;

CREATE FUNCTION revenia_switch_workspace(p_token char(64),p_tenant uuid,p_new_token char(64))
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE principal record; new_role text;
BEGIN
  SELECT * INTO principal FROM revenia_session_lookup(p_token);
  IF principal IS NULL OR p_new_token !~ '^[a-f0-9]{64}$' OR p_token=p_new_token THEN RETURN NULL; END IF;
  PERFORM 1 FROM users WHERE id=principal.user_id FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM revenia_session_lookup(p_token)) THEN RETURN NULL; END IF;
  SELECT role INTO new_role FROM memberships WHERE user_id=principal.user_id AND tenant_id=p_tenant FOR SHARE;
  IF new_role IS NULL THEN RETURN NULL; END IF;
  UPDATE sessions SET revoked_at=now() WHERE token_hash=p_token AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO sessions(token_hash,user_id,tenant_id,role,session_version,expires_at)
  VALUES(p_new_token,principal.user_id,p_tenant,new_role,principal.session_version,principal.expires_at);
  RETURN principal.expires_at;
END $$;
REVOKE ALL ON FUNCTION revenia_account_workspaces(char(64)),revenia_switch_workspace(char(64),uuid,char(64)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_account_workspaces(char(64)),revenia_switch_workspace(char(64),uuid,char(64)) TO revenia_app;
