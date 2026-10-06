CREATE TABLE team_invitations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),
  email text NOT NULL CHECK(email=lower(email) AND length(email)<=200),
  role text NOT NULL CHECK(role IN ('ADMIN','MANAGER','SALES','EMPLOYEE','VIEWER')),
  token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '72 hours',revoked_at timestamptz,accepted_at timestamptz,
  accepted_by uuid REFERENCES users(id)
);
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON team_invitations USING(tenant_id::text=current_setting('app.current_tenant',true)) WITH CHECK(tenant_id::text=current_setting('app.current_tenant',true));
CREATE INDEX team_invitation_pending ON team_invitations(tenant_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE FUNCTION revenia_invite_create(p_session char(64),p_expected text,p_email text,p_role text,p_token char(64))
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE principal record; invitation uuid;
BEGIN
  SELECT s.* INTO principal FROM revenia_session_lookup(p_session) s JOIN users u ON u.id=s.user_id WHERE s.role='OWNER' AND u.password_hash=p_expected;
  IF principal IS NULL OR p_email<>lower(p_email) OR length(p_email)>200 OR p_role NOT IN ('ADMIN','MANAGER','SALES','EMPLOYEE','VIEWER') THEN RETURN NULL; END IF;
  PERFORM 1 FROM tenants WHERE id=principal.tenant_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=principal.tenant_id AND u.email=p_email) THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM team_invitations WHERE tenant_id=principal.tenant_id AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now())>=100 THEN RETURN NULL; END IF;
  UPDATE team_invitations SET revoked_at=now() WHERE tenant_id=principal.tenant_id AND email=p_email AND accepted_at IS NULL AND revoked_at IS NULL;
  INSERT INTO team_invitations(tenant_id,email,role,token_hash,created_by) VALUES(principal.tenant_id,p_email,p_role,p_token,principal.user_id) RETURNING id INTO invitation;
  RETURN invitation;
END $$;

CREATE FUNCTION revenia_invite_list(p_session char(64))
RETURNS TABLE(id uuid,email text,role text,created_at timestamptz,expires_at timestamptz,revoked_at timestamptz,accepted_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
  SELECT i.id,i.email,i.role,i.created_at,i.expires_at,i.revoked_at,i.accepted_at
  FROM revenia_session_lookup(p_session) s JOIN team_invitations i ON i.tenant_id=s.tenant_id
  WHERE s.role IN ('OWNER','ADMIN') ORDER BY i.created_at DESC LIMIT 50
$$;

CREATE FUNCTION revenia_invite_revoke(p_session char(64),p_expected text,p_invitation uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE principal record;
BEGIN
  SELECT s.* INTO principal FROM revenia_session_lookup(p_session) s JOIN users u ON u.id=s.user_id WHERE s.role='OWNER' AND u.password_hash=p_expected;
  IF principal IS NULL THEN RETURN false; END IF;
  UPDATE team_invitations SET revoked_at=now() WHERE id=p_invitation AND tenant_id=principal.tenant_id AND accepted_at IS NULL AND revoked_at IS NULL;
  RETURN FOUND;
END $$;

CREATE FUNCTION revenia_invite_lookup(p_token char(64))
RETURNS TABLE(id uuid,tenant_id uuid,email text,role text,tenant_name text,existing_user uuid,password_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
  SELECT i.id,i.tenant_id,i.email,i.role,t.name,u.id,u.password_hash FROM team_invitations i
  JOIN tenants t ON t.id=i.tenant_id LEFT JOIN users u ON u.email=i.email
  WHERE i.token_hash=p_token AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
    AND (u.id IS NULL OR u.disabled_at IS NULL)
    AND EXISTS(SELECT 1 FROM memberships m JOIN users inviter ON inviter.id=m.user_id WHERE m.tenant_id=i.tenant_id AND m.user_id=i.created_by AND m.role='OWNER' AND inviter.disabled_at IS NULL)
$$;

CREATE FUNCTION revenia_invite_accept(p_token char(64),p_expected text,p_name text,p_new_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE invitation record; account_id uuid; account_hash text;
BEGIN
  PERFORM 1 FROM team_invitations WHERE token_hash=p_token FOR UPDATE;
  SELECT * INTO invitation FROM revenia_invite_lookup(p_token);
  IF invitation IS NULL OR length(p_name)<2 OR length(p_name)>120 THEN RETURN NULL; END IF;
  IF invitation.existing_user IS NOT NULL THEN
    SELECT id,password_hash INTO account_id,account_hash FROM users WHERE id=invitation.existing_user AND disabled_at IS NULL FOR UPDATE;
    IF account_id IS NULL OR p_expected IS NULL OR account_hash<>p_expected THEN RETURN NULL; END IF;
  ELSE
    IF p_expected IS NOT NULL OR p_new_hash IS NULL OR p_new_hash !~ '^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$' THEN RETURN NULL; END IF;
    INSERT INTO users(id,email,display_name,password_hash) VALUES(gen_random_uuid(),invitation.email,p_name,p_new_hash) ON CONFLICT(email) DO NOTHING RETURNING id INTO account_id;
    IF account_id IS NULL THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO memberships(tenant_id,user_id,role) VALUES(invitation.tenant_id,account_id,invitation.role) ON CONFLICT DO NOTHING;
  UPDATE team_invitations SET accepted_at=now(),accepted_by=account_id WHERE id=invitation.id;
  RETURN account_id;
END $$;

REVOKE ALL ON FUNCTION revenia_invite_create(char(64),text,text,text,char(64)),revenia_invite_list(char(64)),revenia_invite_revoke(char(64),text,uuid),revenia_invite_lookup(char(64)),revenia_invite_accept(char(64),text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_invite_create(char(64),text,text,text,char(64)),revenia_invite_list(char(64)),revenia_invite_revoke(char(64),text,uuid),revenia_invite_lookup(char(64)),revenia_invite_accept(char(64),text,text,text) TO revenia_app;
