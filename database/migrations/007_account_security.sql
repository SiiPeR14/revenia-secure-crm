CREATE OR REPLACE FUNCTION revenia_session_lookup(p_token_hash char(64))
RETURNS TABLE(user_id uuid,tenant_id uuid,role text,session_version integer,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
  SELECT s.user_id,s.tenant_id,s.role,s.session_version,s.expires_at FROM sessions s
  JOIN users u ON u.id=s.user_id
  JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id AND m.role=s.role
  WHERE s.token_hash=p_token_hash AND s.revoked_at IS NULL AND s.expires_at>now()
    AND u.disabled_at IS NULL AND u.session_version=s.session_version LIMIT 1
$$;

CREATE FUNCTION revenia_account_profile(p_token_hash char(64))
RETURNS TABLE(user_id uuid,email text,display_name text,password_hash text,tenant_name text)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
  SELECT u.id,u.email,u.display_name,u.password_hash,t.name
  FROM revenia_session_lookup(p_token_hash) s JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=s.tenant_id
$$;

CREATE FUNCTION revenia_account_sessions(p_token_hash char(64))
RETURNS TABLE(id uuid,tenant_name text,role text,created_at timestamptz,expires_at timestamptz,is_current boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
  SELECT s.id,t.name,s.role,s.created_at,s.expires_at,s.token_hash=p_token_hash
  FROM revenia_session_lookup(p_token_hash) principal JOIN sessions s ON s.user_id=principal.user_id
  JOIN tenants t ON t.id=s.tenant_id JOIN memberships m ON m.tenant_id=s.tenant_id AND m.user_id=s.user_id AND m.role=s.role
  WHERE s.revoked_at IS NULL AND s.expires_at>now() AND s.session_version=principal.session_version
  ORDER BY s.created_at DESC LIMIT 100
$$;

CREATE FUNCTION revenia_account_password(p_token_hash char(64),p_expected_hash text,p_new_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE principal record;
BEGIN
  SELECT * INTO principal FROM revenia_session_lookup(p_token_hash);
  IF principal IS NULL OR p_new_hash !~ '^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$' THEN RETURN false; END IF;
  PERFORM 1 FROM users WHERE id=principal.user_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM revenia_session_lookup(p_token_hash)) THEN RETURN false; END IF;
  UPDATE users SET password_hash=p_new_hash,session_version=session_version+1 WHERE id=principal.user_id AND password_hash=p_expected_hash;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE sessions SET revoked_at=now() WHERE user_id=principal.user_id AND revoked_at IS NULL;
  RETURN true;
END $$;

CREATE FUNCTION revenia_account_revoke_others(p_token_hash char(64),p_expected_hash text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE principal record; affected integer;
BEGIN
  SELECT s.* INTO principal FROM revenia_session_lookup(p_token_hash) s JOIN users u ON u.id=s.user_id WHERE u.password_hash=p_expected_hash;
  IF principal IS NULL THEN RETURN -1; END IF;
  UPDATE sessions SET revoked_at=now() WHERE user_id=principal.user_id AND token_hash<>p_token_hash AND revoked_at IS NULL;
  GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END $$;

CREATE FUNCTION revenia_team_members(p_token_hash char(64))
RETURNS TABLE(user_id uuid,email text,display_name text,role text,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
  SELECT u.id,u.email,u.display_name,m.role,m.created_at FROM revenia_session_lookup(p_token_hash) s
  JOIN memberships m ON m.tenant_id=s.tenant_id JOIN users u ON u.id=m.user_id
  WHERE s.role IN ('OWNER','ADMIN') ORDER BY m.created_at,u.id
$$;

CREATE FUNCTION revenia_team_update(p_token_hash char(64),p_expected_hash text,p_target uuid,p_role text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE principal record; target_role text;
BEGIN
  SELECT s.* INTO principal FROM revenia_session_lookup(p_token_hash) s JOIN users u ON u.id=s.user_id WHERE s.role='OWNER' AND u.password_hash=p_expected_hash;
  IF principal IS NULL OR principal.user_id=p_target OR (p_role IS NOT NULL AND p_role NOT IN ('ADMIN','MANAGER','SALES','EMPLOYEE','VIEWER')) THEN RETURN false; END IF;
  PERFORM 1 FROM tenants WHERE id=principal.tenant_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM revenia_session_lookup(p_token_hash) WHERE role='OWNER') THEN RETURN false; END IF;
  SELECT role INTO target_role FROM memberships WHERE tenant_id=principal.tenant_id AND user_id=p_target FOR UPDATE;
  IF target_role IS NULL OR target_role='OWNER' THEN RETURN false; END IF;
  IF p_role IS NULL THEN DELETE FROM memberships WHERE tenant_id=principal.tenant_id AND user_id=p_target;
  ELSE UPDATE memberships SET role=p_role WHERE tenant_id=principal.tenant_id AND user_id=p_target; END IF;
  UPDATE sessions SET revoked_at=now() WHERE tenant_id=principal.tenant_id AND user_id=p_target AND revoked_at IS NULL;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION revenia_account_profile(char(64)),revenia_account_sessions(char(64)),revenia_account_password(char(64),text,text),revenia_account_revoke_others(char(64),text),revenia_team_members(char(64)),revenia_team_update(char(64),text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_account_profile(char(64)),revenia_account_sessions(char(64)),revenia_account_password(char(64),text,text),revenia_account_revoke_others(char(64),text),revenia_team_members(char(64)),revenia_team_update(char(64),text,uuid,text) TO revenia_app;
