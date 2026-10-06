CREATE TABLE provider_connections (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider text NOT NULL CHECK(provider IN ('resend','whatsapp','stripe','openai')),
  credentials jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,provider)
);
CREATE TABLE engine_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN ('task','email','whatsapp','ai','checkout')),
  dedupe_key text NOT NULL CHECK(length(dedupe_key)<=240),
  payload jsonb NOT NULL DEFAULT '{}', result jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','uncertain','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
  first_attempt_at timestamptz, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,dedupe_key), UNIQUE(id,tenant_id)
);
CREATE INDEX engine_jobs_due ON engine_jobs(tenant_id,status,available_at);
CREATE TABLE contact_permissions (
  tenant_id uuid NOT NULL, client_id uuid NOT NULL,
  channel text NOT NULL CHECK(channel IN ('Email','WhatsApp')),
  allowed boolean NOT NULL DEFAULT false,
  evidence text NOT NULL CHECK(length(evidence) BETWEEN 5 AND 500),
  recorded_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,client_id,channel),
  FOREIGN KEY(client_id,tenant_id) REFERENCES clients(id,tenant_id)
);
CREATE TABLE webhook_receipts (
  tenant_id uuid NOT NULL REFERENCES tenants(id), provider text NOT NULL,
  event_id text NOT NULL, body_hash text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,provider,event_id)
);
CREATE TABLE engine_heartbeat (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id), last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE conversations ADD COLUMN delivery_status text NOT NULL DEFAULT 'draft'
  CHECK(delivery_status IN ('draft','queued','accepted','delivered','read','failed','uncertain'));
ALTER TABLE conversations ADD COLUMN provider_message_id text;
ALTER TABLE conversations ADD COLUMN provider_event_at timestamptz;
ALTER TABLE conversations ADD COLUMN subject text NOT NULL DEFAULT 'Seguimiento comercial';
ALTER TABLE conversations ADD COLUMN template_name text;
ALTER TABLE conversations ADD COLUMN template_language text;
ALTER TABLE conversations ADD COLUMN engine_job_id uuid;
ALTER TABLE conversations ADD CONSTRAINT conversation_engine_tenant_fk FOREIGN KEY(engine_job_id,tenant_id) REFERENCES engine_jobs(id,tenant_id);
CREATE UNIQUE INDEX conversations_provider_id ON conversations(tenant_id,channel,provider_message_id) WHERE provider_message_id IS NOT NULL;
ALTER TABLE automations ADD COLUMN trigger_type text CHECK(trigger_type IN ('quote_inactive','opportunity_inactive'));
ALTER TABLE automations ADD COLUMN delay_days integer NOT NULL DEFAULT 3 CHECK(delay_days BETWEEN 1 AND 365);
ALTER TABLE automations ADD COLUMN actor_id uuid REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN currency text NOT NULL DEFAULT 'eur' CHECK(currency IN ('eur','usd','gbp'));
CREATE TABLE checkout_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL, job_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents>0), currency text NOT NULL,
  provider_session_id text, checkout_url text, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','open','paid','expired','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(invoice_id,tenant_id) REFERENCES invoices(id,tenant_id),
  FOREIGN KEY(job_id,tenant_id) REFERENCES engine_jobs(id,tenant_id),
  UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,provider_session_id)
);
CREATE UNIQUE INDEX checkout_one_active_invoice ON checkout_links(tenant_id,invoice_id) WHERE state IN ('pending','open');
CREATE FUNCTION revenia_engine_authorized(p_actor uuid,p_kind text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.tenant_id::text=current_setting('app.current_tenant',true) AND u.id=p_actor AND u.disabled_at IS NULL
    AND ((p_kind='checkout' AND m.role IN ('OWNER')) OR (p_kind<>'checkout' AND m.role IN ('OWNER','ADMIN','MANAGER','SALES'))));
$$;
REVOKE ALL ON FUNCTION revenia_engine_authorized(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenia_engine_authorized(uuid,text) TO revenia_app;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['provider_connections','engine_jobs','contact_permissions','webhook_receipts','engine_heartbeat','checkout_links'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_scope ON %I USING (tenant_id::text=current_setting(''app.current_tenant'',true)) WITH CHECK (tenant_id::text=current_setting(''app.current_tenant'',true))',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO revenia_app',t);
  END LOOP;
END $$;
