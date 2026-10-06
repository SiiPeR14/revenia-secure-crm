ALTER TABLE provider_connections ADD COLUMN version uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE engine_jobs ADD COLUMN connection_version uuid;
ALTER TABLE engine_jobs ADD COLUMN dispatch_started_at timestamptz;
ALTER TABLE webhook_receipts ADD COLUMN payload jsonb;
ALTER TABLE webhook_receipts ADD COLUMN processed_at timestamptz;
ALTER TABLE webhook_receipts ADD COLUMN error_code text;
CREATE INDEX webhook_pending ON webhook_receipts(tenant_id,received_at) WHERE processed_at IS NULL;
ALTER TABLE checkout_links ADD COLUMN provider_event_at timestamptz;
ALTER TABLE conversations ADD COLUMN sender_address text;
CREATE TABLE message_suppressions (
  tenant_id uuid NOT NULL REFERENCES tenants(id), channel text NOT NULL CHECK(channel IN ('Email','WhatsApp')),
  address text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,channel,address)
);
ALTER TABLE message_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_suppressions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON message_suppressions USING(tenant_id::text=current_setting('app.current_tenant',true)) WITH CHECK(tenant_id::text=current_setting('app.current_tenant',true));
GRANT SELECT,INSERT,UPDATE ON message_suppressions TO revenia_app;
