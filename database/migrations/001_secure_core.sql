CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'revenia_app') THEN
    CREATE ROLE revenia_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,50}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER','ADMIN','MANAGER','SALES','EMPLOYEE','VIEWER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER','ADMIN','MANAGER','SALES','EMPLOYEE','VIEWER')),
  session_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_active_token_idx ON sessions(token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  number text NOT NULL CHECK (char_length(number) BETWEEN 1 AND 50),
  customer text NOT NULL CHECK (char_length(customer) BETWEEN 1 AND 160),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL CHECK (status IN ('Pagada','Pendiente','Vencida','En revisión','Borrador','Cancelada')),
  issued_at date NOT NULL,
  due_at date NOT NULL CHECK (due_at >= issued_at),
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX IF NOT EXISTS invoices_tenant_status_idx ON invoices(tenant_id, status, due_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 3 AND 100),
  resource_type text NOT NULL CHECK (char_length(resource_type) BETWEEN 2 AND 80),
  resource_id text NOT NULL CHECK (char_length(resource_id) BETWEEN 1 AND 160),
  previous_hash char(64) NOT NULL,
  hash char(64) NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_created_idx ON audit_logs(tenant_id, created_at DESC);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_tenant_isolation ON memberships;
CREATE POLICY memberships_tenant_isolation ON memberships
  USING (tenant_id::text = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices;
CREATE POLICY invoices_tenant_isolation ON invoices
  USING (tenant_id::text = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  USING (tenant_id::text = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant', true));

CREATE OR REPLACE FUNCTION revenia_login_lookup(p_email text)
RETURNS TABLE(user_id uuid, email text, password_hash text, session_version integer, tenant_id uuid, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT u.id, u.email, u.password_hash, u.session_version, m.tenant_id, m.role
  FROM users u
  JOIN memberships m ON m.user_id = u.id
  WHERE u.email = lower(p_email) AND u.disabled_at IS NULL
  ORDER BY m.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION revenia_create_session(
  p_token_hash char(64), p_user_id uuid, p_tenant_id uuid, p_role text,
  p_session_version integer, p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    JOIN memberships m ON m.user_id = u.id AND m.tenant_id = p_tenant_id
    WHERE u.id = p_user_id AND u.disabled_at IS NULL
      AND u.session_version = p_session_version AND m.role = p_role
  ) THEN
    RAISE EXCEPTION 'invalid session principal';
  END IF;
  INSERT INTO sessions(token_hash, user_id, tenant_id, role, session_version, expires_at)
  VALUES (p_token_hash, p_user_id, p_tenant_id, p_role, p_session_version, p_expires_at);
END
$$;

CREATE OR REPLACE FUNCTION revenia_session_lookup(p_token_hash char(64))
RETURNS TABLE(user_id uuid, tenant_id uuid, role text, session_version integer, expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT s.user_id, s.tenant_id, s.role, s.session_version, s.expires_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash AND s.revoked_at IS NULL
    AND s.expires_at > now() AND u.disabled_at IS NULL
    AND u.session_version = s.session_version
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION revenia_revoke_session(p_token_hash char(64))
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE sessions SET revoked_at = now() WHERE token_hash = p_token_hash AND revoked_at IS NULL
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM revenia_app;
REVOKE ALL ON FUNCTION revenia_login_lookup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION revenia_create_session(char(64),uuid,uuid,text,integer,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION revenia_session_lookup(char(64)) FROM PUBLIC;
REVOKE ALL ON FUNCTION revenia_revoke_session(char(64)) FROM PUBLIC;

GRANT CONNECT ON DATABASE revenia TO revenia_app;
GRANT USAGE ON SCHEMA public TO revenia_app;
GRANT EXECUTE ON FUNCTION revenia_login_lookup(text) TO revenia_app;
GRANT EXECUTE ON FUNCTION revenia_create_session(char(64),uuid,uuid,text,integer,timestamptz) TO revenia_app;
GRANT EXECUTE ON FUNCTION revenia_session_lookup(char(64)) TO revenia_app;
GRANT EXECUTE ON FUNCTION revenia_revoke_session(char(64)) TO revenia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO revenia_app;
GRANT SELECT, INSERT ON audit_logs TO revenia_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM revenia_app;
