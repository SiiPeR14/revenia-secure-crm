CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  company text NOT NULL CHECK (char_length(company) BETWEEN 2 AND 160),
  email text NOT NULL CHECK (email = lower(email) AND char_length(email) <= 200),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  status text NOT NULL DEFAULT 'Potencial' CHECK (status IN ('Potencial','Activo','Inactivo')),
  value numeric(14,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  stage text NOT NULL CHECK (stage IN ('Prospección','Calificación','Propuesta','Negociación','Ganada','Perdida')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  probability integer NOT NULL CHECK (probability BETWEEN 0 AND 100),
  next_action_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  number text NOT NULL CHECK (char_length(number) BETWEEN 1 AND 50),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL CHECK (status IN ('Borrador','Enviado','Visto','Seguimiento','Aceptado','Rechazado')),
  issued_at date NOT NULL,
  expires_at date NOT NULL CHECK (expires_at >= issued_at),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  channel text NOT NULL CHECK (channel IN ('Tarea','Llamada','Email','WhatsApp')),
  status text NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','Completada')),
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('Email','WhatsApp')),
  direction text NOT NULL CHECK (direction IN ('Entrada','Salida')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  trigger_name text NOT NULL CHECK (char_length(trigger_name) BETWEEN 2 AND 160),
  enabled boolean NOT NULL DEFAULT true,
  executions integer NOT NULL DEFAULT 0 CHECK (executions >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 2 AND 80),
  status text NOT NULL CHECK (status IN ('Disponible','Conectado')),
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  reference text NOT NULL CHECK (char_length(reference) BETWEEN 2 AND 80),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL CHECK (status IN ('Pendiente','Completado','Fallido')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  detail text NOT NULL CHECK (char_length(detail) BETWEEN 2 AND 500),
  href text NOT NULL DEFAULT '/dashboard' CHECK (href LIKE '/%'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['clients','opportunities','quotes','tasks','conversations','automations','integrations','payments','notifications']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_isolation', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id::text = current_setting(''app.current_tenant'', true)) WITH CHECK (tenant_id::text = current_setting(''app.current_tenant'', true))',
      table_name || '_tenant_isolation', table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO revenia_app', table_name);
  END LOOP;
END
$$;

GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO revenia_app;

CREATE INDEX IF NOT EXISTS clients_tenant_name_idx ON clients(tenant_id, name);
CREATE INDEX IF NOT EXISTS opportunities_tenant_stage_idx ON opportunities(tenant_id, stage, next_action_at);
CREATE INDEX IF NOT EXISTS quotes_tenant_status_idx ON quotes(tenant_id, status, expires_at);
CREATE INDEX IF NOT EXISTS tasks_tenant_status_idx ON tasks(tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS conversations_tenant_created_idx ON conversations(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_tenant_unread_idx ON notifications(tenant_id, read_at, created_at DESC);
