CREATE TABLE IF NOT EXISTS tenant_preferences (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Europe/Madrid' CHECK (char_length(timezone) BETWEEN 3 AND 80),
  locale text NOT NULL DEFAULT 'es-ES' CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  email_notifications boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_preferences_tenant_isolation ON tenant_preferences;
CREATE POLICY tenant_preferences_tenant_isolation ON tenant_preferences
  USING (tenant_id::text = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant', true));
GRANT SELECT, INSERT, UPDATE ON tenant_preferences TO revenia_app;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_id_tenant_unique;
ALTER TABLE clients ADD CONSTRAINT clients_id_tenant_unique UNIQUE (id, tenant_id);
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_id_tenant_unique;
ALTER TABLE invoices ADD CONSTRAINT invoices_id_tenant_unique UNIQUE (id, tenant_id);

ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_client_id_fkey;
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_client_tenant_fkey;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_client_tenant_fkey
  FOREIGN KEY (client_id, tenant_id) REFERENCES clients(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_client_id_fkey;
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_client_tenant_fkey;
ALTER TABLE quotes ADD CONSTRAINT quotes_client_tenant_fkey
  FOREIGN KEY (client_id, tenant_id) REFERENCES clients(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_client_id_fkey;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_client_tenant_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_client_tenant_fkey
  FOREIGN KEY (client_id, tenant_id) REFERENCES clients(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_client_id_fkey;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_client_tenant_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_client_tenant_fkey
  FOREIGN KEY (client_id, tenant_id) REFERENCES clients(id, tenant_id) ON DELETE RESTRICT;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_invoice_tenant_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_invoice_tenant_fkey
  FOREIGN KEY (invoice_id, tenant_id) REFERENCES invoices(id, tenant_id) ON DELETE RESTRICT;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
